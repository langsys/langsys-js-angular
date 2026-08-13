import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { TFunction } from 'langsys-js-typescript';
import { LangsysService } from './langsys.service';
import { TranslatePipe } from './translate.pipe';

/**
 * The pipe only needs `t` from the service, so we stand in a minimal fake and
 * drive it by swapping the TFunction — exactly what the SDK does on every
 * translations/locale change.
 */
function setup(initial: (...a: unknown[]) => string) {
    const t = signal(initial as unknown as TFunction);
    TestBed.configureTestingModule({
        providers: [{ provide: LangsysService, useValue: { t } }],
    });
    const pipe = TestBed.runInInjectionContext(() => new TranslatePipe());
    return { pipe, t };
}

describe('TranslatePipe', () => {
    beforeEach(() => TestBed.resetTestingModule());

    it('is declared impure — a pure pipe would never re-run on a locale change', () => {
        // Guards the core design decision; see the class docblock.
        const def = (TranslatePipe as unknown as { ɵpipe: { pure: boolean } }).ɵpipe;
        expect(def.pure).toBe(false);
    });

    it('passes the phrase through the translation function', () => {
        const { pipe } = setup((p) => `T:${p}`);
        expect(pipe.transform('Save')).toBe('T:Save');
    });

    it('forwards the category', () => {
        const fn = vi.fn((p: string, c?: string) => `${p}|${c}`);
        const { pipe } = setup(fn as never);
        expect(pipe.transform('Save', 'UI')).toBe('Save|UI');
    });

    it('forwards params only when provided', () => {
        const fn = vi.fn((...args: unknown[]) => JSON.stringify(args));
        const { pipe } = setup(fn as never);

        pipe.transform('Hi {name}', 'UI', { name: 'Ada' });
        expect(fn).toHaveBeenLastCalledWith('Hi {name}', 'UI', { name: 'Ada' });

        pipe.transform('Save', 'UI');
        expect(fn).toHaveBeenLastCalledWith('Save', 'UI');
    });

    it('re-translates when the TFunction identity changes (locale switch)', () => {
        const { pipe, t } = setup((p) => `EN:${p}`);
        expect(pipe.transform('Save', 'UI')).toBe('EN:Save');

        t.set(((p: string) => `ES:${p}`) as unknown as TFunction);
        expect(pipe.transform('Save', 'UI')).toBe('ES:Save');
    });

    it('memoizes: repeated identical calls do not re-invoke the TFunction', () => {
        const fn = vi.fn((p: string) => `T:${p}`);
        const { pipe } = setup(fn as never);

        pipe.transform('Save', 'UI');
        pipe.transform('Save', 'UI');
        pipe.transform('Save', 'UI');

        // Impure pipes run on every change-detection pass, so the cache is what
        // keeps that cheap.
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('busts the cache when the phrase changes', () => {
        const fn = vi.fn((p: string) => `T:${p}`);
        const { pipe } = setup(fn as never);

        pipe.transform('Save', 'UI');
        pipe.transform('Cancel', 'UI');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('busts the cache when the category changes', () => {
        const fn = vi.fn((p: string, c?: string) => `${p}|${c}`);
        const { pipe } = setup(fn as never);

        pipe.transform('Home', 'Main Menu');
        pipe.transform('Home', 'Home repairs');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('busts the cache when param values change', () => {
        const fn = vi.fn((p: string, _c?: string, pa?: Record<string, unknown>) => `${p}:${pa?.['n']}`);
        const { pipe } = setup(fn as never);

        expect(pipe.transform('You have {n}', 'UI', { n: 1 })).toBe('You have {n}:1');
        expect(pipe.transform('You have {n}', 'UI', { n: 2 })).toBe('You have {n}:2');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('treats an equal-by-value params object as a cache hit', () => {
        const fn = vi.fn((p: string) => p);
        const { pipe } = setup(fn as never);

        pipe.transform('Hi {name}', 'UI', { name: 'Ada' });
        pipe.transform('Hi {name}', 'UI', { name: 'Ada' }); // new object, same content
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
