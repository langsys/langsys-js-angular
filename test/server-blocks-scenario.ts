import { Component, getPlatform } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { PhraseDirective } from '../src/lib/directives/phrase.directive';
import { TranslateDirective } from '../src/lib/directives/translate.directive';
import { provideLangsys } from '../src/lib/provide-langsys';
import type { LangsysConfig } from '../src/lib/config';

/**
 * Content blocks and rich phrases rendered on the server platform through the core's block tree,
 * inside the request's scope. The markup of each block is also written out below, so the browser's
 * `tokenizeElement` can derive the same ids independently (`server-blocks-reference.spec.ts`).
 */

/**
 * Each block's markup as the browser's tokenizer sees it once every directive has declared its host,
 * for `server-blocks-reference.spec.ts` to derive the ids independently of the server's tree path.
 */
export const MARKUP = {
    unnamed: '<h2>Compare every plan</h2>',
    reorder: '<h3>Getting started</h3><p data-ls-phrase="">Click <b>here</b> to start.</p>',
    outer: '<h2>Outer title</h2><p>Outer body</p><div data-ls-contentblock=""></div>',
    middle: '<p>Middle title</p><p>Middle body</p><div data-ls-contentblock=""></div>',
    inner: '<p>Inner title</p><p>Inner body</p>',
};

/** The ids the browser derives from that markup, pinned by the reference spec. */
export const BROWSER_IDS: Record<keyof typeof MARKUP, string> = {
    unnamed: '73652b64c59c5f150ac393a136da0e9c',
    reorder: 'f0c48eccb87b81923fd744b85eba995c',
    outer: 'a322262b4b8febeb0db5e003e27e39b0',
    middle: '36ba85dd670ed50642f9faee3d8a8fa8',
    inner: 'ae9842ac779c6667522759ececb198d5',
};

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [TranslateDirective, PhraseDirective],
    template: `
        <section id="named" lsTranslate category="UI" custom_id="pricing-hero"><h2>Pricing plans</h2></section>
        <section id="unnamed" lsTranslate category="UI"><h2>Compare every plan</h2></section>
        <p id="phrase" lsPhrase category="UI">Read the <a href="/terms">terms</a> before you buy.</p>
        <section id="reorder" lsTranslate category="UI">
            <h3>Getting started</h3>
            <p lsPhrase category="UI">Click <b>here</b> to start.</p>
        </section>
        <section id="outer" lsTranslate category="UI">
            <h2>Outer title</h2>
            <p>Outer body</p>
            <div id="middle" lsTranslate category="UI">
                <p>Middle title</p>
                <p>Middle body</p>
                <div id="inner" lsTranslate category="UI">
                    <p>Inner title</p>
                    <p>Inner body</p>
                </div>
            </div>
        </section>
    `,
})
export class BlocksPage {}

/** The it-it catalog: the named block, a structure-keeping phrase, and a phrase whose translation reorders. */
export const IT_CATALOG = {
    UI: {
        'pricing-hero': { 'Pricing plans': 'Piani tariffari' },
        'Read the {m0o}terms{m0c} before you buy.': 'Leggi i {m0o}termini{m0c} prima di acquistare.',
        'Click {m0o}here{m0c} to start.': '{m0o}Clicca qui{m0c}',
    },
};

export const BLOCKS_SEED = {
    projects: [
        {
            id: 'p1',
            base_locale: 'en',
            target_locales: ['it-it', 'de-de'],
            phrases: [
                {
                    category: 'UI',
                    phrase: 'Read the {m0o}terms{m0c} before you buy.',
                    translations: { 'it-it': 'Leggi i {m0o}termini{m0c} prima di acquistare.' },
                },
                {
                    category: 'UI',
                    phrase: 'Click {m0o}here{m0c} to start.',
                    translations: { 'it-it': '{m0o}Clicca qui{m0c}' },
                },
            ],
            blocks: [
                {
                    category: 'UI',
                    custom_id: 'pricing-hero',
                    phrases: [
                        {
                            phrase: 'Pricing plans',
                            translations: { 'it-it': 'Piani tariffari', 'de-de': 'Preispläne' },
                        },
                    ],
                },
                {
                    // The innermost nested block, known and translated, so it is served in Italian.
                    category: 'UI',
                    custom_id: 'ae9842ac779c6667522759ececb198d5',
                    phrases: [
                        { phrase: 'Inner title', translations: { 'it-it': 'Titolo interno' } },
                        { phrase: 'Inner body', translations: { 'it-it': 'Corpo interno' } },
                    ],
                },
            ],
        },
    ],
    keys: [{ key: 'k1', project: 'p1', type: 'write' }],
};

/** Serve one it-it request through `renderApplication`; `providers` joins the app's. */
export async function serveBlocks(config: Partial<LangsysConfig>, providers: unknown[] = []): Promise<string> {
    getPlatform()?.destroy();
    const { provideServerRendering, renderApplication } = await import('@angular/platform-server');
    return renderApplication(
        () =>
            bootstrapApplication(BlocksPage, {
                providers: [
                    provideServerRendering(),
                    provideLangsys({
                        projectid: 'p1',
                        key: 'k1',
                        baseLocale: 'en',
                        initialLocale: 'it-it',
                        ssrTokenStrategy: 'server',
                        ...config,
                    } as LangsysConfig),
                    ...(providers as never[]),
                ],
            }),
        { document: '<html><head></head><body><app-root></app-root></body></html>', url: '/' }
    );
}

/** The opening tag of the element with this id in served HTML, and the text up to its first closing tag. */
export function served(html: string, id: string): { stamp: string | null; resolved: string | null; text: string } {
    const open = new RegExp(`<[a-z0-9]+ [^>]*id="${id}"[^>]*>`).exec(html);
    if (!open) return { stamp: null, resolved: null, text: '' };
    const attr = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(open[0])?.[1] ?? null;
    const rest = html.slice(open.index + open[0].length);
    const text = rest
        .slice(0, rest.search(/<\/(section|p)>/))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return { stamp: attr('data-ls-contentblock'), resolved: attr('data-ls-resolved'), text };
}
