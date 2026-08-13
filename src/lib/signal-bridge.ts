import { DestroyRef, inject, signal, type Signal } from '@angular/core';
import type { Signal as SdkSignal } from 'langsys-js-typescript';

/**
 * Bridge a base-SDK `Signal<T>` into an Angular read-only `Signal<T>`.
 *
 * This is the Angular mirror of the Vue binding's `useSignal()` and React's
 * `useSyncExternalStore` adapter. The SDK's `subscribe` fires synchronously
 * with the current value and returns an unsubscribe function, so the Angular
 * signal is seeded immediately — no flash of untranslated content.
 *
 * When called inside an injection context the subscription is torn down with
 * the injector (via `DestroyRef`). Outside one, pass `autoDestroy: false` (the
 * SDK's own singletons live for the app's lifetime, which is what the
 * root-provided `LangsysService` relies on).
 */
export function fromSdkSignal<T>(sdkSignal: SdkSignal<T>, options: { autoDestroy?: boolean } = {}): Signal<T> {
    const { autoDestroy = true } = options;
    const out = signal<T>(sdkSignal.get());

    const unsubscribe = sdkSignal.subscribe((next: T) => {
        out.set(next);
    });

    if (autoDestroy) {
        // Only available in an injection context; ignore when there isn't one.
        const destroyRef = inject(DestroyRef, { optional: true });
        destroyRef?.onDestroy(unsubscribe);
    }

    return out.asReadonly();
}
