import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startContractFixture, type ContractFixture } from '../../../test/contract-fixture';
import { CATALOG_SEED, settle, snapshotFor, startWithSnapshot, type Started } from '../../../test/snapshot-scenario';

/**
 * SNAP-3 through the binding: a snapshot edited after export no longer matches its checksum, and
 * the core refuses it. It is not served — not even for the first render — the reason reaches the
 * service's `error` signal, and the catalog is fetched as if no snapshot were configured.
 */

let fx: ContractFixture;
let run: Started;
let error: string | null;
let fetched: { pricing: string; checkout: string };

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(CATALOG_SEED);
    const edited = JSON.parse(JSON.stringify(snapshotFor('Precios (instantánea)')));
    edited.catalog['es-es'].UI.Pricing = 'Precios (editado a mano)';
    run = startWithSnapshot(fx.baseUrl, JSON.stringify(edited));
    error = run.langsys.error();
    fetched = await settle(run, (t) => t.pricing === 'Precios');
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('SNAP-3 — an edited snapshot is refused, not served', () => {
    it('the first render shows source text, not the edited translation', () => {
        expect(run.first.pricing).toBe('Pricing');
    });

    it('the refusal reason reaches LangsysService.error', () => {
        expect(error).toMatch(/checksum/i);
    });

    it('the catalog is fetched as if no snapshot were configured', () => {
        expect(fetched).toEqual({ pricing: 'Precios', checkout: 'Pagar' });
    });
});
