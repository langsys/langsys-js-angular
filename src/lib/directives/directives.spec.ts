import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

/** Records what the directives do to the vanilla DOM classes. */
const spies = vi.hoisted(() => ({
    translateCtor: vi.fn(),
    translateSetParams: vi.fn(),
    translateDestroy: vi.fn(),
    phraseCtor: vi.fn(),
    phraseSetParams: vi.fn(),
    phraseDestroy: vi.fn(),
}));

vi.mock('langsys-js-typescript', () => {
    class Translate {
        constructor(host: HTMLElement, options: unknown) {
            spies.translateCtor(host, options);
        }
        setParams(p: unknown) {
            spies.translateSetParams(p);
        }
        destroy() {
            spies.translateDestroy();
        }
    }
    class Phrase {
        constructor(host: HTMLElement, options: unknown) {
            spies.phraseCtor(host, options);
        }
        setParams(p: unknown) {
            spies.phraseSetParams(p);
        }
        destroy() {
            spies.phraseDestroy();
        }
    }
    // Deliberately NOT the real attribute name. A double echoing the production
    // value cannot tell an imported constant from a hardcoded literal — both
    // stamp the same string and the test passes either way. The sentinel makes
    // the two outcomes different, so the assertion below can actually fail.
    return { Translate, Phrase, PHRASE_MARKER_ATTR: 'data-ls-phrase-sentinel' };
});

const { TranslateDirective } = await import('./translate.directive');
const { PhraseDirective } = await import('./phrase.directive');
const { DontTranslateDirective } = await import('./dont-translate.directive');
const { PHRASE_MARKER_ATTR } = await import('langsys-js-typescript');

describe('DontTranslateDirective', () => {
    @Component({
        standalone: true,
        imports: [DontTranslateDirective],
        template: `<span lsDontTranslate>Kangen Water®</span>`,
    })
    class Host {}

    it('marks the host so neither the SDK nor the browser translates it', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        const el = fixture.nativeElement.querySelector('span') as HTMLElement;

        // `translate="no"` is the whole mechanism: it is what the core's
        // `isTranslationExcluded()` honours, and what browsers respect.
        expect(el.getAttribute('translate')).toBe('no');
        expect(el.textContent).toContain('Kangen Water®');
    });
});

describe('DontTranslateDirective — no invented contract', () => {
    @Component({
        standalone: true,
        imports: [DontTranslateDirective],
        template: `<span lsDontTranslate>Kangen Water®</span>`,
    })
    class Host2 {}

    it('stamps no binding-invented attribute the core does not read', () => {
        const fixture = TestBed.createComponent(Host2);
        fixture.detectChanges();
        const el = fixture.nativeElement.querySelector('span') as HTMLElement;

        // `data-ls-dont-translate` was inert — `isTranslationExcluded()` honours
        // `translate="no"` and `data-notrans`, never this. A binding-invented DOM
        // contract that nothing consumes is surface pretending to be behaviour.
        expect(el.hasAttribute('data-ls-dont-translate')).toBe(false);
    });
});

describe('TranslateDirective', () => {
    @Component({
        standalone: true,
        imports: [TranslateDirective],
        template: `
            @if (shown()) {
                <section lsTranslate [category]="category()" custom_id="hero" label="Hero block" [params]="params()">
                    <h2>Welcome back, %name%</h2>
                </section>
            }
        `,
    })
    class Host {
        readonly shown = signal(true);
        readonly category = signal('News');
        readonly params = signal<Record<string, string>>({ name: 'Sarah' });
    }

    beforeEach(() => vi.clearAllMocks());

    it('constructs the vanilla Translate on the host element with its options', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();

        expect(spies.translateCtor).toHaveBeenCalledTimes(1);
        const [host, options] = spies.translateCtor.mock.calls[0] as [HTMLElement, Record<string, unknown>];
        expect(host.tagName).toBe('SECTION');
        expect(options).toMatchObject({
            category: 'News',
            custom_id: 'hero',
            label: 'Hero block',
            params: { name: 'Sarah' },
        });
    });

    it('pushes param changes through setParams instead of rebuilding', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        spies.translateCtor.mockClear();

        fixture.componentInstance.params.set({ name: 'Carlos' });
        fixture.detectChanges();

        expect(spies.translateSetParams).toHaveBeenCalledWith({ name: 'Carlos' });
        expect(spies.translateCtor).not.toHaveBeenCalled();
    });

    it('rebuilds the block when its identity (category) changes', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        spies.translateCtor.mockClear();

        fixture.componentInstance.category.set('Blog');
        fixture.detectChanges();

        expect(spies.translateDestroy).toHaveBeenCalledTimes(1);
        expect(spies.translateCtor).toHaveBeenCalledTimes(1);
        expect((spies.translateCtor.mock.calls[0] as [HTMLElement, Record<string, unknown>])[1]).toMatchObject({
            category: 'Blog',
        });
    });

    it('destroys the instance when the element is removed', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();

        fixture.componentInstance.shown.set(false);
        fixture.detectChanges();

        expect(spies.translateDestroy).toHaveBeenCalledTimes(1);
    });

    it('destroys the instance when the component is destroyed', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        fixture.destroy();

        expect(spies.translateDestroy).toHaveBeenCalledTimes(1);
    });
});

describe('PhraseDirective', () => {
    @Component({
        standalone: true,
        imports: [PhraseDirective],
        template: `<p lsPhrase [category]="category()" [params]="params()">You have &#123;n&#125; unread.</p>`,
    })
    class Host {
        readonly category = signal('News');
        readonly params = signal<Record<string, unknown>>({ n: 3 });
    }

    beforeEach(() => vi.clearAllMocks());

    it("marks the host with the CORE's phrase attribute, not a hardcoded copy", () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        const el = fixture.nativeElement.querySelector('p') as HTMLElement;

        // The attribute is a cross-repo contract. Reading it from the core's
        // export means a rename there fails loudly here, instead of silently
        // orphaning every phrase this binding stamps.
        expect(el.hasAttribute(PHRASE_MARKER_ATTR)).toBe(true);
        expect(el.hasAttribute('data-ls-phrase')).toBe(false);
    });

    it('constructs the vanilla Phrase with category and params', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();

        expect(spies.phraseCtor).toHaveBeenCalledTimes(1);
        const [, options] = spies.phraseCtor.mock.calls[0] as [HTMLElement, Record<string, unknown>];
        expect(options).toMatchObject({ category: 'News', params: { n: 3 } });
    });

    it('updates params without rebuilding', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        spies.phraseCtor.mockClear();

        fixture.componentInstance.params.set({ n: 7 });
        fixture.detectChanges();

        expect(spies.phraseSetParams).toHaveBeenCalledWith({ n: 7 });
        expect(spies.phraseCtor).not.toHaveBeenCalled();
    });

    it('rebuilds only when the category changes', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        spies.phraseCtor.mockClear();

        fixture.componentInstance.category.set('Blog');
        fixture.detectChanges();

        expect(spies.phraseDestroy).toHaveBeenCalledTimes(1);
        expect(spies.phraseCtor).toHaveBeenCalledTimes(1);
    });

    it('destroys on teardown', () => {
        const fixture = TestBed.createComponent(Host);
        fixture.detectChanges();
        fixture.destroy();
        expect(spies.phraseDestroy).toHaveBeenCalledTimes(1);
    });
});
