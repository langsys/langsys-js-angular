import { LangsysService } from '../src/lib/langsys.service';
import { until } from './contract-fixture';
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
    /** The inner nested block, served translated, after the client switches to de-de. */
    afterSwitch: { text: string; stamp: string | null; resolved: string | null };
    /** How many registration requests the client sent after the switch. */
    sentAfterSwitch: number;
}

export async function hydrateBlocks(
    apiUrl: string,
    strategy: 'server' | 'client' = 'server',
    /** The number of registration requests sent so far, from the caller's fetch spy. */
    sent: () => number = () => 0
): Promise<HydratedBlocks> {
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
    const sentBefore = sent();
    const langsys = app.injector.get(LangsysService);
    langsys.setLocale('de-de');
    await until(() => langsys.currentLocale() === 'de-de').catch(() => {});
    app.tick();
    await new Promise((r) => setTimeout(r, 1000));
    const inner = document.querySelector('#inner');
    const afterSwitch = {
        text: inner?.textContent ?? '',
        stamp: inner?.getAttribute('data-ls-contentblock') ?? null,
        resolved: inner?.getAttribute('data-ls-resolved') ?? null,
    };
    const sentAfterSwitch = sent() - sentBefore;
    app.destroy();
    return { servedNamed, first, logged, afterSwitch, sentAfterSwitch };
}
