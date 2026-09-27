import { ɵsetDocument as setDocument, type ApplicationRef } from '@angular/core';
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser';
import { provideLangsys } from '../src/lib/provide-langsys';
import { BlocksPage, serveBlocks } from './server-blocks-scenario';

/**
 * The served blocks page, hydrated by the browser platform with `provideClientHydration()`. One process serves and hydrates, so Angular's
 * process-wide document is pointed back at the page before the client starts.
 */

export interface HydratedBlocks {
    servedNamed: string;
    first: { named: string; reused: boolean };
    logged: string[];
}

export async function hydrateBlocks(apiUrl: string, strategy: 'server' | 'client' = 'server'): Promise<HydratedBlocks> {
    const html = await serveBlocks({ apiUrl, ssrTokenStrategy: strategy }, [provideClientHydration()]);
    document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/, '').replace(/<\/html>[\s\S]*$/, '');
    const heading = () => document.querySelector('#named h2');
    const servedText = heading()?.firstChild;
    const servedNamed = heading()?.textContent ?? '';

    const logged: string[] = [];
    for (const level of ['warn', 'error'] as const) {
        console[level] = (...args: unknown[]) => void logged.push(args.map(String).join(' '));
    }
    setDocument(document);
    const app: ApplicationRef = await bootstrapApplication(BlocksPage, {
        providers: [
            provideClientHydration(),
            provideLangsys({ projectid: 'p1', key: 'k1', apiUrl, baseLocale: 'en', initialLocale: 'it-it' }),
        ],
    });
    const first = { named: heading()?.textContent ?? '', reused: heading()?.firstChild === servedText };

    // Long enough for the client's registrations to be sent.
    await new Promise((r) => setTimeout(r, 1500));
    app.destroy();
    return { servedNamed, first, logged };
}
