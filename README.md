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
| `keyType`                               | `Signal<'read' \| 'write' \| undefined>`     | Detected key permission                                            |
| `t$`, `currentLocale$`, `translations$` | `Observable<…>`                              | RxJS mirrors                                                       |

Switch locale with `langsys.setLocale('es-ES')`.

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

All delegated to the base SDK, on `LangsysService`:

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

The DOM directives no-op on the server (they need a real DOM) and initialize on hydration.

## License

MIT
