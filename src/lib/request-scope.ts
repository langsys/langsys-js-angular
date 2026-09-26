import { makeStateKey } from '@angular/core';
import { LangsysApp, type iCategories, type iLangsysInitConfig, type iLangsysResponse } from 'langsys-js-typescript';

/**
 * Server rendering (spec SRV-7). The request scope is the core's: its own locale, catalog view,
 * misses and hydration seed. This binding opens one per request — Angular SSR bootstraps a fresh
 * application per request, so that application's root injector is the request's lifetime — and
 * holds no request state of its own.
 */

/** The seed a server render hands its client through `TransferState`, for the core's seed before hydration (SRV-4). */
export const LANGSYS_SEED = makeStateKey<{ locale: string; catalog: iCategories }>('langsys-seed');

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
