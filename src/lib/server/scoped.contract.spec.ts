import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from 'langsys-js-typescript';
import { startContractFixture, until, type AcceptedState, type ContractFixture } from '../../../test/contract-fixture';
import { SERVER_SEED, serveRequest, subscriptions, type ServedRequest } from '../../../test/server-render-scenario';

/**
 * SRV-7 and the SRV rows it carries, against the contract double: two requests in one process,
 * `de-de` then `it-it`, each rendered by its own application inside its own request scope, with
 * the process-wide catalog seeded German beforehand, as another visitor's render would leave it.
 */

let fx: ContractFixture;
let de: ServedRequest;
let it_: ServedRequest;
let beforeEnd: AcceptedState;
let afterEnd: AcceptedState;
const registered = (s: AcceptedState) => s.projects['p1'].phrases.map((p) => p.phrase);

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed(SERVER_SEED('write'));
    LangsysApp.seedCatalog({ UI: { Pricing: 'Preise' } } as never, 'de-de');

    de = await serveRequest(fx.baseUrl, 'de-de');
    beforeEnd = await fx.state();
    de.end();
    // Bounded, and not fatal: a registration that never lands is the assertion's to report.
    await until(async () => registered((afterEnd = await fx.state())).includes('Not in any catalog')).catch(() => {});
    it_ = await serveRequest(fx.baseUrl, 'it-it');
    it_.end();
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('SRV-7 — each request renders inside its own scope', () => {
    it('de then it in one process: the second render is Italian, with no German in its bytes', () => {
        expect(de.text('pipe')).toBe('Preise');
        expect(it_.text('pipe')).toBe('Prezzi');
        expect(it_.html).not.toContain('Preise');
    });

    it("t, the service's locale and catalog, and their observables are the request's, not the process's German seed", () => {
        expect(it_.text('pipe')).toBe('Prezzi');
        expect(it_.text('svc')).toBe('it-it|Prezzi');
        expect(it_.text('obs')).toBe('it-it|Prezzi');
    });

    it('opens no subscription on the process-wide signals', () => {
        expect(subscriptions.opened).toBe(0);
    });
});

describe('SRV-1 — the served bytes', () => {
    it('a phrase absent from the catalog is served in the base language', () => {
        expect(it_.text('miss')).toBe('Not in any catalog');
    });

    it('a block with an explicit custom_id is stamped with it; one without is served as source, unstamped', () => {
        expect(it_.host('named').getAttribute('data-ls-contentblock')).toBe('pricing-hero');
        expect(it_.host('unnamed').hasAttribute('data-ls-contentblock')).toBe(false);
        expect(it_.text('unnamed')).toBe('Pricing plans');
    });
});

describe('SRV-3 — misses are collected after the response', () => {
    it('nothing is registered while the request is open', () => {
        expect(registered(beforeEnd)).not.toContain('Not in any catalog');
    });

    it('ending the request registers the miss, once', () => {
        expect(registered(afterEnd).filter((p) => p === 'Not in any catalog')).toHaveLength(1);
    });
});

describe('SRV-4 — the hydration seed', () => {
    it("is the request's own locale and catalog, in TransferState", () => {
        expect(it_.seed?.locale).toBe('it-it');
        expect(it_.seed?.catalog['UI']?.['Pricing']).toBe('Prezzi');
    });
});
