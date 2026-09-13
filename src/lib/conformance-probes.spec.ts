import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absence probes — the evidence behind every row CONFORMANCE.md grades `delegated`,
 * and behind the binding-owned absence rules (BIND-2, BIND-3, BIND-4, BIND-6).
 *
 * A `delegated` grade claims the core owns a behaviour and this binding does not
 * participate in it. "We searched and found nothing" is worthless on its own, so
 * every probe asserts two things and the second is not optional:
 *
 *  1. the pattern matches **no code line** in this binding's source; and
 *  2. the **same pattern** matches at least one line of the core artifact this
 *     binding actually resolves — the firing control.
 *
 * A probe whose control comes back empty is a wrong probe, not clean code: it
 * would pass against any source whatever. That is what made an earlier GATE-5/6
 * probe (`registered|seen|marker`) worthless — 2 hits here, 0 in the core.
 *
 * Counts are over **code lines only**. Comment and JSDoc lines are dropped first,
 * because this binding's prose describes the behaviour it delegates far more often
 * than its code performs it; raw counts would be fiction.
 *
 * `PROBE_REPORT=1 npx vitest run src/lib/conformance-probes.spec.ts` prints the
 * counts that CONFORMANCE.md cites.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMENT_LINE = /^\s*(\*|\/\/|\/\*)/;

function codeLines(text: string): string[] {
    return text.split('\n').filter((l) => l.trim() !== '' && !COMMENT_LINE.test(l));
}

function bindingSource(): { file: string; lines: string[] }[] {
    const out: { file: string; lines: string[] }[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('test-setup.ts')) {
                out.push({ file: p.slice(SRC.length + 1), lines: codeLines(readFileSync(p, 'utf8')) });
            }
        }
    };
    walk(SRC);
    return out;
}

/** The core as this binding resolves it — the same artifact the precondition spec probes. */
const coreArtifact = createRequire(import.meta.url).resolve('langsys-js-typescript');
const coreLines = codeLines(readFileSync(coreArtifact, 'utf8'));
const coreTypes = readFileSync(coreArtifact.replace(/index\.js$/, 'index.d.ts'), 'utf8');

const binding = bindingSource();
const report = process.env['PROBE_REPORT'] === '1';

function hitsIn(lines: { file: string; lines: string[] }[], pattern: RegExp): string[] {
    return lines.flatMap(({ file, lines: ls }) => ls.filter((l) => pattern.test(l)).map((l) => `${file}: ${l.trim()}`));
}

interface Probe {
    rows: string;
    what: string;
    pattern: RegExp;
}

const DELEGATION_PROBES: Probe[] = [
    {
        rows: 'BIND-3, WIRE-1, WIRE-2, GRANT-4, REG-2, REG-7, REG-8',
        what: 'network: requests, auth and grant headers, retries, polling',
        pattern: /\bfetch\(|XMLHttpRequest|X-Authorization|X-Write-Grant|setInterval\(|backoff/,
    },
    {
        rows: 'REG-1, REG-3, REG-4, REG-5, REG-6, REG-9, REG-10, GATE-2, GATE-5, GATE-6, GATE-7, SSR-1',
        what: 'the write and report lanes: collecting, queueing, flushing, choosing a lane',
        pattern:
            /missingToken|scheduleTokenFlush|shouldQueueForWrite|sendBeacon|keepalive|batch_limit|recordMissForDiscovery|registerContentBlock/,
    },
    {
        rows: 'GATE-1, GATE-8, HINT-9, BIND-2',
        what: 'reading or branching on server-computed capability',
        pattern: /write_enabled|auto_discovery|key_type\s*[!=]==/,
    },
    {
        rows: 'GATE-3, GATE-4',
        what: 'persisting or caching the capability decision',
        pattern: /localStorage|sessionStorage|indexedDB|structuredClone/,
    },
    {
        rows: 'CAT-1, CAT-2, CAT-3, REG-12',
        what: 'catalog shape: presence, sentinels, block structure',
        pattern: /__uncategorized__|__category__|isContentBlockKnown/,
    },
    {
        rows: 'HINT-1, HINT-3, HINT-4, HINT-5, HINT-6, HINT-7, HINT-8, HINT-10, HINT-11, HINT-12',
        what: 'the hint lane: capture, normalisation, dedup, jitter, send',
        pattern: /normalizeHintUrl|postDiscoveryHint|discovery\/hint|alreadyHinted|HINT_M(IN|AX)_DELAY/,
    },
    {
        rows: 'CID-1, CID-2, CID-3, CID-4',
        what: 'deriving or tolerating custom_id',
        pattern: /md5|generateCustomId|generateLegacyCustomId|charCodeAt/,
    },
    {
        rows: 'ICU-1, ICU-2, ICU-3, ICU-4, ICU-5, TOK-5',
        what: 'interpolation, ICU recovery, placeholder forms',
        pattern: /IntlMessageFormat|intl-messageformat|\binterpolate\(/,
    },
    {
        rows: 'TOK-1, TOK-2, TOK-3, TOK-4, MARK-2',
        what: 'tokenizing: walking nodes, exclusion and collapse sets, reading host markers',
        pattern: /childNodes|nodeType|TEXT_NODE|createTreeWalker|isPhraseMarked|isTranslationExcluded/,
    },
    {
        rows: 'MARK-1',
        what: 'writing the content-block identity stamp',
        pattern: /data-ls-contentblock|data-langsys-contentblock/,
    },
    {
        rows: 'OBS-1',
        what: 'emitting diagnostics',
        pattern: /logger\.(warn|error|info)|console\.(warn|error)/,
    },
    {
        rows: 'WIRE-4',
        what: 'throwing from a translation, lookup or init path',
        pattern: /\bthrow\b/,
    },
    {
        rows: 'SSR-2',
        what: 'deciding or degrading the SSR token strategy',
        pattern: /ssrTokenStrategy\s*[!=]==|['"](server|auto)['"]\s*[!=]==/,
    },
];

describe('absence probes — this binding does not participate, and each probe can fire', () => {
    it.each(DELEGATION_PROBES)('$rows — $what', ({ pattern }) => {
        const inBinding = hitsIn(binding, pattern);
        const inCore = coreLines.filter((l) => pattern.test(l)).length;

        if (report)
            console.info(`PROBE ${pattern.source.slice(0, 40).padEnd(40)} binding=${inBinding.length} core=${inCore}`);

        expect(inBinding, `binding participates:\n${inBinding.join('\n')}`).toEqual([]);
        expect(inCore, 'firing control is empty — this probe cannot fail, so it proves nothing').toBeGreaterThan(0);
    });
});

describe('binding-owned absence rules', () => {
    it('BIND-4 — LangsysConfig introduces no discovery, hint or suppress option', () => {
        const config = codeLines(readFileSync(join(SRC, 'lib/config.ts'), 'utf8'));
        const forbidden = /^\s*(discovery|hints?|suppress\w*|autoDiscovery|reportDiscovered\w*)\??\s*:/;

        expect(config.filter((l) => forbidden.test(l))).toEqual([]);
        // Control: the pattern fires on exactly the shape it exists to catch.
        expect(forbidden.test('    autoDiscovery?: boolean;')).toBe(true);
    });

    it('BIND-6 — the service wraps none of the core helpers it can re-export by reference', () => {
        const service = codeLines(readFileSync(join(SRC, 'lib/langsys.service.ts'), 'utf8'));
        const passThroughs =
            /^\s*(getCountries|getCountryName|getCurrencies|getCurrencyName|getDialCodes|getLocales|getLocalesFlat|getLocalesData|getLocalesFormat|getLocaleName|getLocaleNameWithLookup|getLanguageName|detectPreferredLocale|refresh)\s*\(/;

        expect(service.filter((l) => passThroughs.test(l))).toEqual([]);
        // Control: the same names are declared on the core's LangsysApp, so the pattern can match.
        expect(coreTypes.split('\n').filter((l) => passThroughs.test(l)).length).toBeGreaterThan(0);
    });

    it('BIND-6 / GRANT-3 — LangsysApp and setWriteGrant are re-exported by reference, not wrapped', () => {
        const api = readFileSync(join(SRC, 'public-api.ts'), 'utf8');
        const reexport = api.match(/export\s*\{([^}]*)\}\s*from\s*'langsys-js-typescript'/g)?.join('\n') ?? '';

        expect(reexport).toMatch(/\bLangsysApp\b/);
        expect(reexport).toMatch(/\bsetWriteGrant\b/);
        // And nothing in this binding defines its own setWriteGrant.
        expect(hitsIn(binding, /function\s+setWriteGrant|setWriteGrant\s*[=(]\s*(async\s*)?\(/)).toEqual([]);
    });

    it('SSR-3 — the server strategy precondition is its own callout, on both surfaces that expose the option', () => {
        const callout = /^>\s*\*\*Precondition[^\n]*'server'(?:[^\n]|\n>)*?allow-listed/m;
        const readme = readFileSync(join(SRC, '..', 'README.md'), 'utf8');
        const ssrSection = readme.split(/^## /m).find((section) => section.startsWith('SSR')) ?? '';

        expect(ssrSection).toMatch(callout);
        expect(readFileSync(join(SRC, 'lib/config.ts'), 'utf8')).toMatch(
            /Precondition for `'server'`[\s\S]{0,120}allow-listed/
        );
        // Controls: the pattern accepts a real callout and rejects the footnote the rule forbids.
        expect("> **Precondition — `ssrTokenStrategy: 'server'` requires the origin allow-listed.**").toMatch(callout);
        expect("Note: 'server' mode needs the origin allow-listed.").not.toMatch(callout);
    });

    it("the core's raw writeEnabled is deliberately NOT re-exported (hydration foot-gun)", () => {
        const api = codeLines(readFileSync(join(SRC, 'public-api.ts'), 'utf8')).join('\n');
        const reexports = api.match(/export\s*\{[^}]*\}\s*from\s*'langsys-js-typescript'/g)?.join('\n') ?? '';

        expect(reexports).not.toMatch(/\bwriteEnabled\b/);
    });
});
