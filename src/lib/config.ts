import { InjectionToken } from '@angular/core';
import type { Signal as SdkSignal, iCategories } from 'langsys-js-typescript';

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
