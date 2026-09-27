import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startContractFixture, type ContractFixture } from '../../../test/contract-fixture';
import { hydrateBlocks, type HydratedBlocks } from '../../../test/hydrate-blocks-scenario';
import { BLOCKS_SEED, BROWSER_IDS } from '../../../test/server-blocks-scenario';
import { generateCustomId } from 'langsys-js-typescript';

/**
 * SRV-1 with SRV-4: a block the server rendered translated keeps the structure Angular rendered,
 * so the browser platform hydrates it in place. Under the `client` strategy the browser registers
 * what the server rendered, so what reaches the double here is the client's registrations.
 */

let fx: ContractFixture;
let run: HydratedBlocks;
const registered: string[] = [];
let requests = 0;

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(BLOCKS_SEED);
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST' && String(url).includes('translatable-items')) {
            requests++;
            for (const item of (JSON.parse(String(init.body)) as { translatable_items: Array<{ custom_id?: string }> })
                .translatable_items) {
                if (item.custom_id) registered.push(item.custom_id);
            }
        }
        return realFetch(url as never, init);
    });
    run = await hydrateBlocks(fx.baseUrl, 'client', () => requests);
});
afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await fx.stop();
});

describe('a server-translated block hydrates in place', () => {
    it('the server served the translation', () => {
        expect(run.servedNamed).toBe('Piani tariffari');
    });

    it('hydration reuses the served text node, and the first client render keeps the translation', () => {
        expect(run.first).toEqual({ named: 'Piani tariffari', reused: true });
    });

    it('no hydration mismatch is reported', () => {
        expect(run.logged.filter((l) => /NG05|hydrat/i.test(l))).toEqual([]);
    });
});

describe('what the client registers after hydrating the served blocks', () => {
    it('each block the catalog lacks, once, under the id the browser derives from its source', () => {
        expect(registered.filter((id) => id === BROWSER_IDS.outer)).toHaveLength(1);
        expect(registered.filter((id) => id === BROWSER_IDS.middle)).toHaveLength(1);
    });

    it('no block under an id derived from translated text', () => {
        expect(registered).not.toContain(generateCustomId('UI', ['Titolo interno', 'Corpo interno']));
        expect(registered).not.toContain(generateCustomId('UI', ['Piani tariffari']));
    });
});

describe('a client-side locale switch over a block served translated', () => {
    it('re-renders it from its source in the new locale, both markers following', () => {
        expect(run.afterSwitch).toEqual({
            text: 'Innerer TitelInnerer Text',
            stamp: BROWSER_IDS.inner,
            resolved: 'de-de',
        });
    });

    it('registers nothing', () => {
        expect(run.sentAfterSwitch).toBe(0);
    });
});
