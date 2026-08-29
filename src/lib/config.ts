import { InjectionToken } from '@angular/core';
import type { Signal as SdkSignal, iCategories } from 'langsys-js-typescript';
import type { WriteGrantSource } from './write-grant';

/**
 * Angular-flavored init config.
 *
 * Everything the base SDK accepts, plus two Angular-side conveniences:
 *  - `apiUrl` — point the SDK at a self-hosted / local backend. The base SDK has
 *    no such option (its host is hardcoded); this wires `LangsysAppAPI.setBaseUrl()`
 *    for you so integrators don't need to know that.
 *  - `initialLocale` / `blockUntilReady` — bootstrap ergonomics.
 *
 * `UserLocaleStore` is optional: if you don't pass one, the service creates a
 * `createLocaleStore(initialLocale)` internally and you drive it with
 * `LangsysService.setLocale()`.
 */
export interface LangsysConfig {
    /** The ID (UUID) of the project created in Langsys. */
    projectid: string;
    /** The API key. A read key is fetch-only; a write key auto-registers phrases. */
    key: string;
    /** Base language/locale of the source phrases in your code. @default 'en' */
    baseLocale?: string;
    /** Enable verbose SDK console logging. @default false */
    debug?: boolean;
    /** Token creation behavior during SSR. @default 'client' */
    ssrTokenStrategy?: 'client' | 'server' | 'auto';
    /** Pre-fetched catalog to seed (SSR), bypassing the initial fetch. */
    initialTranslations?: iCategories;
    /** Locale that `initialTranslations` corresponds to. */
    initialTranslationsLocale?: string;
    /**
     * Short-lived write grant for login-walled apps, sent as `X-Write-Grant`.
     *
     * Accepts everything the base SDK does (a string or a provider function),
     * plus an Angular **signal** — so refreshing is `grantSignal.set(next)`.
     * Prefer a signal or a function: grants live ~5 minutes while an app inits
     * once and runs for hours, so a bare string is expired minutes in and every
     * later write silently degrades to read-only.
     *
     * If the token only exists after login, still configure a source that
     * returns `null` until then rather than leaving this unset — unset tells the
     * SDK no grant can ever arrive, so it releases held misses to the report
     * lane, which for a login-walled app means reporting to a renderer that
     * cannot log in.
     */
    writeGrant?: WriteGrantSource;

    /** Override the API host, e.g. `http://localhost:8000/api`. */
    apiUrl?: string;
    /** Locale to start on when no `UserLocaleStore` is supplied. @default 'en-US' */
    initialLocale?: string;
    /** Bring your own locale source (e.g. from `signalToLocaleSource`). */
    UserLocaleStore?: SdkSignal<string>;
    /**
     * Block app bootstrap until the first translation fetch settles, so the app
     * never renders untranslated content. @default true
     */
    blockUntilReady?: boolean;
}

/** DI token holding the resolved {@link LangsysConfig}. Provided by `provideLangsys()`. */
export const LANGSYS_CONFIG = new InjectionToken<LangsysConfig>('LANGSYS_CONFIG');
