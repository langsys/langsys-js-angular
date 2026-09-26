# langsys-js-angular

Angular binding over [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) for the
Langsys Translation Manager. Signals-first, standalone-ready, with Observable interop.

It is the Angular sibling of [`langsys-js-vue`](https://github.com/langsys/langsys-js-vue) and exposes the
same capabilities in Angular idioms: where Vue uses composables returning refs, Angular uses an injectable
service exposing **signals**, a `| t` pipe, and attribute **directives** for the DOM-tokenizing features.

Requires **Angular 17+** (standalone APIs + signals).

## Install

```bash
npm install langsys-js-angular
```

## Setup

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideLangsys } from 'langsys-js-angular';

bootstrapApplication(AppComponent, {
    providers: [
        provideLangsys({
            projectid: '…',
            key: '…', // read key = fetch-only; write key = auto-registers phrases
            baseLocale: 'en-US',
            initialLocale: 'en-US',
            // apiUrl: 'https://my-langsys.example.com/api',  // self-hosted backend
            // writeGrant: grantSignal,                       // login-walled apps — see Write capability
        }),
    ],
});
```

`provideLangsys` blocks bootstrap until the first catalog load settles, so the app never paints
untranslated text. Pass `blockUntilReady: false` to render immediately instead.

> **`apiUrl` is an Angular-side convenience.** The base SDK has no init option for the API host, so this
> binding wires `LangsysAppAPI.setBaseUrl()` for you.

## Translating

### In templates — the `| t` pipe

```html
{{ 'Save' | t }} {{ 'Save' | t: 'UI' }} {{ 'Hello, {name}!' | t: 'Greetings' : { name: user.name } }}
```

The phrase is both the lookup key and the base-language default — there is no separate keys file.
The category is part of the key, so the same word can be translated differently per context:

```html
{{ 'Home' | t: 'Main Menu' }}
<!-- the nav item -->
{{ 'Home' | t: 'Home repairs' }}
<!-- the building -->
```

### In code — the service

```ts
private readonly langsys = inject(LangsysService);

label = this.langsys.translate('Save', 'UI');   // reactive when read in a template/computed
title = computed(() => this.langsys.t()('Welcome', 'UI'));
```

### Parameter formatting

Params accept `string | number | Date | boolean`. Numbers and Dates are formatted with `Intl` in the
loaded locale; pass a string to opt out.

## Reactive state

| Member                                  | Type                                         | Notes                                                              |
| --------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `t`                                     | `Signal<TFunction>`                          | New closure on every translations/locale change                    |
| `currentLocale`                         | `Signal<string>`                             | The **loaded** locale (lags the selection until the fetch settles) |
| `locale`                                | `Signal<string>`                             | The user-selected locale                                           |
| `translations`                          | `Signal<iCategories>`                        | Raw catalog                                                        |
| `ready` / `error`                       | `Signal<boolean>` / `Signal<string \| null>` | Init state                                                         |
| `writeEnabled`                          | `Signal<boolean \| undefined>`               | **Whether this session may register.** See below                   |
| `keyType`                               | `Signal<'read' \| 'write' \| undefined>`     | Diagnostic only — **do not branch on it**                          |
| `t$`, `currentLocale$`, `translations$` | `Observable<…>`                              | RxJS mirrors                                                       |

Switch locale with `langsys.setLocale('es-ES')`.

## Write capability

`writeEnabled` is the **only** authoritative answer to "may this session register phrases?", and
it is **tri-state**:

| Value       | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `undefined` | Not yet authorized — hold. Neither register nor report.    |
| `true`      | Register missing phrases.                                  |
| `false`     | Read-only; misses go to the discovery-report lane instead. |

```html
@if (langsys.writeEnabled() === undefined) { <span>Checking…</span> } @else if (langsys.writeEnabled()) {
<button>Edit translations</button>
}
```

> **Do not branch on `keyType`, and do not treat `undefined` as `false`.** `keyType` reports what
> the key _is_; `writeEnabled` reports what this session may _do_, and the two disagree in exactly
> the cases that matter — the same write key is read-only from an unrecognised address, and a read
> key becomes write-enabled once a valid write grant is supplied. Capability is computed by the
> server, never derived on the client.

`writeEnabled` stays `undefined` through the first render so a server-rendered page and its
hydrated markup agree; it adopts the real value on the next change-detection pass.

### Write grants

Login-walled apps our discovery renderer cannot reach lend write capability to a session with a
short-lived grant (sent as `X-Write-Grant`). Pass a **signal** and refresh it by setting it:

```ts
const grant = signal<string | null>(null); // null until login

provideLangsys({ projectid: '…', key: '…', writeGrant: grant });

// later, once your auth layer mints one:
grant.set(token);
```

A string is accepted but rarely right: grants live ~5 minutes while an app inits once and runs for
hours, so a static string is expired minutes in and every later write silently degrades to
read-only. A signal (or a provider function) is resolved fresh before each request.

Prefer configuring a source that returns `null` until login over leaving `writeGrant` unset —
unset tells the SDK no grant can ever arrive, so it releases held misses to the report lane.
To supply one after `init()`, `setWriteGrant()` is re-exported from the base SDK.

## Route changes

```ts
import { provideRouter } from '@angular/router';
import { provideLangsysNavigation } from 'langsys-js-angular/router';

bootstrapApplication(AppComponent, {
    providers: [provideRouter(routes), provideLangsys({ … }), provideLangsysNavigation()],
});
```

Content that stays on screen across a navigation — a header beside `<router-outlet>`, an `OnPush`
layout, a `computed` translation, an `lsTranslate` block in the shell — is not re-rendered when only
the route changes. `provideLangsysNavigation()` tells the SDK after every completed navigation, so
those phrases are looked up again at the new URL and a missing one is discovered for the page it now
appears on. It lives in its own entry point, so applications without `@angular/router` never import it.

## Server messages

A Langsys-aware server leaves its framework's error response as it is and attaches message entries
beside it — for Laravel, under `langsys_errors` next to the 422 body's own `errors` map. An entry
carries `template`, the framework's sentence unfilled, its `params`, and `message`, the sentence
already filled; `field` and `code` are the framework's own, passed through unchanged. Tell
`resolveServerMessages` where the entries sit, and render them with the `tMessage` pipe:

```ts
import { resolveServerMessages } from 'langsys-js-angular';

this.errors = resolveServerMessages(response.error, { key: 'langsys_errors' });
```

```html
@for (entry of errors; track $index) {
<p class="error">{{ entry | tMessage }}</p>
}
```

`key` is the dotted path your server attaches the entries under, and `pieces` renames an entry's
pieces when the server was configured with names of its own; for failures carried some other way,
pass `{ resolver: (body) => entries }` instead. The rest of the body is never searched, and with
neither `key` nor `resolver` the call throws.

The pipe shows the translated template when the catalog holds one, and `message` otherwise. `code`
is for your logic — highlight or focus a field — never for choosing text. Templates are registered
and looked up under one category, `Errors` unless `messagesCategory` in `provideLangsys()` says
otherwise, and it must match the category the server uses. In code,
`LangsysService.renderServerMessage(entry, category?)` does the same.

## Moving off a key-based library

An app whose templates still call keys (`{{ 'checkout.submit' | t }}`) can keep its source-language
files and hand them to `provideLangsys()`:

```ts
import en from './i18n/en.json';

provideLangsys({ …, legacyKeys: [{ name: 'i18n/en.json', format: 'i18next', data: en }] });
```

The `t` pipe and `translate()` then resolve their argument as a key first. A key the files hold
renders and registers its value — `Place order`, never `checkout.submit` — under the key's first
segment as the category, unless the call passes one. Anything else is literal source text. The
file's placeholders and plurals are converted to Langsys syntax. Formats are `i18next`, `vue-i18n`
and `plain` (the default); any other format stops `init` with an error naming the file. Leave
`legacyKeys` unset and no key lookup happens.

## Snapshots

A catalog snapshot exported by the Langsys CLI can ship with the app, so the first render — or a
session with no network — has translations without waiting for a fetch:

```ts
import snapshot from './langsys-snapshot.json';

provideLangsys({ …, snapshot });
```

It is loaded synchronously as the catalog for the starting locale before anything renders. It is a
cache, not the catalog of record: the catalog is still fetched, replaces it and supplies any phrase
it lacks, and with no network the snapshot keeps rendering and a phrase it lacks shows its source
text. Refresh it by exporting again, never by editing it — an edited snapshot no longer matches its
checksum, so it is refused: nothing from it is served, `LangsysService.error` names the reason
(`SnapshotError` is re-exported for matching on it in code), and the catalog is fetched as if no
snapshot were configured.

## Directives

```html
<!-- Content block: whole subtree registered as one translatable unit -->
<section lsTranslate category="News" custom_id="news-hero" [params]="{ name: user.name }">
    <h2>Welcome back, %name%</h2>
    <p>Rich <strong>markup</strong> is preserved for translators.</p>
    <input placeholder="Search…" aria-label="Search the archive" />
</section>

<!-- Rich phrase: pluralization and markup reordering -->
<p lsPhrase category="News" [params]="{ n: count }">You have &#123;n&#125; unread articles.</p>

<!-- Never translated -->
<span lsDontTranslate>Kangen Water®</span>
```

Import them individually, or all template features at once:

```ts
import { LANGSYS_IMPORTS } from 'langsys-js-angular';

@Component({ standalone: true, imports: [LANGSYS_IMPORTS], … })
```

Text and translatable attributes (`placeholder`, `alt`, `title`, `aria-label`, …) are harvested
automatically. In markup, author runtime placeholders as `%name%` (normalized to `{name}`).

Text a server has already output in a translated locale can sit inside a subtree marked
`data-ls-resolved` (or `data-langsys-resolved`). The directives record nothing inside it, because
that text is not source; the nearest marked ancestor decides, and `data-ls-resolved="false"` on a
component's root opts that component's own blocks back in. The marker governs DOM hosts only: a `t`
pipe or `translate()` call inside the subtree is still an ordinary lookup and records its miss.

> ⚠️ Keep the content inside `lsTranslate` / `lsPhrase` **static** — the underlying classes mutate that
> DOM in place. Put anything dynamic in `[params]`.

## Angular template gotchas

Two Angular-specific traps when writing phrases in templates:

1. **Literal `{` in template text** is parsed as an ICU expression. Write braces as HTML entities:
   `You have &#123;n&#125; unread articles.` (Inside `{{ … }}` interpolation, braces are fine.)
2. **`${…}` inside a TypeScript backtick template** is interpolated by JavaScript before Angular sees
   it. Escape it (`\${amount}`) or use an external `.html` template.

## Why the pipe is impure

A pure pipe only re-runs when its **inputs** change — a locale switch changes neither the phrase nor the
category, so it would serve a stale translation forever. `TranslatePipe` is therefore impure, but
memoized on the `TFunction` identity (the SDK emits a fresh closure on every change), so a cache hit
costs a few reference comparisons.

## Utility helpers

These are **re-exported from the base SDK by reference**, not wrapped — call them on `LangsysApp`:

```ts
import { LangsysApp } from 'langsys-js-angular';

await LangsysApp.getCountries('es-ES');
```

```ts
getCountries(inLocale?)      getCountryName(code, inLocale?)
getCurrencies(inLocale?)     getCurrencyName(code, inLocale?)
getDialCodes(inLocale?)
getLocales(inLocale?)        getLocalesFlat(inLocale?)   getLocalesData(inLocale?, forceRefresh?)
getLocaleName(locale, short?, inLocale?)                 // sync — see note
getLocaleNameWithLookup(locale, short?, inLocale?)       // async, fetches the dataset first
detectPreferredLocale(acceptLanguageHeader?, supportedLocales?)
refresh()                    translationsLoadingPromise
```

> They take no adapting — they are plain async data calls, not reactive — so this binding does not
> wrap them. Wrapping surface it does not adapt is what stops a binding from being ruled out of an
> investigation in one sentence.

> `getLocaleName` is synchronous and reads a cache that only the async helpers populate. Call
> `await getLocalesData(inLocale)` first, or use `getLocaleNameWithLookup`, otherwise it returns `''`.

## Bring your own locale source

```ts
import { signalToLocaleSource } from 'langsys-js-angular';

const locale = signal('en-US');
provideLangsys({ …, UserLocaleStore: signalToLocaleSource(locale) });
```

The SDK requires _synchronous_ notification on locale change, which Angular's `effect()` cannot provide,
so write through the returned source (or use the default store and `setLocale()`).

## SSR

Pass a server-prefetched catalog to skip the client's initial fetch:

```ts
provideLangsys({ …, initialTranslations, initialTranslationsLocale, ssrTokenStrategy: 'client' });
```

The DOM directives no-op on the server (they need a real DOM) and initialize on hydration, so
`lsTranslate` and `lsPhrase` content is served in the base language, without its identity stamp,
and translated after hydration.

> **Precondition — `ssrTokenStrategy: 'server'` requires the origin server's IP address to be
> allow-listed for the project.** Without it the server lane fails silently and totally: no error,
> no request, nothing in the catalog, no report.

> **Known limitation — concurrent server renders share one catalog.** The catalog lives in the base
> SDK's module globals, which are process-wide, so two requests rendering different locales at the
> same time can serve each other's translations. Measured: an `it-it` render concurrent with a
> `de-de` one was served German. Until request-scoped serving lands, `initialTranslations` gives
> correct per-locale bytes only when renders do not overlap. Reproduce with `_dev_/ssr-measure`.

## License

MIT
