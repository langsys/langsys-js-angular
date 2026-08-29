import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, NgZone, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/** Build a fake base-SDK Signal, counting subscriptions. */
function fakeSignal<T>(initial: T) {
    let current = initial;
    const subs = new Set<(v: T) => void>();
    return {
        subscribeCount: 0,
        get: () => current,
        set(v: T) {
            current = v;
            subs.forEach((r) => r(v));
        },
        update: (fn: (p: T) => T) => fn(current),
        subscribe(run: (v: T) => void) {
            this.subscribeCount++;
            subs.add(run);
            run(current);
            return () => subs.delete(run);
        },
    };
}

const mocks = vi.hoisted(() => ({ writeEnabled: undefined as unknown }));

vi.mock('langsys-js-typescript', () => ({
    get writeEnabled() {
        return mocks.writeEnabled;
    },
}));

const { createWriteEnabledSignal } = await import('./write-enabled');

type CoreSignal = ReturnType<typeof fakeSignal<boolean | undefined>>;

/** Host component — `afterNextRender` needs a real render to fire. */
@Component({ standalone: true, template: '<span>host</span>' })
class Host {}

function setup(platform: 'browser' | 'server', initial: boolean | undefined) {
    const core = fakeSignal<boolean | undefined>(initial);
    mocks.writeEnabled = core;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [{ provide: PLATFORM_ID, useValue: platform }],
    });

    const sig = TestBed.runInInjectionContext(() => createWriteEnabledSignal());
    return { core: core as CoreSignal, sig };
}

/** Drive one real render, which is what releases `afterNextRender` callbacks. */
function render(): void {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
}

describe('createWriteEnabledSignal', () => {
    beforeEach(() => vi.clearAllMocks());

    /**
     * These two pin the observable SSR **contract**, not the guard that enforces
     * it — and the distinction is recorded rather than glossed.
     *
     * Deleting `createWriteEnabledSignal`'s `isPlatformBrowser` early-return
     * leaves both of these GREEN. Measured, not assumed: `afterNextRender` is
     * itself platform-gated and does not fire under `PLATFORM_ID: 'server'`
     * (probed directly — a bare `afterNextRender` callback fires on `'browser'`
     * and does not on `'server'`), so Angular already enforces the same boundary
     * and no observable behaviour distinguishes the two implementations.
     *
     * The guard is kept anyway, deliberately: "never attach a per-request
     * listener to a process-wide singleton" is a correctness property whose
     * failure harms every later visitor to the host, and resting it on another
     * API's incidental platform behaviour is not a bet worth taking. But it is
     * defence in depth, and this comment exists so nobody reads these two green
     * ticks as evidence for the guard itself.
     */
    describe('server platform (contract, not guard — see note)', () => {
        it('stays undefined even when the core already holds a concrete value', () => {
            const { sig } = setup('server', true);

            expect(sig()).toBeUndefined();
        });

        it('never subscribes — no per-request listener on a process-wide singleton', () => {
            const { core } = setup('server', true);

            render();

            expect(core.subscribeCount).toBe(0);
        });
    });

    describe('browser platform — hydration deferral', () => {
        it('reads undefined before the first render, even though the core holds true', () => {
            const { sig } = setup('browser', true);

            // This is the hydration-mismatch guard: the server rendered from
            // `undefined`, so the first client render must agree.
            expect(sig()).toBeUndefined();
        });

        it('does not subscribe before the first render', () => {
            const { core } = setup('browser', true);

            expect(core.subscribeCount).toBe(0);
        });

        it('adopts the real value after the first render', () => {
            const { sig } = setup('browser', true);

            render();

            expect(sig()).toBe(true);
        });

        it('tracks later changes once adopted', () => {
            const { core, sig } = setup('browser', undefined);
            render();
            expect(sig()).toBeUndefined();

            core.set(true);

            expect(sig()).toBe(true);
        });
    });

    describe('change detection', () => {
        /**
         * `afterNextRender` invokes its callback via `runOutsideAngular`, and a
         * zone-based app binds no `ChangeDetectionScheduler` (only
         * `provideZonelessChangeDetection` does). So a signal written from that
         * callback updates without scheduling a single CD pass — the value is
         * correct and the screen never repaints until some unrelated event ticks
         * the zone. On an idle hydrated page that can be never.
         */
        it('writes inside the Angular zone, so a repaint is scheduled', () => {
            const { core } = setup('browser', undefined);
            render();

            const zone = TestBed.inject(NgZone);
            const runSpy = vi.spyOn(zone, 'run');

            // A capability change arriving after adoption — e.g. a write grant
            // supplied post-login. Nothing else is touching the zone here, so
            // the spy is unambiguous.
            core.set(true);

            expect(runSpy).toHaveBeenCalled();
        });
    });

    describe('the tri-state is preserved', () => {
        it('adopts an explicit false as false', () => {
            const { sig } = setup('browser', false);

            render();

            expect(sig()).toBe(false);
        });

        it('never turns an unresolved undefined into false', () => {
            const { sig } = setup('browser', undefined);

            render();

            // `undefined` means HOLD, not read-only. Collapsing it drops misses.
            expect(sig()).toBeUndefined();
            expect(sig()).not.toBe(false);
        });
    });
});
