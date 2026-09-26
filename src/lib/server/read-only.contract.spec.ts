import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startContractFixture, until, type AcceptedState, type ContractFixture } from '../../../test/contract-fixture';
import { SERVER_SEED, serveRequest, type ServedRequest } from '../../../test/server-render-scenario';

/** SRV-3's read-only half: a read key's server render pushes nothing, even after the response. */

let fx: ContractFixture;
let served: ServedRequest;
let state: AcceptedState;

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(SERVER_SEED('read'));
    served = await serveRequest(fx.baseUrl, 'it-it');
    served.end();
    await new Promise((r) => setTimeout(r, 800));
    await until(async () => Boolean((state = await fx.state())));
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('SRV-3 — a read-only key', () => {
    it('renders the request (presence)', () => {
        expect(served.text('pipe')).toBe('Prezzi');
    });

    it('pushes nothing after the response', () => {
        expect(state.projects['p1'].phrases.map((p) => p.phrase)).toEqual(['Pricing']);
    });
});
