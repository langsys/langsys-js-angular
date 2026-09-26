import { Component, getPlatform, ɵsetDocument as setDocument, type ApplicationRef } from '@angular/core';
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser';
import { provideLangsys } from '../src/lib/provide-langsys';
import { TranslatePipe } from '../src/lib/translate.pipe';
import type { LangsysConfig } from '../src/lib/config';

/**
 * SRV-4 through a real hydration pass: `renderApplication` on the server platform serves the page,
 * then the browser platform hydrates those bytes with `provideClientHydration()`, as an Angular
 * SSR app does. One scenario per file: the core is a process-wide singleton, and a seeded
 * scenario would leave its catalog for the next.
 */

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [TranslatePipe],
    template: `<p id="pipe">{{ 'Pricing' | t: 'UI' }}</p>`,
})
export class HydratedPage {}

const CONFIG: LangsysConfig = {
    projectid: 'p1',
    key: 'k1',
    // Nothing answers here: what the client shows first comes only from what the server handed it.
    apiUrl: 'http://127.0.0.1:9/api',
    baseLocale: 'en',
    initialLocale: 'it-it',
};

export interface Hydration {
    served: string;
    /** The client's first render, read once hydration has finished. */
    first: string;
    /** Whether the served text node is the one the client rendered into. */
    reusedTextNode: boolean;
    hydratedComponents: number;
    /** Every warning or error logged while hydrating, e.g. Angular's NG05xx mismatches. */
    logged: string[];
}

export async function serveThenHydrate(options: { dropSeed: boolean }): Promise<Hydration> {
    globalThis.fetch = (() => Promise.reject(new Error('no network in this test'))) as typeof fetch;
    // The test environment's platform would block the server's and the client's own.
    getPlatform()?.destroy();

    const { provideServerRendering, renderApplication } = await import('@angular/platform-server');
    const html = await renderApplication(
        () =>
            bootstrapApplication(HydratedPage, {
                providers: [
                    provideServerRendering(),
                    provideClientHydration(),
                    provideLangsys({
                        ...CONFIG,
                        initialTranslations: { UI: { Pricing: 'Prezzi' } } as never,
                        initialTranslationsLocale: 'it-it',
                    }),
                ],
            }),
        { document: '<html><head></head><body><app-root></app-root></body></html>', url: '/' }
    );

    document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>[\s\S]*$/, '');
    const served = document.querySelector('#pipe')?.textContent ?? '';
    if (options.dropSeed) {
        const state = document.getElementById('ng-state') as HTMLScriptElement;
        const parsed = JSON.parse(state.textContent ?? '{}') as Record<string, unknown>;
        delete parsed['langsys-seed'];
        state.textContent = JSON.stringify(parsed);
    }
    const servedText = document.querySelector('#pipe')?.firstChild;

    const logged: string[] = [];
    for (const level of ['warn', 'error'] as const) {
        console[level] = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
    }
    // The server platform left Angular's process-wide document pointing at the server's; a real
    // client is its own process, whose document is the page.
    setDocument(document);
    const dev = globalThis as unknown as { ngDevMode?: { hydratedComponents?: number } };
    const before = dev.ngDevMode?.hydratedComponents ?? 0;
    const app: ApplicationRef = await bootstrapApplication(HydratedPage, {
        providers: [provideClientHydration(), provideLangsys(CONFIG)],
    });
    // Bootstrap resolves after the first change detection, which is the hydration pass. Waiting
    // for stability would wait out the unseeded client's catalog retries instead.
    const pipe = document.querySelector('#pipe');
    const result = {
        served,
        first: pipe?.textContent ?? '',
        reusedTextNode: pipe?.firstChild === servedText,
        hydratedComponents: (dev.ngDevMode?.hydratedComponents ?? 0) - before,
        logged,
    };
    app.destroy();
    return result;
}
