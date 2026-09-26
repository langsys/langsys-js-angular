import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startContractFixture, type ContractFixture } from '../../../test/contract-fixture';
import { SERVER_SEED, serveRequest } from '../../../test/server-render-scenario';

/**
 * SRV-6 against the contract double: the locale the app resolved for a request is mapped to the
 * project's form and validated against the locales authorization says the project serves (base
 * `en`; targets `it-it`, `de-de`; default locales `it` → `it-it`, `de` → `de-de`).
 */

let fx: ContractFixture;
const served: Record<string, { svc: string; pipe: string }> = {};

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(SERVER_SEED('read'));
    for (const requested of ['it-IT', 'it_IT', 'it', 'fr-fr', 'fr']) {
        const request = await serveRequest(fx.baseUrl, requested);
        served[requested] = { svc: request.text('svc').split('|')[0], pipe: request.text('pipe') };
        request.end();
    }
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('SRV-6 — the app-resolved locale, mapped and validated', () => {
    it('it-IT and it_IT are served as it-it', () => {
        expect(served['it-IT']).toEqual({ svc: 'it-it', pipe: 'Prezzi' });
        expect(served['it_IT']).toEqual({ svc: 'it-it', pipe: 'Prezzi' });
    });

    it("a bare language is the project's default locale for it", () => {
        expect(served['it']).toEqual({ svc: 'it-it', pipe: 'Prezzi' });
    });

    it('a locale the project does not serve is served as the base locale', () => {
        expect(served['fr-fr']).toEqual({ svc: 'en', pipe: 'Pricing' });
        expect(served['fr']).toEqual({ svc: 'en', pipe: 'Pricing' });
    });
});
