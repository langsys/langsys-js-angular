import { signal, type Signal, type WritableSignal } from '@angular/core';
import type { Signal as SdkSignal } from 'langsys-js-typescript';

/**
 * A locale store that is readable as an Angular signal *and* satisfies the base
 * SDK's `Signal` contract.
 *
 * Why both: the SDK requires **synchronous** notification when the locale
 * changes (it reads `translationsLoadingPromise` right after). Angular's
 * `effect()` is scheduled, not synchronous, so observing an arbitrary Angular
 * signal cannot honour that contract. Instead this store owns the write path:
 * `set()` updates the Angular signal *and* notifies SDK subscribers inline.
 */
export interface LocaleStore extends SdkSignal<string> {
    /** Read the locale reactively in templates / `computed()`. */
    readonly locale: Signal<string>;
    /**
     * The store itself, kept as a property for back-compat.
     *
     * @deprecated Pass the store directly — `UserLocaleStore: locale` — the way
     * every other Langsys binding does. `.source` now points at the store.
     */
    readonly source: SdkSignal<string>;
}

/**
 * Create the user-locale store — the Angular analog of the Vue binding's
 * `createLocaleStore()` / Svelte's `writable()`.
 *
 * The returned store satisfies the SDK's `Signal` contract itself, so it goes
 * straight into the config exactly like every other binding:
 *
 *   export const locale = createLocaleStore('en-US');
 *   provideLangsys({ projectid, key, UserLocaleStore: locale });
 *
 * …while `locale.locale` stays an Angular signal for templates and `computed()`.
 *
 * Locale identifiers are canonicalized by the base SDK, so `'en-us'` works on
 * input, but `currentLocale` always emits the canonical form (`'en-US'`).
 */
export function createLocaleStore(initial = 'en-US'): LocaleStore {
    const inner: WritableSignal<string> = signal(initial);
    // Mirror of the value kept outside Angular's reactive graph so the SDK's
    // `get()` never has to read a signal from a non-reactive context.
    let current = initial;
    const subscribers = new Set<(value: string) => void>();

    const commit = (next: string): void => {
        if (next === current) return;
        current = next;
        inner.set(next);
        // Synchronous fan-out — this is what the SDK's Signal contract expects.
        subscribers.forEach((run) => run(next));
    };

    const store = {
        locale: inner.asReadonly(),
        get: () => current,
        set: (value: string) => commit(value),
        update: (fn: (prev: string) => string) => commit(fn(current)),
        subscribe: (run: (value: string) => void) => {
            subscribers.add(run);
            run(current); // fire immediately with the current value
            return () => {
                subscribers.delete(run);
            };
        },
    };

    // `.source` predates the store satisfying the SDK contract directly. It now
    // resolves to the store itself, so old and new call sites both work.
    return Object.assign(store, { source: store as SdkSignal<string> });
}

/**
 * Adapt a locale you already own in an Angular `WritableSignal<string>` (an
 * NgRx SignalStore slice, a settings service, …) into the SDK's `Signal`
 * contract — the Angular analog of the Vue binding's `refToLocaleSource(ref)`
 * and the Solid binding's `solidToLocaleSource(get, set)`.
 *
 * ⚠️ Caveat: an Angular signal gives no synchronous change hook, so the SDK is
 * notified only when something calls `set`/`update` **through the returned
 * source**. Writing to the underlying signal directly will update `get()` but
 * will not notify the SDK. If your app writes the signal directly, prefer
 * `createLocaleStore()` and drive it via `LangsysService.setLocale()`.
 */
export function signalToLocaleSource(localeSignal: WritableSignal<string>): SdkSignal<string> {
    const subscribers = new Set<(value: string) => void>();

    const commit = (next: string): void => {
        if (next === localeSignal()) return;
        localeSignal.set(next);
        subscribers.forEach((run) => run(next));
    };

    return {
        get: () => localeSignal(),
        set: commit,
        update: (fn: (prev: string) => string) => commit(fn(localeSignal())),
        subscribe: (run: (value: string) => void) => {
            subscribers.add(run);
            run(localeSignal());
            return () => {
                subscribers.delete(run);
            };
        },
    };
}
