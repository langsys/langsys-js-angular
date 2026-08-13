/// <reference types="vitest" />
import { defineConfig } from 'vite';

/**
 * Tests run against Angular's JIT compiler (`@angular/compiler` is imported by
 * the setup file), so no AOT/ngtsc build step is needed here.
 *
 * That works because every class in this package injects with `inject()` in
 * field initializers rather than through constructor parameters — so Angular
 * never needs `emitDecoratorMetadata`, which esbuild cannot emit. Keep it that
 * way, or these tests will start failing with "Can't resolve all parameters".
 *
 * The config is `.mts` so Node loads it as ESM (this package is CJS by default).
 */
export default defineConfig({
    esbuild: {
        // esbuild does not pick these up from tsconfig here, so state them.
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
                useDefineForClassFields: false,
                target: 'es2022',
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['src/test-setup.ts'],
        include: ['src/**/*.spec.ts'],
    },
});
