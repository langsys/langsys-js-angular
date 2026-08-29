import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/**
 * Bench precondition — fail loudly when the upstream artifact is the wrong one.
 *
 * ## Why this test exists
 * `langsys-js-typescript@0.6.5` on the npm registry and `0.6.5` in the local
 * working copy are **different code under one version string**: the 838 surface
 * (write gating + content discovery) was added on top of the already-published
 * 0.6.5 without a version bump. So no version comparison — not `package.json`,
 * not `npm view`, not the lockfile — can tell the two apart.
 *
 * This repo is developed against the local copy via `npm link`. A plain
 * `npm ci` or `npm install` silently replaces that symlink with the registry
 * tarball, and every other test in this suite stays green while doing it: the
 * unit tests mock the SDK, so they never touch the missing symbols. Green tests
 * beside a red typecheck is the signature of an unpublished dependency, and it
 * is worth exactly one test to turn that into a red build instead.
 *
 * ## What it asserts
 * The symbols are probed **by identity, never by version string**, against the
 * artifact Node actually resolves. `generateCustomId` is the positive control:
 * it exists in both the published and local builds, so if it is missing the
 * import itself is broken and the other failures are not evidence of absence.
 *
 * Deliberately loaded through `createRequire`, not a dynamic `import()`: that
 * reads the **built artifact Node resolves on disk**, bypassing Vite's module
 * graph. Vite will not transform a linked package living outside the project
 * root, and more importantly a bundler's view of the dependency is not the
 * thing this test is asserting about.
 *
 * ## Retiring it
 * Delete this file once the core publishes a tag whose *tarball* answers this
 * probe (≥0.7.0), and the dependency range is bumped to it. Until then, this is
 * the only check in the suite that can tell the two 0.6.5s apart.
 */

/** Symbols added by the 838 reland — absent from every published build to date. */
const REQUIRED_838_SYMBOLS = {
    writeEnabled: 'object', // a Signal instance, not a function
    setWriteGrant: 'function',
    autoDiscovery: 'object', // a controller object, not a function
} as const;

/** Present in BOTH the published and local builds — proves the import resolved. */
const POSITIVE_CONTROL = 'generateCustomId';

const PKG = 'langsys-js-typescript';

const require_ = createRequire(import.meta.url);

function resolvedPath(): string {
    return require_.resolve(PKG);
}

function remedy(where: string): string {
    return [
        '',
        `The resolved ${PKG} is missing the 838 surface.`,
        `Resolved from: ${where}`,
        '',
        'This almost always means `npm ci`/`npm install` replaced the symlink with',
        'the registry tarball. The published 0.6.5 and the local 0.6.5 are different',
        'code under the same version string, so nothing in package.json will show it.',
        '',
        'Restore the bench with:  npm link langsys-js-typescript',
        '',
    ].join('\n');
}

function loadArtifact(): Record<string, unknown> {
    return require_(PKG) as Record<string, unknown>;
}

describe('upstream precondition — the resolved SDK carries the 838 surface', () => {
    it('resolves the package at all', () => {
        expect(() => resolvedPath()).not.toThrow();
    });

    it(`loads (positive control: ${POSITIVE_CONTROL} exists in every build)`, () => {
        // If THIS fails, the load is broken and the absences below prove nothing.
        expect(
            typeof loadArtifact()[POSITIVE_CONTROL],
            `positive control missing — the artifact failed to load, so the 838 ` +
                `assertions below would be meaningless rather than evidence of absence`
        ).toBe('function');
    });

    it.each(Object.entries(REQUIRED_838_SYMBOLS))('exports %s as %s', (symbol, expectedType) => {
        expect(typeof loadArtifact()[symbol], `\`${symbol}\` is absent.${remedy(resolvedPath())}`).toBe(expectedType);
    });
});
