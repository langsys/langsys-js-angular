import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal as ngSignal } from '@angular/core';

/** Build a fake base-SDK Signal. */
function fakeSignal<T>(initial: T) {
    let current = initial;
    const subs = new Set<(v: T) => void>();
    return {
        get: () => current,
        set: (v: T) => {
            current = v;
            subs.forEach((r) => r(v));
        },
        update: (fn: (p: T) => T) => {
            current = fn(current);
            subs.forEach((r) => r(current));
        },
        subscribe: (run: (v: T) => void) => {
            subs.add(run);
            run(current);
            return () => subs.delete(run);
        },
    };
}

const mocks = vi.hoisted(() => {
    const tSignal = {
        current: ((p: string) => `EN:${p}`) as unknown,
        subs: new Set<(v: unknown) => void>(),
    };
    return { tSignal };
});

vi.mock('langsys-js-typescript', () => {
    const t = fakeSignal<unknown>(mocks.tSignal.current);
    const currentlyLoadedLocale = fakeSignal('en-US');
    const sTranslations = fakeSignal<Record<string, unknown>>({ UI: { Save: 'Save' } });

    const LangsysAppAPI = {
        config: { key_type: 'read' as 'read' | 'write', projectid: '', baseLocale: 'en-US' },
        setBaseUrl: vi.fn(),
        getTranslations: vi.fn(),
    };

    const LangsysApp = {
        init: vi.fn(async () => ({ status: true })),
        refresh: vi.fn(async () => true),
        translationsLoadingPromise: Promise.resolve(),
        getCountries: vi.fn(async () => [{ code: 'US', label: 'United States' }]),
        getCountryName: vi.fn(async () => 'United States'),
        getCurrencies: vi.fn(async () => []),
        getCurrencyName: vi.fn(async () => 'US Dollar'),
        getDialCodes: vi.fn(async () => []),
        getLocales: vi.fn(async () => ({})),
        getLocalesFlat: vi.fn(async () => []),
        getLocalesData: vi.fn(async () => []),
        getLocalesFormat: vi.fn(async () => []),
        getLocaleName: vi.fn(() => 'English'),
        getLocaleNameWithLookup: vi.fn(async () => 'English'),
        getLanguageName: vi.fn(async () => 'English'),
        detectPreferredLocale: vi.fn(() => 'en-US'),
    };

    return {
        LangsysApp,
        LangsysAppAPI,
        writeEnabled: fakeSignal<boolean | undefined>(undefined),
        tSignal: t,
        currentlyLoadedLocale,
        sTranslations,
        canonicalizeLocale: (l: string) =>
            l.replace(
                /^([a-z]{2})-([a-z]{2})$/i,
                (_m, a: string, b: string) => `${a.toLowerCase()}-${b.toUpperCase()}`
            ),
    };
});

// Imported after the mock so the service binds to the fakes.
const { LangsysApp, LangsysAppAPI, tSignal, currentlyLoadedLocale } = await import('langsys-js-typescript');
const { LANGSYS_CONFIG } = await import('./config');
const { LangsysService } = await import('./langsys.service');
type LangsysServiceType = InstanceType<typeof LangsysService>;

function make(config: Record<string, unknown> = {}): LangsysServiceType {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            {
                provide: LANGSYS_CONFIG,
                useValue: { projectid: 'p1', key: 'k1', baseLocale: 'en-US', ...config },
            },
        ],
    });
    return TestBed.inject(LangsysService);
}

describe('LangsysService', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('reactive state', () => {
        it('bridges the SDK signals into Angular signals', () => {
            const svc = make();
            expect(svc.currentLocale()).toBe('en-US');
            expect(svc.translations()).toEqual({ UI: { Save: 'Save' } });
            expect(typeof svc.t()).toBe('function');
        });

        it('updates when the SDK re-emits', () => {
            const svc = make();
            currentlyLoadedLocale.set('es-ES');
            expect(svc.currentLocale()).toBe('es-ES');

            tSignal.set(((p: string) => `ES:${p}`) as never);
            expect((svc.t() as unknown as (p: string) => string)('Save')).toBe('ES:Save');

            // restore for other tests
            currentlyLoadedLocale.set('en-US');
        });

        it('exposes Observable mirrors', () => {
            const svc = make();
            expect(typeof svc.t$.subscribe).toBe('function');
            expect(typeof svc.currentLocale$.subscribe).toBe('function');
            expect(typeof svc.translations$.subscribe).toBe('function');
        });

        it('translate() delegates to the current TFunction', () => {
            const svc = make();
            tSignal.set(((p: string) => `X:${p}`) as never);
            expect((svc.translate as unknown as (p: string) => string)('Save')).toBe('X:Save');
        });
    });

    describe('init', () => {
        it('passes config through to the base SDK', async () => {
            const svc = make({ debug: true });
            await svc.init();

            expect(LangsysApp.init).toHaveBeenCalledTimes(1);
            const arg = (LangsysApp.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<
                string,
                unknown
            >;
            expect(arg['projectid']).toBe('p1');
            expect(arg['key']).toBe('k1');
            expect(arg['debug']).toBe(true);
            expect(arg['UserLocaleStore']).toBeTruthy();
            expect(svc.ready()).toBe(true);
            expect(svc.error()).toBeNull();
        });

        it('applies apiUrl BEFORE init — the base SDK has no such option', async () => {
            const svc = make({ apiUrl: 'http://localhost:8000/api' });
            await svc.init();
            expect(LangsysAppAPI.setBaseUrl).toHaveBeenCalledWith('http://localhost:8000/api');
        });

        it('does not touch the base URL when apiUrl is absent', async () => {
            const svc = make();
            await svc.init();
            expect(LangsysAppAPI.setBaseUrl).not.toHaveBeenCalled();
        });

        it('is idempotent — repeated calls initialize once', async () => {
            const svc = make();
            await Promise.all([svc.init(), svc.init(), svc.init()]);
            expect(LangsysApp.init).toHaveBeenCalledTimes(1);
        });

        it('reports missing credentials without calling the SDK', async () => {
            const svc = make({ projectid: '', key: '' });
            await svc.init();
            expect(LangsysApp.init).not.toHaveBeenCalled();
            expect(svc.ready()).toBe(false);
            expect(svc.error()).toMatch(/missing/i);
        });

        it('surfaces an error response from the SDK', async () => {
            (LangsysApp.init as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({
                status: false,
                errors: ['bad key'],
            });
            const svc = make();
            await svc.init();
            expect(svc.ready()).toBe(false);
            expect(svc.error()).toBe('bad key');
        });

        it('surfaces a thrown error', async () => {
            (LangsysApp.init as unknown as { mockRejectedValueOnce: (v: unknown) => void }).mockRejectedValueOnce(
                new Error('network down')
            );
            const svc = make();
            await svc.init();
            expect(svc.ready()).toBe(false);
            expect(svc.error()).toBe('network down');
        });

        it('seeds the locale store from initialLocale', () => {
            const svc = make({ initialLocale: 'es-ES' });
            expect(svc.locale()).toBe('es-ES');
        });

        it('uses a caller-supplied UserLocaleStore when given', async () => {
            const custom = fakeSignal('fr-FR');
            const svc = make({ UserLocaleStore: custom });
            await svc.init();

            const arg = (LangsysApp.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Record<
                string,
                unknown
            >;
            expect(arg['UserLocaleStore']).toBe(custom);
        });
    });

    describe('setLocale', () => {
        it('canonicalizes and updates the store', () => {
            const svc = make();
            svc.setLocale('es-es');
            expect(svc.locale()).toBe('es-ES');
        });

        it('writes through to a caller-supplied source', () => {
            const custom = fakeSignal('en-US');
            const svc = make({ UserLocaleStore: custom });
            svc.setLocale('de-de');
            expect(custom.get()).toBe('de-DE');
        });
    });

    describe('write capability', () => {
        it('exposes writeEnabled, held at undefined until the first render', () => {
            const svc = make();

            // Tri-state: `undefined` is "hold", never "read-only".
            expect(svc.writeEnabled()).toBeUndefined();
        });

        it('keyType is still surfaced unchanged, for diagnostics only', async () => {
            const svc = make();
            await svc.init();

            expect(svc.keyType()).toBe('read');
        });
    });

    describe('write grant', () => {
        it('passes a string grant to init unchanged', async () => {
            const svc = make({ writeGrant: 'tok_static' });
            await svc.init();

            const arg = (LangsysApp.init as unknown as { mock: { calls: Record<string, unknown>[][] } }).mock
                .calls[0][0];
            expect(arg['writeGrant']).toBe('tok_static');
        });

        it('adapts a signal grant into a provider resolved per request', async () => {
            const grant = ngSignal<string | null>('tok_1');
            const svc = make({ writeGrant: grant });
            await svc.init();

            const arg = (LangsysApp.init as unknown as { mock: { calls: Record<string, unknown>[][] } }).mock
                .calls[0][0];
            const provider = arg['writeGrant'] as () => string | null;

            expect(typeof provider).toBe('function');
            expect(provider()).toBe('tok_1');

            // The whole point: a refresh after init reaches the very next request.
            grant.set('tok_2');
            expect(provider()).toBe('tok_2');
        });

        it('leaves writeGrant undefined when none is configured', async () => {
            const svc = make();
            await svc.init();

            const arg = (LangsysApp.init as unknown as { mock: { calls: Record<string, unknown>[][] } }).mock
                .calls[0][0];
            expect(arg['writeGrant']).toBeUndefined();
        });
    });
});
