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
import { PHRASE_MARKER_ATTR, Phrase } from 'langsys-js-typescript';
import type { ParamPrimitive } from 'langsys-js-typescript';
import { LangsysService } from '../langsys.service';
import { insideBlock, renderPhraseHost } from '../server-blocks';

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
    @Input() params?: Record<string, ParamPrimitive>;

    /**
     * Marks the host so the SDK's tokenizer finds it. The attribute name comes
     * from the core's `PHRASE_MARKER_ATTR` rather than a literal: it is a
     * cross-repo contract, and a duplicated constant is how it silently drifts.
     */
    @HostBinding(`attr.${PHRASE_MARKER_ATTR}`) readonly marker = '';

    private readonly host = inject(ElementRef<HTMLElement>);
    /** On a server, the request's scope to render in; in a browser, the core's `Phrase` runs directly. */
    private readonly langsys = isPlatformBrowser(inject(PLATFORM_ID)) ? null : inject(LangsysService);
    private instance: Phrase | null = null;

    ngAfterViewInit(): void {
        if (this.langsys) {
            // A phrase host inside a block renders with its block.
            const host = this.host.nativeElement as HTMLElement;
            if (insideBlock(host)) return;
            this.langsys.inRequestScope(() => renderPhraseHost(host, { category: this.category, params: this.params }));
            return;
        }
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
