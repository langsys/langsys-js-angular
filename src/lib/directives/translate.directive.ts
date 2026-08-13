import {
    Directive,
    ElementRef,
    Input,
    PLATFORM_ID,
    inject,
    type AfterViewInit,
    type OnChanges,
    type OnDestroy,
    type SimpleChanges,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Translate } from 'langsys-js-typescript';
import type { ParamPrimitive } from 'langsys-js-typescript';

/**
 * Register an element's whole subtree as a translatable **content block**.
 *
 * ```html
 * <section lsTranslate category="News" custom_id="news-hero" label="News hero"
 *          [params]="{ name: user.name }">
 *   <h2>Welcome back, %name%</h2>
 *   <p>Rich <strong>markup</strong> is preserved for translators.</p>
 *   <input placeholder="Search the news…" aria-label="Search" />
 * </section>
 * ```
 *
 * The underlying vanilla class walks the DOM, harvests text nodes and
 * translatable attributes (`placeholder`, `alt`, `title`, `aria-label`, …),
 * registers the block, and re-translates on locale change.
 *
 * Author runtime placeholders in markup as `%name%` (normalized to `{name}`),
 * and keep the projected children **static** — the class mutates this DOM in
 * place, so let `[params]` carry anything dynamic.
 */
@Directive({
    selector: '[lsTranslate]',
    standalone: true,
})
export class TranslateDirective implements AfterViewInit, OnChanges, OnDestroy {
    /** Category the block's tokens are registered under. */
    @Input() category?: string;
    /** Stable id for the block; otherwise the SDK hashes category + tokens. */
    @Input() custom_id?: string;
    /** Human-readable label shown in the Translation Manager. */
    @Input() label?: string;
    /** Runtime values interpolated into `%name%` placeholders. */
    @Input() params?: Record<string, ParamPrimitive>;

    private readonly host = inject(ElementRef<HTMLElement>);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private instance: Translate | null = null;

    ngAfterViewInit(): void {
        this.create();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.instance) return;

        // Identity of the block changed → rebuild it.
        if (changes['category'] || changes['custom_id'] || changes['label']) {
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
        if (!this.isBrowser) return; // the tokenizer needs a real DOM
        this.instance = new Translate(this.host.nativeElement as HTMLElement, {
            category: this.category,
            custom_id: this.custom_id,
            label: this.label,
            params: this.params,
        });
    }

    private destroyInstance(): void {
        this.instance?.destroy();
        this.instance = null;
    }
}
