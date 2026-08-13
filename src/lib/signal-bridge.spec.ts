import { describe, expect, it, vi } from 'vitest';
import { Injector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Signal as SdkSignal } from 'langsys-js-typescript';
import { fromSdkSignal } from './signal-bridge';

/** Minimal stand-in for the base SDK's Signal contract. */
function makeSdkSignal<T>(initial: T) {
    let current = initial;
    const subs = new Set<(v: T) => void>();
    const signal: SdkSignal<T> = {
        get: () => current,
        set: (v: T) => {
            current = v;
            subs.forEach((r) => r(v));
        },
        update: (fn: (p: T) => T) => signal.set(fn(current)),
        subscribe: (run: (v: T) => void) => {
            subs.add(run);
            run(current);
            return () => subs.delete(run);
        },
    };
    return { signal, subscriberCount: () => subs.size };
}

describe('fromSdkSignal', () => {
    it('seeds synchronously from the SDK signal', () => {
        const { signal } = makeSdkSignal('en-US');
        const s = fromSdkSignal(signal, { autoDestroy: false });
        expect(s()).toBe('en-US');
    });

    it('tracks subsequent emissions', () => {
        const { signal } = makeSdkSignal('en-US');
        const s = fromSdkSignal(signal, { autoDestroy: false });

        signal.set('es-ES');
        expect(s()).toBe('es-ES');

        signal.set('fr-FR');
        expect(s()).toBe('fr-FR');
    });

    it('works with non-primitive payloads (e.g. the TFunction closure)', () => {
        const first = () => 'first';
        const second = () => 'second';
        const { signal } = makeSdkSignal<() => string>(first);
        const s = fromSdkSignal(signal, { autoDestroy: false });

        expect(s()).toBe(first);
        signal.set(second);
        expect(s()).toBe(second);
    });

    it('stays subscribed when autoDestroy is false', () => {
        const { signal, subscriberCount } = makeSdkSignal('en-US');
        fromSdkSignal(signal, { autoDestroy: false });
        expect(subscriberCount()).toBe(1);
    });

    it('unsubscribes when the injection context is destroyed', () => {
        const { signal, subscriberCount } = makeSdkSignal('en-US');
        const parent = TestBed.inject(Injector);
        const child = createEnvironmentInjector([], parent as never);

        runInInjectionContext(child, () => fromSdkSignal(signal));
        expect(subscriberCount()).toBe(1);

        child.destroy();
        expect(subscriberCount()).toBe(0);
    });

    it('does not throw when used outside an injection context', () => {
        const { signal } = makeSdkSignal('en-US');
        expect(() => fromSdkSignal(signal, { autoDestroy: false })).not.toThrow();
    });

    it('subscribes exactly once per call', () => {
        const subscribe = vi.fn(() => () => undefined);
        const signal = {
            get: () => 'en-US',
            set: () => undefined,
            update: () => undefined,
            subscribe,
        } as unknown as SdkSignal<string>;

        fromSdkSignal(signal, { autoDestroy: false });
        expect(subscribe).toHaveBeenCalledTimes(1);
    });
});
