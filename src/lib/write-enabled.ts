import { DestroyRef, NgZone, PLATFORM_ID, afterNextRender, inject, signal, type Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { writeEnabled as coreWriteEnabled } from 'langsys-js-typescript';

/**
 * `writeEnabled`, made safe to read during Angular's hydration pass.
 *
 * ## The tri-state is load-bearing — never default it
 * `undefined` means "not yet authorized: hold these misses", not "read-only".
 * Collapsing it to `false` tells a session that may well be write-enabled that
 * it is not, which drops every miss landing before authorization resolves and
 * fires a spurious discovery report for content that was about to register.
 * It is also unrecoverable without a reload. So this signal starts `undefined`
 * and only ever adopts a value the core actually published.
 *
 * ## Why the value is withheld until after the first render
 * The core's signal is browser-authoritative: it is never written under SSR, so
 * the server always renders from `undefined`. On the client it becomes concrete
 * as soon as authorization resolves — and in this binding that can happen
 * **before the first client render**, because `provideLangsys()` registers an
 * `APP_INITIALIZER` that awaits the first catalog load (`blockUntilReady`,
 * default true) and Angular blocks bootstrap on it. A consumer therefore
 * hydrates holding a concrete value while the server sent markup built from
 * `undefined`, and any template branching on it mismatches — with hydration
 * enabled Angular reports a mismatch and destroys/recreates the subtree.
 *
 * So we publish `undefined` for the whole hydration pass and adopt the real
 * value immediately after it.
 *
 * ## Why `afterNextRender` and not a macrotask timer
 * The sibling bindings solve the same problem with a pinned server snapshot
 * (React) or a macrotask scheduled from the first subscribe (Svelte). A timer
 * is the wrong instrument *here*, and specifically because of the awaited
 * initializer above: a `setTimeout(0)` armed when this service is constructed
 * is armed **during** `APP_INITIALIZER`, while bootstrap is still awaiting the
 * catalog fetch. Network work takes many macrotasks, so the timer fires long
 * before the first render — the guard would be off at exactly the moment it
 * exists for. That is the failure Svelte's note describes, reached here by a
 * shorter route, and it is not a hypothetical: the longer the catalog fetch,
 * the more reliably the timer loses.
 *
 * `afterNextRender` is keyed to Angular's own render lifecycle rather than to
 * wall-clock time, so it cannot fire early however long bootstrap blocks. It is
 * also a browser-only hook by construction, which is the same boundary this
 * value respects.
 *
 * ## Cost
 * One render cycle per page load, during which readers see `undefined` — the
 * honest "not known yet". Components mounting later (client-side navigation,
 * `@defer`, conditional blocks) subscribe to a signal that already holds the
 * real value, so the deferral costs nothing after the first render.
 *
 * ## Known limit
 * Angular v19 incremental hydration (`@defer (hydrate on …)`) hydrates a subtree
 * long after this guard has dropped, so a deferred block branching on
 * `writeEnabled` can still hydrate against server markup built from `undefined`.
 * A render-pass-scoped guard cannot see that; it needs the value pinned per
 * hydration boundary. Out of scope here and filed to the program's E2E wave.
 *
 * Must be called from an injection context (`afterNextRender` and `DestroyRef`
 * both require one); `LangsysService` calls it in its constructor.
 */
export function createWriteEnabledSignal(): Signal<boolean | undefined> {
    const out = signal<boolean | undefined>(undefined);

    // SSR arm: the core never writes this outside a browser, so there is nothing
    // to adopt. Subscribing anyway would attach a per-request listener to a
    // process-wide singleton in a long-lived server — the leak the core's own
    // documentation warns about, where one visitor's capability would be
    // observable by the next.
    //
    // Knowingly redundant: `afterNextRender` is itself platform-gated and does
    // not fire under a server `PLATFORM_ID` (measured, not assumed), so removing
    // this line changes no observable behaviour and no test turns red. It stays
    // because the property it protects — never leak one visitor's capability to
    // the next — is too expensive to rest on another API's incidental platform
    // behaviour. Recorded as defence in depth in CONFORMANCE.md rather than
    // claimed as tested.
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return out.asReadonly();

    let unsubscribe: (() => void) | undefined;
    const zone = inject(NgZone);

    afterNextRender(() => {
        // `subscribe` fires synchronously with the current value, so adoption
        // happens here; later capability changes (a grant arriving mid-session)
        // come through the same callback.
        //
        // The `zone.run` is not ceremony. `afterNextRender` invokes its callback
        // via `runOutsideAngular`, and a zone-based app binds no
        // `ChangeDetectionScheduler` — that is only provided by
        // `provideZonelessChangeDetection`. So on the zone-based v17 that this
        // package's peer range still floors at, writing the signal here would
        // update it without scheduling a single change-detection pass: a
        // template branching on `writeEnabled` would keep painting `undefined`
        // until some unrelated event happened to tick the zone, which on an idle
        // hydrated page can be never. Re-entering the zone is what turns the
        // adoption into a repaint.
        //
        // Safe in both worlds: under `provideZonelessChangeDetection` `NgZone`
        // is `NoopNgZone`, whose `run` simply calls the function, and the
        // scheduler picks the write up on its own.
        unsubscribe = coreWriteEnabled.subscribe((next) => zone.run(() => out.set(next)));
    });

    inject(DestroyRef).onDestroy(() => unsubscribe?.());

    return out.asReadonly();
}
