import { Pipe, inject, type PipeTransform } from '@angular/core';
import type { ParamPrimitive, TFunction } from 'langsys-js-typescript';
import { LangsysService } from './langsys.service';

type Params = Record<string, ParamPrimitive> | undefined;

/**
 * Translate a phrase in a template:
 *
 * ```html
 * {{ 'Save' | t }}
 * {{ 'Save' | t: 'UI' }}
 * {{ 'Hello, {name}!' | t: 'Greetings' : { name: user.name } }}
 * ```
 *
 * ## Why this pipe is impure
 * A *pure* pipe is only re-evaluated when its **inputs** change. A locale switch
 * changes neither the phrase nor the category, so a pure pipe would keep serving
 * the stale translation — and, because Angular skips `transform()` entirely on a
 * cache hit, the signal read wouldn't even be tracked.
 *
 * So the pipe is impure (runs each change-detection pass) but memoized on the
 * `TFunction` identity: the SDK emits a brand-new closure on every
 * translations/locale change, which makes it a perfect cache key. On a cache hit
 * the pipe returns the stored string without re-doing the lookup, so the
 * per-cycle cost is a handful of reference comparisons.
 */
@Pipe({
    name: 't',
    standalone: true,
    pure: false,
})
export class TranslatePipe implements PipeTransform {
    private readonly langsys = inject(LangsysService);

    private lastFn: TFunction | null = null;
    private lastPhrase: string | null = null;
    private lastCategory: string | undefined = undefined;
    private lastParamsKey = '';
    private lastResult = '';

    transform(phrase: string, category?: string, params?: Params): string {
        // Reading the signal here is what ties the host view to locale changes.
        const fn = this.langsys.t();
        const paramsKey = params ? JSON.stringify(params) : '';

        if (
            fn === this.lastFn &&
            phrase === this.lastPhrase &&
            category === this.lastCategory &&
            paramsKey === this.lastParamsKey
        ) {
            return this.lastResult;
        }

        const call = fn as unknown as (p: string, c?: string, pa?: Params) => string;
        const result = params ? call(phrase, category, params) : call(phrase, category);

        this.lastFn = fn;
        this.lastPhrase = phrase;
        this.lastCategory = category;
        this.lastParamsKey = paramsKey;
        this.lastResult = result;
        return result;
    }
}
