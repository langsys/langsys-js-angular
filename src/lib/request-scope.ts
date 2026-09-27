import { makeStateKey } from '@angular/core';
import {
    LangsysApp,
    canonicalizeLocale,
    type iLangsysInitConfig,
    type iLangsysResponse,
    type RequestScope,
} from 'langsys-js-typescript';

/**
 * Server rendering (spec SRV-7). The request scope is the core's: its own locale, catalog view,
 * misses and hydration seed. This binding opens one per request — Angular SSR bootstraps a fresh
 * application per request, so that application's root injector is the request's lifetime — and
 * holds no request state of its own.
 */

/** The seed a server render hands its client through `TransferState`, for the core's seed before hydration (SRV-4). */
export const LANGSYS_SEED = makeStateKey<ReturnType<RequestScope['seed']>>('langsys-seed');

/**
 * The core's configuration is process state, so on a server it is set once per project and key,
 * not per request: every request's catalog, locale and misses live in its scope instead.
 */
const configured = new Map<string, Promise<iLangsysResponse>>();

export function configureOnce(key: string, options: iLangsysInitConfig): Promise<iLangsysResponse> {
    let done = configured.get(key);
    if (!done) {
        done = LangsysApp.init(options);
        configured.set(key, done);
        // A failed configuration is not kept: the next request tries again.
        void done.then(
            (res) => res?.status === false && configured.delete(key),
            () => configured.delete(key)
        );
    }
    return done;
}

/** The locales a project serves, from authorization or, offline, from a loaded snapshot (SRV-6). */
export interface ServedLocales {
    base: string;
    targets: readonly string[];
    /** Language → the project's default locale for it, from authorization's `default_locales`. */
    defaults: Readonly<Record<string, string>>;
}

/** The served set in an `authorize-project` payload, or null when there is none to read. */
export function servedLocalesOf(project: unknown): ServedLocales | null {
    if (typeof project !== 'object' || project === null) return null;
    const p = project as { base_locale?: unknown; target_locales?: unknown; default_locales?: unknown };
    if (typeof p.base_locale !== 'string') return null;
    const targets = Array.isArray(p.target_locales)
        ? p.target_locales.filter((l): l is string => typeof l === 'string')
        : [];
    const defaults: Record<string, string> = {};
    // The payload carries it as a language → locale map; a plain list of locales reads the same way.
    const given = p.default_locales;
    const entries: Array<[string, unknown]> = Array.isArray(given)
        ? given.map((l) => [String(l).split(/[-_]/)[0], l])
        : typeof given === 'object' && given !== null
          ? Object.entries(given)
          : [];
    for (const [language, locale] of entries) {
        if (typeof locale === 'string') defaults[language.toLowerCase()] = canonicalizeLocale(locale);
    }
    return { base: canonicalizeLocale(p.base_locale), targets: targets.map(canonicalizeLocale), defaults };
}

/**
 * The locale a request is served in, from the locale the app resolved for it (SRV-6): mapped to
 * the project's form — `es-ES` and `es_ES` are `es-es`, and a bare `es` is the project's default
 * locale for Spanish — then validated against the locales the project serves, and served as the
 * base locale when it is not one of them.
 */
export function servedLocale(resolved: string, served: ServedLocales): string {
    let locale = canonicalizeLocale(resolved);
    if (!locale.includes('-')) locale = served.defaults[locale] ?? locale;
    return locale === served.base || served.targets.includes(locale) ? locale : served.base;
}
