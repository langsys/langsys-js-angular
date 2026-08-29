import { isSignal, type Signal } from '@angular/core';
import type { WriteGrant } from 'langsys-js-typescript';

/**
 * The Angular-flavored write grant. Everything the base SDK accepts, plus an
 * Angular signal — so refreshing the token is `grantSignal.set(next)` rather
 * than an imperative call.
 */
export type WriteGrantSource = WriteGrant | Signal<string | null | undefined>;

/**
 * Normalize the Angular grant option down to the base SDK's `WriteGrant`.
 *
 * A signal becomes a provider **function**, never a snapshot. The base SDK
 * resolves the grant immediately before every request and caches it nowhere, so
 * reading through on each call is what makes a later `grantSignal.set(token)`
 * take effect on the very next request instead of the next `init()`.
 *
 * This is the trap BIND-1 names explicitly: converting a reactive container
 * into a provider by reading it once looks like a pure adapter and silently
 * produces a grant that can never refresh. Grants live ~5 minutes; an app inits
 * once and runs for hours, so a snapshot is expired minutes in and every later
 * write degrades the session to read-only without saying so.
 *
 * `isSignal()` is load-bearing rather than cosmetic: a `WriteGrant` provider is
 * *also* a zero-argument function, so the two cases are indistinguishable by
 * `typeof`. Passing a signal straight through would happen to work — the core
 * would call it per request — but only by accident, and the accident stops
 * working the moment the core's provider contract takes an argument.
 */
export function adaptWriteGrant(grant: WriteGrantSource | undefined): WriteGrant | undefined {
    if (grant === undefined) return undefined;
    if (isSignal(grant)) return () => grant();
    return grant;
}
