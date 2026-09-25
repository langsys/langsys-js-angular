import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, inject, signal as ngSignal } from '@angular/core';

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
        loadSnapshot: vi.fn(() => true),
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
        // Mirrors the core's `src/locale.ts` line for line rather than
        // approximating it. The previous double UPPERCASED the region
        // (`en-US`) while the real implementation lowercases the whole tag
        // (`en-us`) — WIRE-3 requires lowercase `xx-yy` both on the wire and
        // internally, so the double certified the exact behaviour the rule
        // forbids. A double that contradicts production is not a weaker test,
        // it is a test that can pass while the code is wrong.
        canonicalizeLocale: (locale: string) => {
            if (!locale || typeof locale !== 'string') return locale;
            const cleaned = locale.trim().replace(/_/g, '-');
            try {
                const [canonical] = Intl.getCanonicalLocales(cleaned);
                return (canonical ?? cleaned).toLowerCase();
            } catch {
                return cleaned.toLowerCase();
            }
        },
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

        it('seeds the locale store from initialLocale, canonicalized to lowercase', () => {
            const svc = make({ initialLocale: 'es-ES' });

            // WIRE-3: lowercase `xx-yy` internally as well as on the wire, so a
            // host-cased tag from app config cannot fork cache keys or lookups.
            expect(svc.locale()).toBe('es-es');
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
        it('canonicalizes to lowercase, whatever casing the caller used', () => {
            const svc = make();

            svc.setLocale('es-ES');
            expect(svc.locale()).toBe('es-es');

            // Same tag, three spellings, one internal identity — the property
            // WIRE-3 is actually about.
            svc.setLocale('ES-es');
            expect(svc.locale()).toBe('es-es');

            svc.setLocale('es-es');
            expect(svc.locale()).toBe('es-es');
        });

        it('writes through to a caller-supplied source, canonicalized', () => {
            const custom = fakeSignal('en-us');
            const svc = make({ UserLocaleStore: custom });

            svc.setLocale('de-DE');

            expect(custom.get()).toBe('de-de');
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

        it('passes messagesCategory to init unchanged (MSG-6)', async () => {
            const svc = make({ messagesCategory: 'Validation' });
            await svc.init();

            const arg = (LangsysApp.init as unknown as { mock: { calls: Record<string, unknown>[][] } }).mock
                .calls[0][0];
            expect(arg['messagesCategory']).toBe('Validation');
        });

        it('passes legacyKeys to init by reference, untouched (MIG)', async () => {
            const legacyKeys = [{ name: 'en.json', format: 'i18next', data: { checkout: { submit: 'Place order' } } }];
            const svc = make({ legacyKeys });
            await svc.init();

            const arg = (LangsysApp.init as unknown as { mock: { calls: Record<string, unknown>[][] } }).mock
                .calls[0][0];
            expect(arg['legacyKeys']).toBe(legacyKeys);
            expect(legacyKeys).toEqual([
                { name: 'en.json', format: 'i18next', data: { checkout: { submit: 'Place order' } } },
            ]);
        });

        it('loads a configured snapshot by reference, for the starting locale, before init (SNAP-2)', () => {
            const snapshot = { format: 'langsys-catalog-snapshot', version: 1 };
            const svc = make({ snapshot, initialLocale: 'es-ES' });
            void svc.init();

            // Synchronously: loaded by the time init() returns, and before the core's init starts.
            const load = LangsysApp.loadSnapshot as unknown as ReturnType<typeof vi.fn>;
            expect(load).toHaveBeenCalledTimes(1);
            expect(load.mock.calls[0][0]).toBe(snapshot);
            expect(load.mock.calls[0][1]).toBe('es-es');
            expect(load.mock.invocationCallOrder[0]).toBeLessThan(
                (LangsysApp.init as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
            );
        });

        it('does not load a snapshot when none is configured', async () => {
            await make().init();
            expect(LangsysApp.loadSnapshot).not.toHaveBeenCalled();
        });

        it('a refused snapshot is reported on error and init proceeds (SNAP-3)', async () => {
            (LangsysApp.loadSnapshot as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
                throw new Error('The snapshot checksum does not match its contents.');
            });
            const svc = make({ snapshot: '{}' });
            await svc.init();

            expect(svc.error()).toBe('The snapshot checksum does not match its contents.');
            expect(LangsysApp.init).toHaveBeenCalledTimes(1);
            expect(svc.ready()).toBe(true);
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

/**
 * `translate()` read in a default-change-detection template, through the real
 * service. It carries no memo, so it re-enters `t()` on every pass — navigation
 * included. Recorded because HINT-4 (8.0.1) asks each binding path to be measured
 * for re-entry in a persistent layout rather than inferred.
 */
describe('translate() through a rendered template, on navigation', () => {
    @Component({ standalone: true, template: `<span>{{ langsys.translate('Save', 'UI') }}</span>` })
    class TranslateExprHost {
        readonly langsys = inject(LangsysService);
    }

    it('re-enters t() after navigation and renders the result', () => {
        make();
        const sdkT = tSignal as unknown as { get(): unknown; set(v: unknown): void };
        const original = sdkT.get();
        const spy = vi.fn((p: string) => `EN:${p}`);
        sdkT.set(spy);
        try {
            history.pushState({}, '', '/route-a');
            const fixture = TestBed.createComponent(TranslateExprHost);
            fixture.detectChanges();
            const rendered = spy.mock.calls.length;

            history.pushState({}, '', '/route-b');
            fixture.detectChanges();

            expect(spy.mock.calls.length).toBeGreaterThan(rendered);
            expect((fixture.nativeElement as HTMLElement).textContent).toContain('EN:Save');
        } finally {
            sdkT.set(original);
        }
    });
});
