#!/usr/bin/env python3
"""Re-run the CONF-3 mutation evidence recorded in CONFORMANCE.md.

Each mutation is one exact edit to the source, applied, run against the specs that should catch it,
and restored — the file is always rewritten from its original bytes, even on failure. A mutation whose
anchor is missing is reported as NOT APPLIED rather than silently passing: an edit that changes nothing
proves nothing.

    python3 _dev_/mutations.py
"""
import json, os, re, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

ANSI = re.compile(r'\x1b\[[0-9;]*m')

def _parse(out):
    m = re.search(r'Tests\s+(?:(\d+) failed \| )?(\d+) passed \((\d+)\)', out)
    if m: return f'{m.group(1) or 0} failed of {m.group(3)}'
    m = re.search(r'Tests\s+(\d+) failed \((\d+)\)', out)
    return f'{m.group(1)} failed of {m.group(2)}' if m else None

def vitest(specs):
    """Run specs; return (result, notes). An unparsed run is retried once and RECORDED, never hidden."""
    notes = []
    for attempt in (1, 2):
        r = subprocess.run(['npx', 'vitest', 'run', *specs], capture_output=True, text=True)
        out = ANSI.sub('', r.stdout + r.stderr)
        res = _parse(out)
        if res: return res, notes
        tail = ' / '.join(l.strip() for l in out.strip().splitlines()[-3:])
        notes.append(f'attempt {attempt} unparsed (exit {r.returncode}): {tail[:160]}')
    return f'UNPARSED (exit {r.returncode})', notes

PIPE, WE, WG, SVC = 'src/lib/translate.pipe.ts', 'src/lib/write-enabled.ts', 'src/lib/write-grant.ts', 'src/lib/langsys.service.ts'
S = lambda n: f'src/lib/{n}.spec.ts'
MUTATIONS = [
    ('BIND-5/HINT-4', 'drop location.href from the memo key', PIPE, "            paramsKey === this.lastParamsKey &&\n            href === this.lastHref\n", "            paramsKey === this.lastParamsKey\n", [S('translate.pipe'), S('navigation-reentry')]),
    ('BIND-5', 'over-invalidate: href always unique', PIPE, "const href = typeof location === 'undefined' ? '' : location.href;", "const href = String(Math.random());", [S('translate.pipe')]),
    ('BIND-1', 'subscribe eagerly instead of after first render', WE, "afterNextRender(() => {", "((fn: () => void) => fn())(() => {", [S('write-enabled')]),
    ('BIND-1', 'write the signal outside the zone', WE, "zone.run(() => out.set(next))", "out.set(next)", [S('write-enabled')]),
    ('BIND-1', 'delete the server-platform early return (expected 0: redundant with afterNextRender)', WE, "    if (!isPlatformBrowser(inject(PLATFORM_ID))) return out.asReadonly();\n", "", [S('write-enabled')]),
    ('GATE-8/BIND-2', 'collapse undefined to false', WE, "zone.run(() => out.set(next))", "zone.run(() => out.set(next ?? false))", [S('write-enabled')]),
    ('GRANT-2', 'snapshot the signal at adaptation time', WG, "    if (isSignal(grant)) return () => grant();", "    if (isSignal(grant)) {\n        const snapshot = grant();\n        return () => snapshot;\n    }", [S('write-grant'), S('langsys.service')]),
    ('GRANT-1', 'drop writeGrant from the init() call', SVC, "                    writeGrant: adaptWriteGrant(this.config.writeGrant),\n", "", [S('langsys.service')]),
    ('WIRE-3', 'setLocale skips canonicalization', SVC, "        const next = canonicalizeLocale(locale);", "        const next = locale;", [S('langsys.service')]),
    ('WIRE-5', 'apiUrl no longer wired', SVC, "            if (this.config.apiUrl) LangsysAppAPI.setBaseUrl(this.config.apiUrl);", "", [S('langsys.service')]),
    ('MARK-2', 'hardcode the phrase marker literal', 'src/lib/directives/phrase.directive.ts', "@HostBinding(`attr.${PHRASE_MARKER_ATTR}`)", "@HostBinding('attr.data-ls-phrase')", ['src/lib/directives/directives.spec.ts']),
    ('BIND-6', 're-export the raw writeEnabled', 'src/public-api.ts', "    tSignal as t,\n} from 'langsys-js-typescript';", "    tSignal as t,\n    writeEnabled,\n} from 'langsys-js-typescript';", [S('conformance-probes')]),
    ('BIND-6', 'reintroduce a pass-through wrapper', SVC, 'APPEND_METHOD', "    getCountries(inLocale?: string) {\n        return LangsysApp.getCountries(inLocale);\n    }\n}\n", [S('conformance-probes')]),
    ('BIND-3', 'add a network call to the binding', WG, 'APPEND', "export const probeMutant = () => fetch('/api');\n", [S('conformance-probes')]),
    ('SSR-3', 'delete the README precondition callout', 'README.md', 'REGEX', r"> \*\*Precondition[\s\S]*?no report\.\n\n", [S('conformance-probes')]),
]

print(f"{'row':14} {'mutation':84} result")
for row, what, f, old, new, specs in MUTATIONS:
    orig = Path(f).read_text()
    if old == 'APPEND_METHOD': mutated = orig[: orig.rstrip().rfind('}')] + new
    elif old == 'APPEND': mutated = orig.rstrip('\n') + '\n' + new
    elif old == 'REGEX': mutated = re.sub(new, '', orig, count=1)
    elif old in orig: mutated = orig.replace(old, new, 1)
    else: mutated = orig
    if mutated == orig:
        print(f'{row:14} {what:84} NOT APPLIED (anchor missing)'); continue
    try:
        Path(f).write_text(mutated); res, notes = vitest(specs)
        print(f'{row:14} {what:84} {res}')
        for n in notes: print(f'  note: {n}')
    finally:
        Path(f).write_text(orig)

link = Path('node_modules/langsys-js-typescript')
if link.is_symlink():
    target, core_dir = os.readlink(link), link.resolve()
    tmp = Path(tempfile.mkdtemp())
    try:
        subprocess.run(['npm', 'pack', 'langsys-js-typescript@latest', '--pack-destination', str(tmp)], capture_output=True, check=True)
        with tarfile.open(next(tmp.glob('*.tgz'))) as t: t.extractall(tmp)
        link.unlink(); shutil.copytree(tmp / 'package', link)
        (link / 'node_modules').mkdir(exist_ok=True)
        (link / 'node_modules' / 'intl-messageformat').symlink_to(core_dir / 'node_modules' / 'intl-messageformat')
        res, notes = vitest([S('upstream-precondition')])
        print(f"{'precondition':14} {'replace the linked core with the published latest tarball':84} {res}")
        for n in notes: print(f'  note: {n}')
    finally:
        shutil.rmtree(link, ignore_errors=True); link.symlink_to(target); shutil.rmtree(tmp, ignore_errors=True)
else:
    print('precondition   skipped: node_modules/langsys-js-typescript is not a symlink (run `npm link langsys-js-typescript`)')
print('restored baseline:', vitest(['src/lib'])[0], '| working tree unchanged:', subprocess.run(['git', 'diff', '--quiet', '--', 'src', 'README.md']).returncode == 0 or 'see git diff')
