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
 *
 * ## Why the URL is part of the cache key
 * `t()` does more than return a string: on a miss it records the phrase for
 * content discovery, and that lane keys on **the URL the miss occurred on**. The
 * core deliberately records the miss *before* its own registration dedup
 * (`translations.ts:274-277`) — "a phrase already queued from an earlier route
 * must not suppress the record for the page being viewed now".
 *
 * `TFunction` identity does not change on a client-side route change. So a memo
 * keyed only on it would skip `t()` for every tuple already rendered anywhere
 * else in the session, and a page built largely from shared chrome, navigation
 * and error copy would report **nothing** — not a degraded hint, no hint at all,
 * silently, for the rest of the session.
 *
 * The href is used **raw and unnormalized**, deliberately. The core normalizes
 * URLs for the hint lane, but `normalizeHintUrl` is not exported, and guessing
 * at a matching normalization is the wrong risk to take: over-invalidating costs
 * one extra `t()` call per binding, which lands in the core's own per-URL and
 * per-`(category, phrase)` dedup and costs nothing downstream — while
 * under-invalidating silently destroys a page's discovery. When one side of a
 * trade is "a few wasted lookups" and the other is "a whole page reports
 * nothing, forever", the key should be too sensitive rather than too clever.
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
    private lastHref = '';
    private lastResult = '';

    transform(phrase: string, category?: string, params?: Params): string {
        // Reading the signal here is what ties the host view to locale changes.
        const fn = this.langsys.t();
        const paramsKey = params ? JSON.stringify(params) : '';
        // Raw, unnormalized, and read fresh each pass — see the docblock. Guarded
        // for SSR, where there is no `location` and the core's discovery lane
        // bails on the missing `window` anyway.
        const href = typeof location === 'undefined' ? '' : location.href;

        if (
            fn === this.lastFn &&
            phrase === this.lastPhrase &&
            category === this.lastCategory &&
            paramsKey === this.lastParamsKey &&
            href === this.lastHref
        ) {
            return this.lastResult;
        }

        const call = fn as unknown as (p: string, c?: string, pa?: Params) => string;
        const result = params ? call(phrase, category, params) : call(phrase, category);

        this.lastFn = fn;
        this.lastPhrase = phrase;
        this.lastCategory = category;
        this.lastParamsKey = paramsKey;
        this.lastHref = href;
        this.lastResult = result;
        return result;
    }
}
