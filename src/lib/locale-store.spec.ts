import { describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { createLocaleStore, signalToLocaleSource } from './locale-store';

describe('createLocaleStore', () => {
    it('seeds the Angular signal and the SDK source from the initial value', () => {
        const store = createLocaleStore('en-US');
        expect(store.locale()).toBe('en-US');
        expect(store.source.get()).toBe('en-US');
    });

    it('satisfies the SDK Signal contract itself, so it can be passed directly', () => {
        const store = createLocaleStore('en-US');
        const seen: string[] = [];

        // No `.source` hop — this is what `UserLocaleStore: locale` relies on.
        expect(store.get()).toBe('en-US');
        const off = store.subscribe((v) => seen.push(v));
        store.set('es-ES');
        store.update((prev) => prev.toUpperCase());
        off();

        expect(seen).toEqual(['en-US', 'es-ES', 'ES-ES']);
        expect(store.get()).toBe('ES-ES');
        expect(store.locale()).toBe('ES-ES');
    });

    it('keeps `.source` working as an alias of the store', () => {
        const store = createLocaleStore('en-US');
        expect(store.source).toBe(store);
    });

    it('defaults to en-US', () => {
        expect(createLocaleStore().locale()).toBe('en-US');
    });

    it('fires subscribers SYNCHRONOUSLY on set — the SDK contract', () => {
        const store = createLocaleStore('en-US');
        const seen: string[] = [];
        store.source.subscribe((v) => seen.push(v));

        // subscribe() fires immediately with the current value.
        expect(seen).toEqual(['en-US']);

        store.set('es-ES');

        // No awaiting, no flushing: the value must already be delivered.
        expect(seen).toEqual(['en-US', 'es-ES']);
        expect(store.source.get()).toBe('es-ES');
        expect(store.locale()).toBe('es-ES');
    });

    it('notifies synchronously when written through the SDK source too', () => {
        const store = createLocaleStore('en-US');
        const seen: string[] = [];
        store.source.subscribe((v) => seen.push(v));

        store.source.set('fr-FR');
        expect(seen).toEqual(['en-US', 'fr-FR']);
    });

    it('supports update() from the previous value', () => {
        const store = createLocaleStore('en-US');
        store.update((prev) => (prev === 'en-US' ? 'es-ES' : 'en-US'));
        expect(store.locale()).toBe('es-ES');

        store.source.update((prev) => prev.toLowerCase());
        expect(store.source.get()).toBe('es-es');
    });

    it('does not notify when the value is unchanged', () => {
        const store = createLocaleStore('en-US');
        const spy = vi.fn();
        store.source.subscribe(spy);
        spy.mockClear();

        store.set('en-US');
        expect(spy).not.toHaveBeenCalled();
    });

    it('stops notifying after unsubscribe', () => {
        const store = createLocaleStore('en-US');
        const spy = vi.fn();
        const unsubscribe = store.source.subscribe(spy);
        spy.mockClear();

        unsubscribe();
        store.set('es-ES');
        expect(spy).not.toHaveBeenCalled();
        // The signal still updates for the rest of the app.
        expect(store.locale()).toBe('es-ES');
    });

    it('fans out to every subscriber', () => {
        const store = createLocaleStore('en-US');
        const a = vi.fn();
        const b = vi.fn();
        store.source.subscribe(a);
        store.source.subscribe(b);

        store.set('de-DE');
        expect(a).toHaveBeenLastCalledWith('de-DE');
        expect(b).toHaveBeenLastCalledWith('de-DE');
    });
});

describe('signalToLocaleSource', () => {
    it('reads through to the underlying signal', () => {
        const s = signal('en-US');
        const source = signalToLocaleSource(s);
        expect(source.get()).toBe('en-US');

        s.set('es-ES');
        expect(source.get()).toBe('es-ES');
    });

    it('fires immediately on subscribe and synchronously on set', () => {
        const s = signal('en-US');
        const source = signalToLocaleSource(s);
        const seen: string[] = [];
        source.subscribe((v) => seen.push(v));

        expect(seen).toEqual(['en-US']);

        source.set('es-ES');
        expect(seen).toEqual(['en-US', 'es-ES']);
        expect(s()).toBe('es-ES');
    });

    it('supports update() and unsubscribe()', () => {
        const s = signal('en-US');
        const source = signalToLocaleSource(s);
        const spy = vi.fn();
        const off = source.subscribe(spy);

        source.update(() => 'fr-FR');
        expect(spy).toHaveBeenLastCalledWith('fr-FR');

        off();
        source.set('de-DE');
        expect(spy).not.toHaveBeenLastCalledWith('de-DE');
    });
});
