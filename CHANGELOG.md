# Changelog

All notable changes to `langsys-js-angular` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — Unreleased

Initial release: an Angular 17+ binding over `langsys-js-typescript`, the Angular sibling of
`langsys-js-vue`.

### Added

- **`provideLangsys(config)`** — standalone bootstrap provider. Registers the service, optionally
  points the SDK at a self-hosted backend via `apiUrl`, and blocks app initialization until the first
  catalog load settles (opt out with `blockUntilReady: false`).
- **`LangsysService`** — signals-first API: `t`, `currentLocale`, `locale`, `translations`, `ready`,
  `error`, `keyType`, plus `translate()` and `setLocale()`. Every base-SDK helper is delegated
  (`getCountries`, `getDialCodes`, `getCurrencies`, the `getLocales*` and `getLocaleName*` families,
  `detectPreferredLocale`, `refresh`, `translationsLoadingPromise`).
- **Observable interop** — `t$`, `currentLocale$` and `translations$` mirror the signals for
  RxJS-centric codebases.
- **`TranslatePipe`** (`| t`) — `{{ 'Save' | t: 'UI' : params }}`. Deliberately impure (a pure pipe
  would never re-run on a locale change) but memoized on the `TFunction` identity, so a cache hit
  costs only reference comparisons.
- **Directives** — `[lsTranslate]` (content blocks with `custom_id`, `label`, `params`, `%name%`
  placeholders and harvested attributes), `[lsPhrase]` (pluralization and markup reordering), and
  `[lsDontTranslate]`. All are attribute directives, so no wrapper elements are introduced. They
  no-op during SSR and initialize on hydration.
- **`LANGSYS_IMPORTS`** — convenience bundle of every template feature.
- **Adapters** — `createLocaleStore()` (satisfies the base SDK's *synchronous* notification contract,
  which Angular's async `effect()` cannot), `signalToLocaleSource()` and `fromSdkSignal()`.
- Full type re-exports from `langsys-js-typescript`, so consumers never import from the base package.
- Test suite (56 tests) covering the locale-store contract, the signal bridge, pipe memoization and
  reactivity, service init/delegation, and directive lifecycles.

### Notes

- Built with Angular 17 in partial-Ivy mode; supports Angular 17 through 20.
- `apiUrl` is an Angular-side convenience: the base SDK exposes no init option for the API host, so
  this binding calls `LangsysAppAPI.setBaseUrl()` for you.
