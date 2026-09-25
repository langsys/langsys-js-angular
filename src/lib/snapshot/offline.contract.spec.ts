import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startContractFixture } from '../../../test/contract-fixture';
import { snapshotFor, startWithSnapshot, type Started } from '../../../test/snapshot-scenario';

/**
 * SNAP-2 with the network unavailable: the API host is a contract double that has already stopped,
 * so every request fails. The snapshot keeps rendering, and a phrase it lacks is source text.
 */

let run: Started;
let after: { pricing: string; checkout: string };

beforeAll(async () => {
    const fx = await startContractFixture();
    const deadUrl = fx.baseUrl;
    await fx.stop();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    run = startWithSnapshot(deadUrl, snapshotFor('Precios (instantánea)'));
    await run.initialized;
    run.fixture.detectChanges();
    after = run.text();
});
afterAll(() => vi.restoreAllMocks());

describe('SNAP-2 — offline', () => {
    it('the snapshot keeps rendering after the catalog fetch has failed', () => {
        expect(run.first.pricing).toBe('Precios (instantánea)');
        expect(after.pricing).toBe('Precios (instantánea)');
    });

    it('a phrase the snapshot lacks is source text', () => {
        expect(after.checkout).toBe('Checkout');
    });
});
