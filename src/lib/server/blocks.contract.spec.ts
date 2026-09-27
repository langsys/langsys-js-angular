// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
import { startContractFixture, until, type ContractFixture } from '../../../test/contract-fixture';
import { BLOCKS_SEED, BROWSER_IDS, serveBlocks, served } from '../../../test/server-blocks-scenario';

/**
 * SRV-1, MARK-1 and SRV-5 through a real `renderApplication` on the server platform — Domino, with
 * no browser globals, as a server runs — against the contract double: a write key under the
 * `server` strategy, so what the render missed is sent after the response.
 */

/** Every `registerBlock` call, by the id of the host it was made for: the seam, before the scope de-duplicates. */
const registeredFrom = vi.hoisted(() => [] as string[]);
vi.mock('langsys-js-typescript', async (original) => {
    const core = await original<typeof import('langsys-js-typescript')>();
    return {
        ...core,
        registerBlock: (...args: Parameters<typeof core.registerBlock>) => {
            registeredFrom.push((args[1]?.host as Element | undefined)?.id ?? '');
            return core.registerBlock(...args);
        },
    };
});

type Item = { type: string; phrase?: string; custom_id?: string; phrases?: Array<{ phrase: string }> };

let fx: ContractFixture;
let html: string;
let postedBeforeSerialize = -1;
const items: Item[] = [];

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(BLOCKS_SEED);
    const realFetch = globalThis.fetch;
    const posts: string[] = [];
    vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') posts.push(String(init.body));
        return realFetch(url as never, init);
    });
    html = await serveBlocks({ apiUrl: fx.baseUrl }, [
        { provide: BEFORE_APP_SERIALIZED, multi: true, useValue: () => (postedBeforeSerialize = posts.length) },
    ]);
    // Bounded, not fatal: what never arrives is the assertions' to report.
    await until(async () => (await fx.state()).projects['p1'].blocks.length >= 4).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    for (const body of posts) items.push(...(JSON.parse(body) as { translatable_items: Item[] }).translatable_items);
});
afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await fx.stop();
});

const blockIds = () => items.filter((i) => i.type === 'content_block').map((i) => i.custom_id);
const phrases = () => items.filter((i) => i.type === 'phrase').map((i) => i.phrase);

describe('SRV-1 — the served bytes', () => {
    it("a block the catalog holds is served translated, stamped with the app's id and marked resolved", () => {
        expect(served(html, 'named')).toEqual({ stamp: 'pricing-hero', resolved: 'it-it', text: 'Piani tariffari' });
    });

    it('a block the catalog lacks is served as source, stamped with the id the browser derives, not marked resolved', () => {
        expect(served(html, 'unnamed')).toEqual({
            stamp: BROWSER_IDS.unnamed,
            resolved: null,
            text: 'Compare every plan',
        });
    });

    it('a block whose translation reorders the markup Angular rendered is served as source, still stamped', () => {
        expect(served(html, 'reorder')).toEqual({
            stamp: BROWSER_IDS.reorder,
            resolved: null,
            text: 'Getting started Click here to start.',
        });
        expect(html).toContain(
            '<p lsphrase="" category="UI" ng-reflect-category="UI" data-ls-phrase="">Click <b>here</b> to start.</p>'
        );
    });
});

describe('SRV-5 — nested blocks, depth 3', () => {
    it('the outermost block is stamped with the id the browser derives, its nested blocks excised', () => {
        expect(served(html, 'outer').stamp).toBe(BROWSER_IDS.outer);
    });

    it('only the outermost block host registers; nested hosts are registered through its tree', () => {
        expect(registeredFrom).toEqual(['named', 'unnamed', 'reorder', 'outer']);
    });

    it('a nested block the catalog lacks registers exactly once, as a block, under the id the browser derives', () => {
        for (const id of [BROWSER_IDS.outer, BROWSER_IDS.middle]) {
            expect(blockIds().filter((b) => b === id)).toHaveLength(1);
        }
    });

    it('a block holding nested blocks is served as source, stamped, its nested blocks with it', () => {
        expect(html).toContain('<p>Inner title</p><p>Inner body</p>');
    });

    it('a nested block the catalog holds registers nothing', () => {
        expect(blockIds()).not.toContain(BROWSER_IDS.inner);
    });

    it('only the blocks the catalog lacks register: nothing is re-read from translated text', () => {
        expect(new Set(blockIds())).toEqual(new Set([BROWSER_IDS.outer, BROWSER_IDS.middle]));
    });

    it("no block's text is registered as a phrase of its own", () => {
        for (const text of ['Outer title', 'Outer body', 'Middle title', 'Middle body', 'Inner title', 'Inner body']) {
            expect(phrases()).not.toContain(text);
        }
    });
});

describe('SRV-3 — nothing is sent during the request', () => {
    it('no registration had been sent when the page was serialized', () => {
        expect(postedBeforeSerialize).toBe(0);
    });

    it('the registrations arrive after it (presence)', () => {
        expect(blockIds().length).toBeGreaterThan(0);
    });
});
