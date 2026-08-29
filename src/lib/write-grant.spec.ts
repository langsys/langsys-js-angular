import { describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { adaptWriteGrant } from './write-grant';

describe('adaptWriteGrant', () => {
    it('passes a string grant through unchanged', () => {
        expect(adaptWriteGrant('tok_abc')).toBe('tok_abc');
    });

    it('passes undefined through — an unset grant is meaningful to the core', () => {
        // Not the same as a provider returning null: unset tells the SDK no grant
        // can ever arrive, so it releases held misses to the report lane.
        expect(adaptWriteGrant(undefined)).toBeUndefined();
    });

    it('passes a provider function through by reference', () => {
        const provider = () => 'tok_from_fn';
        expect(adaptWriteGrant(provider)).toBe(provider);
    });

    it('converts a signal into a provider function, not a value', () => {
        const grant = signal<string | null>('tok_1');
        const adapted = adaptWriteGrant(grant);

        expect(typeof adapted).toBe('function');
        expect((adapted as () => string | null)()).toBe('tok_1');
    });

    /**
     * The BIND-1 trap, stated as a test: a snapshotting adapter passes every
     * assertion above and fails only this one.
     */
    it('resolves the signal PER CALL, so a later set() reaches the next request', () => {
        const grant = signal<string | null>('tok_1');
        const adapted = adaptWriteGrant(grant) as () => string | null;

        expect(adapted()).toBe('tok_1');

        grant.set('tok_2_refreshed');

        expect(adapted()).toBe('tok_2_refreshed');
    });

    it('reads the signal only when called, never at adaptation time', () => {
        const inner = signal<string | null>('tok_1');
        const read = vi.fn(() => inner());
        // A signal-shaped spy: isSignal() keys off the SIGNAL brand, so reuse a
        // real signal's identity while counting reads.
        const grant = Object.assign(read, inner) as unknown as typeof inner;

        const adapted = adaptWriteGrant(grant) as () => string | null;
        expect(read).not.toHaveBeenCalled();

        adapted();
        adapted();
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('propagates null from a signal — "no grant yet" is sent as no header', () => {
        const grant = signal<string | null>(null);
        const adapted = adaptWriteGrant(grant) as () => string | null;

        expect(adapted()).toBeNull();
    });
});
