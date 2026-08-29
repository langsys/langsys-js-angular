import { Directive, HostBinding } from '@angular/core';

/**
 * Mark content that must never be translated — brand names, code, identifiers.
 *
 * ```html
 * <span lsDontTranslate>Kangen Water®</span>
 * <code lsDontTranslate>%PATH%</code>
 * ```
 *
 * Purely presentational: it sets `translate="no"`, which is what the core's
 * `isTranslationExcluded()` actually honours (alongside `data-notrans`) and what
 * browser translation features respect, so the content is never harvested,
 * registered, or replaced. It also protects a literal `%WORD%` from being
 * mistaken for an interpolation placeholder.
 */
@Directive({
    selector: '[lsDontTranslate]',
    standalone: true,
})
export class DontTranslateDirective {
    @HostBinding('attr.translate') readonly translate = 'no';
}
