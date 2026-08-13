import {
    Directive,
    ElementRef,
    HostBinding,
    Input,
    PLATFORM_ID,
    inject,
    type AfterViewInit,
    type OnChanges,
    type OnDestroy,
    type SimpleChanges,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Phrase } from 'langsys-js-typescript';

/**
 * Keep a markup-bearing run of text as **one** translatable phrase.
 *
 * ```html
 * <p lsPhrase category="News" [params]="{ n: unreadCount }">
 *   You have {n} unread articles.
 * </p>
 *
 * <p lsPhrase category="News">
 *   The <span class="brand">White</span> House issued a statement.
 * </p>
 * ```
 *
 * Inline markup is replaced with neutral tokens and reconstituted after
 * translation, so a translator can reorder words around the styled span
 * (e.g. “Casa <span>Blanca</span>”) and pick the right plural form for `{n}`.
 */
@Directive({
    selector: '[lsPhrase]',
    standalone: true,
})
export class PhraseDirective implements AfterViewInit, OnChanges, OnDestroy {
    /** Category the phrase is registered under. */
    @Input() category?: string;
    /** Runtime values (e.g. `{ n: 3 }` for pluralization). */
    @Input() params?: Record<string, unknown>;

    /** Marks the host so the SDK's renderer can find it. */
    @HostBinding('attr.data-ls-phrase') readonly marker = '';

    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private instance: Phrase | null = null;

    ngAfterViewInit(): void {
        this.create();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.instance) return;

        if (changes['category']) {
            this.destroyInstance();
            this.create();
            return;
        }
        if (changes['params']) {
            this.instance.setParams(this.params ?? {});
        }
    }

    ngOnDestroy(): void {
        this.destroyInstance();
    }

    private create(): void {
        if (!this.isBrowser) return;
        this.instance = new Phrase(this.host.nativeElement as HTMLElement, {
            category: this.category,
            params: this.params,
        });
    }

    private destroyInstance(): void {
        this.instance?.destroy();
        this.instance = null;
    }
}
