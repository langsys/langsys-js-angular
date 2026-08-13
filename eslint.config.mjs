import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    // `*.cjs` config files are CommonJS; not worth wiring Node globals for.
    { ignores: ['dist', 'node_modules', 'coverage', 'out-tsc', '**/*.cjs'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            // The SDK's TFunction is an overloaded callable; bridging it into
            // Angular's signal types needs a couple of deliberate casts.
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
    prettier
);
