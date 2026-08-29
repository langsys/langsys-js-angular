import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';
import {
    LangsysApp,
    LangsysAppAPI,
    canonicalizeLocale,
    currentlyLoadedLocale,
    sTranslations,
    tSignal,
    type TFunction,
    type iCategories,
    type iLangsysResponse,
} from 'langsys-js-typescript';
import { LANGSYS_CONFIG } from './config';
import { createLocaleStore, type LocaleStore } from './locale-store';
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

    constructor() {
        // Bridge the SDK's raw signals. `autoDestroy: false` because this service
        // is root-provided and lives for the app's lifetime.
        this.t = fromSdkSignal<TFunction>(tSignal, { autoDestroy: false });
        this.currentLocale = fromSdkSignal<string>(currentlyLoadedLocale, { autoDestroy: false });
        this.translations = fromSdkSignal<iCategories>(sTranslations, { autoDestroy: false });

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

            try {
                const res = await LangsysApp.init({
                    projectid,
                    key,
                    UserLocaleStore: source,
                    // A signal becomes a per-call provider; a string or function
                    // passes through. Configuring a provider that returns `null`
                    // until login beats leaving this unset and calling
                    // `setWriteGrant()` later — an unset grant tells the SDK no
                    // grant can ever arrive, so it releases held misses to a
                    // renderer that cannot log in.
                    writeGrant: adaptWriteGrant(this.config.writeGrant),
                    baseLocale: this.config.baseLocale,
                    debug: this.config.debug,
                    ssrTokenStrategy: this.config.ssrTokenStrategy,
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

    /**
     * Translate a phrase. Reactive when read from a template or a `computed()`.
     * Signature mirrors the SDK: `translate(phrase, category?, params?)`.
     */
    readonly translate: TFunction = ((...args: unknown[]) =>
        (this.t() as unknown as (...a: unknown[]) => string)(...args)) as unknown as TFunction;

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
