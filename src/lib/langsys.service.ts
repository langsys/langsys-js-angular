import {
    DestroyRef,
    Injectable,
    PLATFORM_ID,
    TransferState,
    computed,
    inject,
    signal,
    type Signal,
    type WritableSignal,
} from '@angular/core';
import { PlatformLocation, isPlatformServer } from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import {
    LangsysApp,
    LangsysAppAPI,
    canonicalizeLocale,
    createRequestScope,
    createSignal,
    renderServerMessage,
    currentlyLoadedLocale,
    sTranslations,
    tSignal,
    type TFunction,
    type iCategories,
    type iLangsysInitConfig,
    type iLangsysResponse,
    type RequestScope,
    type ServerMessage,
} from 'langsys-js-typescript';
import { LANGSYS_CONFIG } from './config';
import { createLocaleStore, type LocaleStore } from './locale-store';
import { LANGSYS_SEED, configureOnce } from './request-scope';
import { fromSdkSignal } from './signal-bridge';
import { createWriteEnabledSignal } from './write-enabled';
import { adaptWriteGrant } from './write-grant';

/**
 * The Angular entry point to Langsys.
 *
 * Signals-first: `t`, `currentLocale` and `translations` are Angular signals, so
 * anything that reads them in a template re-renders when translations or the
 * locale change. Observable mirrors (`t$`, `currentLocale$`, `translations$`)
 * are provided for RxJS-heavy codebases.
 *
 * Everything not Angular-specific is delegated straight to the base SDK.
 */
@Injectable({ providedIn: 'root' })
export class LangsysService {
    private readonly config = inject(LANGSYS_CONFIG);

    /** The user-locale store handed to the SDK (created here unless supplied). */
    private readonly store: LocaleStore | null;

    // ---- Reactive state (signals) -------------------------------------------

    /**
     * The current translation function. Call it to translate:
     * `{{ langsys.t()('Save', 'UI') }}`. Prefer {@link translate} for brevity.
     * A fresh closure is emitted on every translations/locale change.
     */
    readonly t: Signal<TFunction>;
    /** The locale whose translations are actually loaded (lags the selection until the fetch settles). */
    readonly currentLocale: Signal<string>;
    /** The raw translation catalog. Rarely needed — prefer {@link t}. */
    readonly translations: Signal<iCategories>;
    /** The user-selected locale (may lead {@link currentLocale} during a fetch). */
    readonly locale: Signal<string>;

    private readonly _ready = signal(false);
    private readonly _error = signal<string | null>(null);
    /** True once the first translation load has settled successfully. */
    readonly ready = this._ready.asReadonly();
    /** Init error message, if initialization failed. */
    readonly error = this._error.asReadonly();

    /**
     * Whether this session may register phrases — **the only authoritative
     * capability signal**. Tri-state, and all three states are distinct:
     *
     *   - `undefined` — not yet authorized. Hold: neither register nor report.
     *   - `true` — this session registers missing phrases.
     *   - `false` — read-only; misses go to the discovery-report lane instead.
     *
     * Server-computed, because the same key answers differently from different
     * addresses and a write grant can flip it mid-session. Never derive it
     * locally, and never treat `undefined` as `false` — see {@link keyType}.
     *
     * Held at `undefined` through the first render so hydration cannot mismatch;
     * see `write-enabled.ts` for why that is `afterNextRender` and not a timer.
     */
    readonly writeEnabled: Signal<boolean | undefined>;

    /**
     * Permission level of the configured API key.
     *
     * **Not a capability signal — do not branch on it.** It reports what the key
     * *is*, never what this session may *do*: the same write key is read-only
     * from an unrecognised address, and a read key becomes write-enabled when a
     * valid write grant is supplied. The two disagree in exactly the cases that
     * matter. Use {@link writeEnabled} for every write decision; this is
     * diagnostic only.
     */
    readonly keyType = computed(() => (this._ready() ? LangsysAppAPI.config?.key_type : undefined));

    // ---- Observable interop --------------------------------------------------

    /** RxJS mirror of {@link t}. */
    readonly t$: Observable<TFunction>;
    /** RxJS mirror of {@link currentLocale}. */
    readonly currentLocale$: Observable<string>;
    /** RxJS mirror of {@link translations}. */
    readonly translations$: Observable<iCategories>;

    private initPromise: Promise<iLangsysResponse | null> | null = null;

    private readonly isServer = isPlatformServer(inject(PLATFORM_ID));
    private readonly transferState = inject(TransferState);
    private readonly platformLocation = inject(PlatformLocation, { optional: true });
    /** On a server: this request's scope (SRV-7), opened by `init()` and closed with the application. */
    private scope: RequestScope | null = null;
    private readonly serverState: {
        t: WritableSignal<TFunction>;
        locale: WritableSignal<string>;
        catalog: WritableSignal<iCategories>;
    } | null = null;

    constructor() {
        if (this.isServer) {
            // No subscription on a server. The SDK's signals are process-wide and see every
            // request the process renders; this request reads its own scope, which `init()`
            // opens before anything renders.
            this.serverState = {
                t: signal(tSignal.get()),
                locale: signal(''),
                catalog: signal({} as iCategories),
            };
            this.t = this.serverState.t.asReadonly();
            this.currentLocale = this.serverState.locale.asReadonly();
            this.translations = this.serverState.catalog.asReadonly();
            // After the response: the scope sends what the render missed, when it may (SRV-3).
            inject(DestroyRef).onDestroy(() => void this.scope?.close());
        } else {
            // Bridged, and released with the root injector.
            this.t = fromSdkSignal<TFunction>(tSignal);
            this.currentLocale = fromSdkSignal<string>(currentlyLoadedLocale);
            this.translations = fromSdkSignal<iCategories>(sTranslations);
        }

        // Deliberately NOT `fromSdkSignal`: that bridge subscribes eagerly, which
        // is precisely what the hydration guard must not do. Same mechanism
        // (subscribe → set), deferred to after the first render.
        this.writeEnabled = createWriteEnabledSignal();

        this.store = this.config.UserLocaleStore
            ? null
            : createLocaleStore(canonicalizeLocale(this.config.initialLocale ?? 'en-US'));

        this.locale = this.store
            ? this.store.locale
            : // Caller-supplied source: expose its value, refreshed whenever the
              // loaded locale changes (the best signal we can derive from it).
              computed(() => this.config.UserLocaleStore?.get() ?? this.currentLocale());

        this.t$ = toObservable(this.t);
        this.currentLocale$ = toObservable(this.currentLocale);
        this.translations$ = toObservable(this.translations);
    }

    /**
     * Initialize the SDK. Idempotent — `provideLangsys()` calls this during app
     * initialization, so applications rarely call it themselves.
     */
    init(): Promise<iLangsysResponse | null> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            const { projectid, key } = this.config;
            if (!projectid || !key) {
                this._error.set('Langsys: missing `projectid` or `key` in provideLangsys() config.');
                return null;
            }

            // The base SDK exposes no init option for the API host, so wire it here.
            if (this.config.apiUrl) LangsysAppAPI.setBaseUrl(this.config.apiUrl);

            const source = this.config.UserLocaleStore ?? this.store!;

            if (this.isServer) return this.openRequestScope(source.get());

            // The server's hydration seed, handed to the core synchronously before the first
            // await, so hydration renders the catalog the server rendered (SRV-4).
            const seed = this.transferState.get(LANGSYS_SEED, null);
            if (seed) {
                this.transferState.remove(LANGSYS_SEED);
                LangsysApp.seedCatalog(seed.catalog, seed.locale);
            }

            // Synchronously, before the first await: `init()` runs in APP_INITIALIZER, so the
            // snapshot is the published catalog before anything renders. A refused snapshot is
            // not served; the catalog fetch below proceeds as if none were configured.
            if (this.config.snapshot !== undefined) {
                try {
                    LangsysApp.loadSnapshot(this.config.snapshot, source.get());
                } catch (e) {
                    this._error.set(e instanceof Error ? e.message : String(e));
                }
            }

            try {
                const res = await LangsysApp.init({
                    ...this.initOptions(),
                    UserLocaleStore: source,
                    initialTranslations: this.config.initialTranslations,
                    initialTranslationsLocale: this.config.initialTranslationsLocale,
                });

                if (res?.status === false) {
                    this._error.set(res.errors?.join(', ') ?? 'Langsys init failed.');
                    return res;
                }
                this._ready.set(true);
                return res;
            } catch (e) {
                this._error.set(e instanceof Error ? e.message : String(e));
                return null;
            }
        })();

        return this.initPromise;
    }

    /** The core's configuration, shared by the browser's `init` and the server's once-per-process one. */
    private initOptions(): Omit<iLangsysInitConfig, 'UserLocaleStore'> {
        return {
            projectid: this.config.projectid,
            key: this.config.key,
            // A signal becomes a per-call provider; a string or function
            // passes through. Configuring a provider that returns `null`
            // until login beats leaving this unset and calling
            // `setWriteGrant()` later — an unset grant tells the SDK no
            // grant can ever arrive, so it releases held misses to a
            // renderer that cannot log in.
            writeGrant: adaptWriteGrant(this.config.writeGrant),
            messagesCategory: this.config.messagesCategory,
            legacyKeys: this.config.legacyKeys,
            baseLocale: this.config.baseLocale,
            debug: this.config.debug,
            ssrTokenStrategy: this.config.ssrTokenStrategy,
        };
    }

    /**
     * On a server: configure the core once per process, then open this request's scope for the
     * locale the app resolved (SRV-6) and render from it. `initialTranslations` for that locale
     * is the scope's catalog; otherwise the core fetches it, at most once per request. The seed
     * goes into `TransferState` for the client.
     */
    private async openRequestScope(rawLocale: string): Promise<iLangsysResponse | null> {
        try {
            const res = await configureOnce(
                `${this.config.apiUrl ?? ''}\0${this.config.projectid}\0${this.config.key}`,
                {
                    ...this.initOptions(),
                    UserLocaleStore: createSignal(canonicalizeLocale(this.config.baseLocale ?? 'en')),
                }
            );
            // A failed authorization still renders: the scope serves the catalog it was given,
            // or source text when its own fetch fails, as the page does (WIRE-4).
            const failed = res?.status === false;
            if (failed) this._error.set(res.errors?.join(', ') ?? 'Langsys init failed.');
            const locale = canonicalizeLocale(rawLocale);
            const given = this.config.initialTranslationsLocale;
            const catalog =
                this.config.initialTranslations && given && canonicalizeLocale(given) === locale
                    ? this.config.initialTranslations
                    : undefined;
            const scope = await createRequestScope({ locale, catalog, url: this.platformLocation?.href || undefined });
            this.scope = scope;
            const seed = scope.seed();
            this.serverState!.t.set(scope.t);
            this.serverState!.locale.set(scope.locale);
            this.serverState!.catalog.set(seed.catalog);
            this.transferState.set(LANGSYS_SEED, seed);
            if (!failed) this._ready.set(true);
            return res;
        } catch (e) {
            this._error.set(e instanceof Error ? e.message : String(e));
            return null;
        }
    }

    /**
     * Translate a phrase. Reactive when read from a template or a `computed()`.
     * Signature mirrors the SDK: `translate(phrase, category?, params?)`.
     */
    readonly translate: TFunction = ((...args: unknown[]) =>
        (this.t() as unknown as (...a: unknown[]) => string)(...args)) as unknown as TFunction;

    /**
     * Render a server message entry (spec MSG-5) — `{{ entry | tMessage }}` in a template.
     *
     * The base SDK decides everything: it renders the entry's `template` through `t()` under the
     * messages category when the catalog holds a translation for it, and shows the entry's
     * `message` otherwise; `message` is never a lookup key. Reading `t` here only makes the call
     * reactive, so the text follows locale and catalog changes when read in a template or a
     * `computed()`.
     */
    renderServerMessage(entry: ServerMessage, category?: string): string {
        this.t();
        const scope = this.scope;
        return scope ? scope.run(() => renderServerMessage(entry, category)) : renderServerMessage(entry, category);
    }

    /** Change the user locale. Throws if the app supplied its own locale source. */
    setLocale(locale: string): void {
        const next = canonicalizeLocale(locale);
        if (this.store) {
            this.store.set(next);
            return;
        }
        this.config.UserLocaleStore?.set(next);
    }
}
