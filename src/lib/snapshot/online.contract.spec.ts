import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startContractFixture, type ContractFixture } from '../../../test/contract-fixture';
import { CATALOG_SEED, settle, snapshotFor, startWithSnapshot, type Started } from '../../../test/snapshot-scenario';

/**
 * SNAP-2 against the contract double: a snapshot configured on `provideLangsys()` is the catalog
 * of the first render, with no network answer yet possible, and the catalog fetched afterwards
 * replaces it and supplies what it lacks.
 */

let fx: ContractFixture;
let run: Started;
let fetched: { pricing: string; checkout: string };
let error: string | null;

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(CATALOG_SEED);
    run = startWithSnapshot(fx.baseUrl, snapshotFor('Precios (instantánea)'));
    fetched = await settle(run, (t) => t.checkout === 'Pagar');
    error = run.langsys.error();
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('SNAP-2 — a configured snapshot is the preloaded catalog', () => {
    it('the first render shows the snapshot translation, before any response could arrive', () => {
        expect(run.first.pricing).toBe('Precios (instantánea)');
    });

    it('a phrase the snapshot lacks renders as source text until the catalog arrives', () => {
        expect(run.first.checkout).toBe('Checkout');
    });

    it('the fetched catalog then replaces the snapshot and supplies the phrase it lacked', () => {
        expect(fetched).toEqual({ pricing: 'Precios', checkout: 'Pagar' });
        expect(error).toBeNull();
    });
});
