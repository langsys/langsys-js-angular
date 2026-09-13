/* global process, console */
// Reproduces the SRV evidence in CONFORMANCE.md.  Prereqs, from the repo root:
//   npm run build && npm link langsys-js-typescript && (cd _dev_/ssr-measure && npm install)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const dist = join(repo, 'dist');
if (!existsSync(join(dist, 'package.json'))) {
    console.log('No built binding at dist/ — run `npm run build` in the repo root first.');
    process.exit(1);
}

// A real copy of the built binding, so it resolves @angular from THIS harness (one Angular instance),
// and the same core the repo resolves (the linked working copy, not the registry tarball).
const nm = join(here, 'node_modules');
mkdirSync(nm, { recursive: true });
rmSync(join(nm, 'langsys-js-angular'), { recursive: true, force: true });
cpSync(dist, join(nm, 'langsys-js-angular'), { recursive: true });
rmSync(join(nm, 'langsys-js-typescript'), { recursive: true, force: true });
symlinkSync(realpathSync(join(repo, 'node_modules', 'langsys-js-typescript')), join(nm, 'langsys-js-typescript'));

const cases = [['served'], ['solo', 'it-it'], ['solo', 'de-de'], ['pair'], ['pair']];
for (const args of cases) {
    const out = execFileSync(process.execPath, [join(here, 'render.mjs'), ...args], { encoding: 'utf8', cwd: here });
    process.stdout.write(
        out
            .split('\n')
            .filter((l) => /^(SRV|TIMEOUT)/.test(l))
            .join('\n') + '\n'
    );
}
