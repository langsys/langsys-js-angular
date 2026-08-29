# CONFORMANCE — langsys-js-angular

Conformance of this **binding** against the SDK Behaviour Spec.

|                             |                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec version                | **7** (`specVersion: 7`)                                                                                                                        |
| Spec text read              | `docs/sdk-spec.mdx` blob `06ae105a0a1f7b5245ec32929f0b3885c63f0336`, from `langsys2` `origin/main` @ `fabe22b2a54a06a6c7957b0ad06c52cc1274a4b5` |
| Read at                     | 2026-08-29T18:28:43Z                                                                                                                            |
| Repo state                  | branch `feature/838_write_key_gating`, Wave 3 landed                                                                                            |
| Suite                       | **82 tests / 8 files**, all passing (includes the 5-test upstream precondition)                                                                 |
| Evidence grade of the suite | **`mock`** — jsdom, SDK doubled, zero network                                                                                                   |
| Core consumed               | `langsys-js-typescript` local `0.6.5` via `npm link` — **not** the published `0.6.5` (see [The two 0.6.5s](#the-two-065s))                      |
| Profiles                    | `browser` · `binding` · `all`                                                                                                                   |

> **Nothing in this file is graded `implemented`, and that is correct.** CONF-2:
> the shared contract fixture does not exist, so `mock` evidence caps every
> behavioural row at `provisional` across all thirteen repos. A binding with no
> green ticks is the evidence model working, not a broken binding.

## Scope — why this file is short

This is a **binding**. It inherits the browser core's profile and adds nothing of its own, so
most of the spec is not its to satisfy: the core owns registration, discovery, interpolation and
identity outright. Grading those rules here would produce rows that cannot fail — the
green-proving-nothing failure CONF-1/CONF-3 exist to stop.

So this file carries exactly three things:

1. **BIND-1..6** — the binding backbone. Every row, no exceptions.
2. **Rules this binding could _interfere_ with** — where Angular code sits between the app and a
   core decision. Interference is the only way a binding fails a behavioural rule.
3. **One delegation block** for the families the core owns, each with a probe that could have
   found participation and did not.

A rule absent from this file is absent because this binding cannot reach it. Where that judgement
is non-obvious, the row says so rather than omitting it.

## Grades

| Grade         | Means                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `implemented` | Behaviour present, evidence `live` or `contract`. **Unreachable today** — CONF-2.                                                                                                    |
| `provisional` | Behaviour present, evidence `mock`. The honest ceiling until the fixture lands.                                                                                                      |
| `partial`     | Present but incomplete or with a known gap, described in the row.                                                                                                                    |
| `delegated`   | The core owns it and **this binding demonstrably does not participate** — an absence probe plus a positive control proving the probe could have found something. Never a bare "n/a". |
| `n-a`         | Structurally unreachable, with the reason stated and the condition that would make it live.                                                                                          |
| `open`        | A conformance question that is not mine to answer alone. Named, routed, unresolved. **Never green.**                                                                                 |

`delegated` is this program's addition (Reviewer, topic `838-intake-angular`). Its whole value is
the positive control: "we found nothing" is worthless unless the same search demonstrably finds
something when it is there.

## 1 — Binding rules (BIND-1..6)

| Rule                                                              | Grade         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BIND-1** — adapt shape/timing, never meaning                    | `provisional` | Adaptation is confined to Angular's execution model: SDK signals → Angular signals (`fromSdkSignal`), an impure pipe, three lifecycle-bound directives, DI bootstrap. No product behaviour is authored. **Gap, not a violation:** the timing adaptation BIND-1 sanctions (hydration) is absent because there is no capability surface yet to adapt. Wave 3.                                                                                                                                                                                                                                                                                |
| **BIND-2** — never branch on server-computed capability           | `partial`     | Does not branch: `keyType` is `computed(() => ready() ? LangsysAppAPI.config?.key_type : undefined)` — surfaced unchanged, permitted by the MAY clause, gated only on this binding's own readiness. **But `writeEnabled` is not exposed at all**, so the sole capability signal offered to consumers is the one GATE-1 forbids deciding from, and the README bills it "Detected key permission". The binding is compliant while steering its consumers wrong. Ranked gap #2.                                                                                                                                                               |
| **BIND-3** — owns no network behaviour                            | `delegated`   | Code-only probe (§3 method) for `fetch\|XMLHttpRequest\|setTimeout\|setInterval\|retry\|backoff\|headers`: **0 in this binding, 18 in the core**. The only URL it touches is `apiUrl` → `LangsysAppAPI.setBaseUrl()`, which sets no header and issues no request. _(Raw grep returns 7 — every one a JSDoc sentence containing the word "fetch". Hence the comment-stripping in §3.)_                                                                                                                                                                                                                                                      |
| **BIND-4** — introduces no configuration the core does not define | `provisional` | `LangsysConfig` adds exactly four keys beyond the core's: `apiUrl`, `initialLocale`, `blockUntilReady`, `UserLocaleStore`. `apiUrl` maps 1:1 onto the core's `setBaseUrl()` and is **required** by WIRE-5 to be discoverable where an integrator looks — ruled legitimate (Reviewer, `838-intake-angular`). The other three are bootstrap/lifecycle, which BIND-1 assigns to the binding. No `discovery`, `hint` or `suppress` option exists.                                                                                                                                                                                              |
| **BIND-5** — does not cache lookup results                        | **`open`**    | `TranslatePipe` is correctly _impure_, but memoizes the rendered string on `(TFunction identity, phrase, category, JSON(params))`. The key is sound against staleness — the core emits a new `TFunction` per catalog/locale change, so no cached value outlives the catalog that produced it. The unresolved part is upstream of the cache: **on a hit, `t()` is not called at all**, so within one catalog version a repeated phrase enters the core's miss path once per unique tuple rather than once per render. See [Open question](#open-question--bind-5--gate-7--cat-1). Routed to the Typescript lane. Not graded until answered. |
| **BIND-6** — wrap the narrowest surface possible                  | `partial`     | Re-exports by reference where it can (`tSignal`, `sTranslations`, `currentlyLoadedLocale`, `canonicalizeLocale`, `createSignal`, `LangsysAppAPI`, and 20 types). **But `LangsysService` wraps ~15 reference-data helpers by pure delegation** (`getCountries`, `getCurrencies`, `getDialCodes`, `getLocales*`, `getLocaleName*`, `detectPreferredLocale`, `refresh`) that need no adaptation — they are plain async data calls, not reactive. This is "wraps everything for consistency", and it forfeits the one-sentence exclusion BIND-6 exists to buy. Ranked gap #3.                                                                  |

## 2 — Rules this binding could interfere with

Angular code sits between the app and the core on exactly two paths: the **pipe** (every template
translation) and the **directives** (DOM tokenizing). Everything below is graded on those.

| Rule                                                                                               | Grade                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GATE-1** — decide from `write_enabled`, never `key_type`                                         | `delegated`              | The binding makes no register-or-report decision; `t()`, `Translate` and `Phrase` carry it. Probe: no `write_enabled` reference in `src/` (0 hits); positive control finds it 8 files deep in the core. See BIND-2 for the surfacing gap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **GATE-2** — collect always; choose the lane at the send site                                      | **`open`**               | The binding never collects or sends. But the pipe memo can suppress the `t()` call that _feeds_ collection — same mechanism as BIND-5. Cannot be graded green until that is answered.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **GATE-3** — never persist the write decision                                                      | `delegated`              | Code-only probe for `localStorage\|sessionStorage\|persist`: **0 in this binding, 27 in the core** (`discovery.ts`, `stores.ts`). This binding writes to no storage of any kind — there is nothing here that could outlive a page session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **GATE-4** — strip the decision from what you cache                                                | `delegated`              | The binding caches no response envelope. The only cache is the pipe's rendered _string_ (BIND-5); no `write_enabled` value passes through it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **GATE-7** — every detecting path feeds exactly one lane                                           | **`open`**               | Same mechanism as BIND-5: if GATE-7's lane-feed depends on re-entering `t()` per render, the pipe memo sits in front of it. Routed to Typescript.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **GATE-8** — missing `write_enabled` is a version signal                                           | `n-a`                    | The binding exposes no capability value, so it cannot collapse the tri-state. **Becomes live the moment `writeEnabled` is exposed** — the Wave-3 surface must publish `boolean \| undefined` and never default `undefined` to `false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **CAT-1** — a miss is decided by key presence, not truthiness                                      | **`open`**               | The binding reads no catalog directly. The sharp edge is the pipe cache: **absent** and **present-with-null** both render base text, so a cached _string_ cannot distinguish the two states BIND-5 requires to survive a cache. The binding never makes the decision — but it can suppress the call that does. Folded into the BIND-5 question.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **GRANT-1..4** — provider callback, per-request resolution, re-authorizing setter, `X-Write-Grant` | `n-a`                    | No grant surface exists in this binding today. **Wave 3:** `adaptWriteGrant(WriteGrant \| Signal<string\|null\|undefined>)` resolving **per call** (`() => sig()`), never snapshotting at init — BIND-1's costume trap, and the failure mode GRANT-1/2 were written for. `setWriteGrant` to be re-exported by reference so GRANT-3's re-authorization is the core's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **OBS-1** — surface an unusable capability at least once                                           | `delegated (core-owned)` | **Ruled core-owned** (Reviewer, `838-intake-angular`): the core makes the gate decision, so the core emits the diagnostic; a binding duplicating it would be BIND-2's shape — a binding-layer conclusion about a server-computed value. Probe for diagnostic emission (`logger.(warn\|error\|info)\|console.(warn\|error)`): **0 in this binding, 11 in the core**. Whether the core emits _this particular_ diagnostic yet is tracked on the TS core's open list, not here — the nearest is `langsys-app.ts:111`, a debug-level log of `write_enabled`, which is not the once-per-session diagnostic OBS-1 asks for.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **SSR-1..3** — do not collect server-side; degrade loudly                                          | `provisional`            | Both DOM-tokenizing directives hard-guard: `if (!this.isBrowser) return` via `isPlatformBrowser(inject(PLATFORM_ID))`, so `Translate`/`Phrase` are never constructed under Angular SSR. Covered by `directives.spec.ts`. **Unexplored shape:** `provideLangsys({ blockUntilReady: true })` awaits the first catalog load _before first render_, which no other binding faces — see ranked gap #1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **WIRE-3** — lowercase `xx-yy` on the wire and internally                                          | `delegated`              | All three locale paths normalize: `setLocale()` and `initialLocale` call `canonicalizeLocale()` in `langsys.service.ts`; `baseLocale` is canonicalized by the core at `langsys-app.ts:219`; delegated helpers route through the core's `resolveLocale()`. Probe against the linked core: `es-ES`→`es-es`, `ES-es`→`es-es`, `en-US`→`en-us`. The README's `'es-ES'` examples are cosmetic — normalized before anything leaves the client. **Fixture corrected this wave:** the service spec's `canonicalizeLocale` double uppercased the region (`en-US`) while the core lowercases the whole tag (`en-us`), so it certified the behaviour WIRE-3 forbids. It now mirrors `src/locale.ts` line for line and is verified to agree with production on 11 inputs including the invalid-tag fallback, `_` separators and surrounding whitespace. Three assertions turned red on the fix — they had been pinning `es-ES`/`de-DE` as canonical — and were corrected to lowercase. Production code was always right; only the double and its assertions were wrong. |
| **WIRE-5** — reachable test double, documented where integrators look                              | `provisional`            | `apiUrl` appears in **both** surfaces the rule names: the public type (`LangsysConfig.apiUrl`) and the README's Setup section. No artifact edit is needed to point the SDK at a double.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **CACHE-1** — cache keys namespaced by project                                                     | `n-a`                    | The binding holds no cross-session or shared cache. The pipe memo lives on a pipe _instance_ (one per template binding, destroyed with its view) and is keyed on `TFunction` identity, which changes with the catalog. Nothing is process-external or shared by default, which is the hazard CACHE-1 names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 3 — Delegation block: families the core owns

The binding does not participate in any of these. Each row states the probe and the positive
control that proves the probe works.

**Probe method.** Every count below is **code only** — comment and JSDoc lines are stripped
before counting, because this binding's prose mentions "fetch", "plural" and "registered"
constantly while its code does none of it. Counting raw grep lines would have reported seven
BIND-3 "hits" that are all documentation. The exact filter:

```bash
probe() {  # $1 = pattern, $2 = tree
  grep -rnE "$1" "$2" --include='*.ts' | grep -v '\.spec\.ts' | grep -vE ':[0-9]+: *(\*|//|/\*)'
}
```

| Family                                             | Probe pattern                                                                                                                   | Mine                         | Control (core)                                                   | Reading                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CID-1..4** (`custom_id`)                         | `custom_id\|customId\|generateCustomId\|md5`                                                                                    | pass-through `@Input()` only | `generateCustomId`, `generateLegacyCustomId`, `md5`, `md5Legacy` | **No generation, no hashing, no id derivation.** `custom_id` is handed verbatim to `new Translate(...)`.                                                                                                                                                                     |
| **ICU-1..5** (interpolation recovery)              | `intl-messageformat\|interpolate\|isICU\|plural`                                                                                | **0**                        | **15**                                                           | Params pass through as `Record<string, ParamPrimitive>`; the core formats.                                                                                                                                                                                                   |
| **REG-1..12** (write lane)                         | `batch\|flush\|keepalive\|sendBeacon\|debounce\|queue`                                                                          | **0**                        | **116**                                                          | No scheduling, batching or teardown flush.                                                                                                                                                                                                                                   |
| **BIND-3 / network**                               | `fetch\|XMLHttpRequest\|setTimeout\|setInterval\|retry\|backoff\|headers`                                                       | **0**                        | **18**                                                           | No network behaviour of any kind.                                                                                                                                                                                                                                            |
| **HINT-1..12** (discovery reports)                 | `location\|href\|hint\|discover\|fragment`                                                                                      | **0**                        | **93**                                                           | The hint lane reads `window.location.href` **inside the core** (`discovery.ts`) and normalizes at `normalizeHintUrl`, whose `/^#!?\/.+/` preserves `#/x` and `#!/x` while dropping bare anchors. No Angular code is on that path — there is no seam here to conform through. |
| **GATE-5, GATE-6** (bookkeeping, lane exclusivity) | `isContentBlockKnown\|registerContentBlock\|isPhraseMarked\|PHRASE_MARKER\|isTranslationExcluded\|sTranslations\.(set\|update)` | **0**                        | **28**                                                           | No "already seen" bookkeeping; the binding never writes the catalog store.                                                                                                                                                                                                   |
| **GATE-3** (never persist the decision)            | `localStorage\|sessionStorage\|persist`                                                                                         | **0**                        | **27**                                                           | This binding writes to no storage of any kind.                                                                                                                                                                                                                               |
| **GATE-1** (server-computed capability)            | `write_enabled`                                                                                                                 | **0**                        | **12**                                                           | The binding never reads the field.                                                                                                                                                                                                                                           |
| **CAT-2, CAT-3** (presence vs value; block shape)  | direct catalog reads                                                                                                            | **0**                        | —                                                                | The catalog is reached only through `t()` and `sTranslations`, both re-exported by reference.                                                                                                                                                                                |

> **A discarded probe, recorded because the lesson generalises.** GATE-5/6 was first probed with
> `registered|seen|marker`. That pattern returns **2 hits in this binding and 0 in the core** — the
> positive control fails, so the probe proves nothing, and had it been trusted it would have
> reported a violation that does not exist. The two hits are `@HostBinding` marker attributes (see
> below), not bookkeeping. **A `delegated` grade is only as good as a control that fires**; when
> the control comes back empty, the probe is wrong, not the code.

**On the two marker attributes.** `PhraseDirective` stamps `data-ls-phrase` and
`DontTranslateDirective` stamps `translate="no"` plus `data-ls-dont-translate`. Both are DOM
contract, not bookkeeping — the core's `content-block.ts` documents `data-ls-phrase` as _"set by
this SDK's framework `<Phrase>` components"_, which is precisely the shape-adaptation BIND-1
sanctions. Two notes for Wave 3, neither a conformance failure:

- The attribute name is **hardcoded** in the directive rather than imported from the core's
  exported `PHRASE_MARKER_ATTR`. A duplicated constant across a repo boundary is how CID-3-shaped
  drift starts; it should reference the export.
- `data-ls-dont-translate` is read by **nothing** in the core — `isTranslationExcluded()` honours
  `translate="no"` and `data-notrans` only. The directive works because it also sets
  `translate="no"`; the extra attribute is inert. It is a binding-invented DOM contract, which is
  a mild BIND-4 smell worth either removing or getting adopted by the core.

> A framework note that belongs with HINT: HINT-6's hashbang case was measured on **AngularJS
> 1.8.3**, a different framework from the Angular 17+ this binding targets. Modern Angular's
> `withHashLocation()` emits `#/x` only and has no bang mode, so the `#!/x` half of that rule
> protects apps that cannot use this binding. Raised with the Langsys lane (`sdk-integration-credentials`).

## The two 0.6.5s

`langsys-js-typescript@0.6.5` **on npm** and `0.6.5` **in the local working copy** are different
code under one version string: the 838 surface was added on top of the already-published 0.6.5
without a bump. No version comparison distinguishes them.

| probe                                   | published `0.6.5` | local `0.6.5` |
| --------------------------------------- | ----------------- | ------------- |
| `writeEnabled`                          | `undefined`       | `object`      |
| `setWriteGrant`                         | `undefined`       | `function`    |
| `autoDiscovery`                         | `undefined`       | `object`      |
| `generateCustomId` _(positive control)_ | `function`        | `function`    |

`src/lib/upstream-precondition.spec.ts` asserts this **by symbol, against the artifact
`require.resolve` returns**, so an `npm ci` that silently swaps the link for the registry tarball
is a red build rather than a silent bench swap. Every other test in this suite stays green
through that swap — they double the SDK and never touch the missing symbols.

**CONF-3 mutation evidence (recorded, reproducible):**

```
# 1. baseline, symlink in place
npx vitest run src/lib/upstream-precondition.spec.ts        # 5 passed

# 2. mutate: replace the link with the published tarball
npm pack langsys-js-typescript@latest && tar xzf langsys-js-typescript-0.6.5.tgz
rm -rf node_modules/langsys-js-typescript && cp -R package node_modules/langsys-js-typescript
# give it its runtime dep, so the failure is symbol absence and NOT a broken load
mkdir -p node_modules/langsys-js-typescript/node_modules && \
  ln -s <path>/intl-messageformat node_modules/langsys-js-typescript/node_modules/intl-messageformat

npx vitest run src/lib/upstream-precondition.spec.ts        # 3 failed | 2 passed
#   ✓ resolves the package at all
#   ✓ positive control: generateCustomId is a function   ← load is fine
#   × `writeEnabled` is absent.
#   × `setWriteGrant` is absent.
#   × `autoDiscovery` is absent.

# 3. restore
rm -rf node_modules/langsys-js-typescript && npm link langsys-js-typescript
```

The first attempt at this mutation went red for the **wrong reason** — `intl-messageformat` was
missing, so the package could not load at all — and the positive control is what said so. That is
the control earning its place, and the reason step 2 provides the dep.

## Open question — BIND-5 / GATE-7 / CAT-1

**Does a binding-level memo in front of `t()` violate BIND-5?**

`TranslatePipe` caches the rendered string per `(TFunction, phrase, category, params)`. Staleness
is handled — a new `TFunction` per catalog change invalidates everything. The question is whether
the core needs `t()` re-entered on **every render** to keep feeding GATE-7's lane, or whether it
dedupes internally (REG debounce, HINT-4's one-report-per-URL-per-session), in which case the memo
is free.

The pipe is deliberately impure _because_ a pure pipe would not re-run on locale change, so
removing the memo means a full lookup every change-detection cycle for every translated binding on
the page. That is a real cost, which is why this is a ruling and not a unilateral fix.

Routed to the **Typescript** lane via Reviewer (`838-intake-angular`). Unchanged pending the
answer. **It generalises** — Solid's equivalent memo will have the same shape.

## Wave-3 mutation evidence

Every behaviour landed in Wave 3 was checked by breaking it and watching the suite go red. Recorded
per CONF-3, because a passing test proves nothing until it has been shown capable of failing.

| Behaviour                            | Mutation applied                                   | Result                                                                                                  |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Grant resolves per call (GRANT-2)    | `const snapshot = grant(); return () => snapshot`  | **2 of 7 red** — and the other 5 green, which is the point: a snapshotting adapter passes a naive suite |
| Grant reaches `init()`               | drop `writeGrant:` from the `LangsysApp.init` call | **2 red**                                                                                               |
| Hydration deferral (BIND-1 timing)   | subscribe eagerly instead of in `afterNextRender`  | **2 red** — reads-undefined-before-render, and does-not-subscribe-before-render                         |
| Marker attribute from the core       | revert to `@HostBinding('attr.data-ls-phrase')`    | **1 red** — but only after the double was given a sentinel; against the old double it stayed green      |
| Upstream artifact is the linked core | swap the symlink for the published tarball         | **3 red, 2 green** — positive control passes, so the failure is symbol absence, not a broken load       |
| SSR guard on `writeEnabled`          | delete the `isPlatformBrowser` early return        | **0 red — reported as unfalsifiable, not as passing.** See the SSR row                                  |

Two of these changed what shipped. The grant mutation is the reason the per-call test exists at all;
the marker mutation exposed a test double that could not fail, which is [CONF-2](#)'s
"check the verifier" reaching the fixture rather than the code.

## Ranked gaps

1. **The pipe memo question is still open** (BIND-5 / GATE-2 / GATE-7 / CAT-1). Routed to the
   Typescript lane; the pipe is deliberately untouched pending the ruling.
2. **The hydration guard has never met a real hydration.** jsdom proves the deferral and the
   tri-state; it cannot prove that a genuine SSR → hydrate handoff avoids a mismatch, because that
   needs a server render and a client hydration in one process. Deferred to the program's E2E wave.
   Independent review of the adapter is in flight.
3. **The SSR guard on `writeEnabled` rests on an unproven claim.** It is kept as defence in depth,
   but its value depends on `afterNextRender` being platform-gated — measured here, and being
   independently pressure-tested. If that claim fails, the guard becomes load-bearing rather than
   redundant, and the SSR row's grade changes with it.

_Closed this wave:_ OBS-1 (ruled core-owned, now `delegated`), the locale-double inversion
(fixed and verified against production), and both marker-attribute items.

## Reproducing this file's evidence

```bash
npm link langsys-js-typescript     # bench: local core, not the registry tarball
npm test                           # 63 tests, 6 files — includes the precondition
npm run typecheck                  # red against the published core; green against local
npm run lint
```

Every probe in this file is the `probe()` filter from §3 — a `grep` over `src/`, excluding
`*.spec.ts` **and comment lines** — paired with the identical probe over
`langsys-js-typescript/src/` as its positive control. Patterns are stated inline per row so they
can be re-run rather than trusted, and a probe whose control returns zero is reported as a broken
probe rather than a passing row.
