# CONFORMANCE — langsys-js-angular

Conformance of this **binding** against the SDK Behaviour Spec.

|                             |                                                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec version                | **7** (`specVersion: 7`)                                                                                                                        |
| Spec text read              | `docs/sdk-spec.mdx` blob `06ae105a0a1f7b5245ec32929f0b3885c63f0336`, from `langsys2` `origin/main` @ `fabe22b2a54a06a6c7957b0ad06c52cc1274a4b5` |
| Read at                     | 2026-08-29T18:28:43Z                                                                                                                            |
| Repo state                  | branch `feature/838_write_key_gating`, Wave 3 landed + independent-review fixes                                                                 |
| Suite                       | **85 tests / 8 files**, all passing (includes the 5-test upstream precondition)                                                                 |
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

| Rule                                                              | Grade         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BIND-1** — adapt shape/timing, never meaning                    | `provisional` | Adaptation is confined to Angular's execution model: SDK signals → Angular signals, an impure pipe, three lifecycle-bound directives, DI bootstrap, and the hydration timing guard in `write-enabled.ts`. The guard adapts **when** the value may be read, never what it means — the value is the core's throughout. Mutations: replacing `afterNextRender` with an eager subscribe turns 2 tests red; dropping the `NgZone` re-entry turns 1 red.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **BIND-2** — never branch on server-computed capability           | `provisional` | Branches on nothing: `writeEnabled` and `keyType` are both surfaced unchanged (the MAY clause), and no code path reads either to decide anything. What Wave 3 changed is what consumers are steered toward — `writeEnabled` is exposed as the only authoritative capability signal, and `keyType`'s doc comment and README row both say **do not branch on it**, naming the two cases where they disagree (unrecognised address; read key plus a valid grant).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **BIND-3** — owns no network behaviour                            | `delegated`   | Code-only probe (§3 method) for `fetch\|XMLHttpRequest\|setTimeout\|setInterval\|retry\|backoff\|headers`: **0 in this binding, 18 in the core**. The only URL it touches is `apiUrl` → `LangsysAppAPI.setBaseUrl()`, which sets no header and issues no request. _(Raw grep returns 7 — every one a JSDoc sentence containing the word "fetch". Hence the comment-stripping in §3.)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **BIND-4** — introduces no configuration the core does not define | `provisional` | `LangsysConfig` adds exactly four keys beyond the core's: `apiUrl`, `initialLocale`, `blockUntilReady`, `UserLocaleStore`. `apiUrl` maps 1:1 onto the core's `setBaseUrl()` and is **required** by WIRE-5 to be discoverable where an integrator looks — ruled legitimate (Reviewer, `838-intake-angular`). The other three are bootstrap/lifecycle, which BIND-1 assigns to the binding. No `discovery`, `hint` or `suppress` option exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **BIND-5** — does not cache lookup results                        | `provisional` | **Resolved by the Typescript ruling** (TS `6cdb388`): registration is idempotent (`translations.ts:287` `sameToken` dedup, `:240` known-check), so first-entry-per-tuple suffices there — but **discovery requires re-entry per URL**, because `recordMissForDiscovery` runs _before_ the registration dedup (`:274-277`) and the hint lane keys on the URL the miss occurred on. `TFunction` identity does not change on a client-side route change, so the memo as originally shipped suppressed discovery for every tuple already rendered in the session. **Fixed:** the memo key now includes the raw `location.href`. Bracketed by mutation in both directions — dropping the href reds the route-change test, and over-invalidating reds three memo tests — so the key is proven neither too loose nor too tight. Graded **`provisional`, not `implemented`**, despite the lane instruction saying "implemented-with-fix": CONF-2 is explicit that behaviour which is implemented but evidenced only by `mock` records `provisional`, and this suite is jsdom with the SDK doubled. The fix is implemented; the _evidence tier_ is what the grade names. Flagged rather than silently downgraded — if the intent was the literal tier, it is one word to change. |
| **BIND-6** — wrap the narrowest surface possible                  | `provisional` | **14 pure pass-through wrappers removed** (`getCountries`, `getCurrencies`, `getDialCodes`, `getLocales*`, `getLocaleName*`, `getLanguageName`, `detectPreferredLocale`, `refresh`, `translationsLoadingPromise`) — 55 lines. `LangsysApp` is now re-exported **by reference** and callers use it directly. `setWriteGrant` likewise: GRANT-3 requires it to re-authorize rather than store config, so a wrapper could only get that wrong. The one value deliberately **not** re-exported is the core's raw `writeEnabled` — see GATE-8.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 2 — Rules this binding could interfere with

Angular code sits between the app and the core on exactly two paths: the **pipe** (every template
translation) and the **directives** (DOM tokenizing). Everything below is graded on those.

| Rule                                                                                               | Grade                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GATE-1** — decide from `write_enabled`, never `key_type`                                         | `delegated`              | The binding makes no register-or-report decision; `t()`, `Translate` and `Phrase` carry it. Probe: no `write_enabled` reference in `src/` (0 hits); positive control finds it 8 files deep in the core. See BIND-2 for the surfacing gap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **GATE-2** — collect always; choose the lane at the send site                                      | `delegated`              | The binding neither collects nor sends; the lane is chosen at the core's flush site. The one way it could interfere — starving the feed by memoizing in front of `t()` — is closed by the BIND-5 fix. Lane-feed probe (`recordMissForDiscovery\|missingToken\|shouldQueueForWrite\|scheduleTokenFlush`): **0 in this binding, 36 in the core**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **GATE-3** — never persist the write decision                                                      | `delegated`              | Code-only probe for `localStorage\|sessionStorage\|persist`: **0 in this binding, 6 in the core** (`discovery.ts`, `stores.ts`). This binding writes to no storage of any kind — there is nothing here that could outlive a page session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **GATE-4** — strip the decision from what you cache                                                | `delegated`              | The binding caches no response envelope. Probe for envelope/cache handling (`write_enabled\|authData\|envelope\|JSON.stringify\|structuredClone`): **1 in this binding, 30 in the core across 8 files**. The single hit is `translate.pipe.ts:45`, `JSON.stringify(params)` building the memo's params key — a cache of rendered strings, not of any server response, so no `write_enabled` value passes through it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **GATE-7** — every detecting path feeds exactly one lane                                           | `provisional`            | The binding's one detecting path is the pipe, and it now re-enters `t()` per URL, so every miss reaches the core's lane selection exactly once per page — the coverage property GATE-7 is about. Directives feed the same lanes through `content-block.ts` rather than `t()`, so they were never affected by the memo. Pinned by the route-change test; mutation-verified both ways.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **GATE-8** — missing `write_enabled` is a version signal                                           | `provisional`            | Live as of Wave 3: `LangsysService.writeEnabled` publishes `boolean \| undefined` and never substitutes a default. Two tests pin it — an explicit `false` is adopted as `false`, and an unresolved `undefined` stays `undefined` rather than collapsing. The binding never consults `key_type` to fill the gap; GATE-8's fallback is the core's to make. **The core's raw `writeEnabled` is deliberately not re-exported**: reading it during hydration is the mismatch the guarded signal exists to prevent, so exporting both would hand callers the foot-gun while implying they are interchangeable.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **CAT-1** — a miss is decided by key presence, not truthiness                                      | `delegated`              | The binding reads no catalog: presence-vs-value is decided inside `t()`. The memo caches rendered strings, and **absent** and **present-with-null** do render the same base text — but that is no longer load-bearing, because the memo can no longer suppress the call that makes the distinction. Registration idempotence (per the ruling) means a repeat within one URL costs nothing; discovery gets its per-URL re-entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **GRANT-1..4** — provider callback, per-request resolution, re-authorizing setter, `X-Write-Grant` | `provisional`            | `adaptWriteGrant(WriteGrant \| Signal<string\|null\|undefined>)` converts a signal to a provider **function**, never a snapshot, and `LangsysConfig.writeGrant` documents the signal/function form as the default (GRANT-1). **Mutation evidence for GRANT-2:** snapshotting at adaptation time leaves the majority of the suite green and turns only the discriminating tests red — a naive suite ships it. Wiring is separately mutation-tested: dropping `writeGrant` from the `init()` call reds 2 service tests. GRANT-3 is the core's via a by-reference `setWriteGrant` re-export; GRANT-4's header is core-side (BIND-3).                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OBS-1** — surface an unusable capability at least once                                           | `delegated (core-owned)` | **Ruled core-owned** (Reviewer, `838-intake-angular`): the core makes the gate decision, so the core emits the diagnostic; a binding duplicating it would be BIND-2's shape — a binding-layer conclusion about a server-computed value. Probe for diagnostic emission (`logger.(warn\|error\|info)\|console.(warn\|error)`): **0 in this binding, 11 in the core across 6 files**. Whether the core emits _this particular_ diagnostic yet is tracked on the TS core's open list, not here — the nearest is `langsys-app.ts:111`, a debug-level log of `write_enabled`, which is not the once-per-session diagnostic OBS-1 asks for.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **SSR-1..3** — do not collect server-side; degrade loudly                                          | `provisional`            | Both DOM-tokenizing directives hard-guard `if (!this.isBrowser) return`, so `Translate`/`Phrase` are never constructed under Angular SSR. `writeEnabled` additionally never subscribes server-side. **One honest caveat:** that last guard is _not independently falsifiable_ — removing it turns no test red, because `afterNextRender` runs on browser platforms only. That is Angular's **documented** contract (`core.mjs:15156`, confirmed independently), not incidental behaviour, so the guard is redundant-but-principled: it keeps a correctness property whose failure would harm every later visitor from resting on an upstream promise this package does not control. The two server-platform tests pin the observable contract, not the guard, and say so.                                                                                                                                                                                                                                                                                   |
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

| Family                                             | Probe pattern                                                                                                   | Mine                         | Control (core)                                                   | Reading                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CID-1..4** (`custom_id`)                         | `custom_id\|customId\|generateCustomId\|md5`                                                                    | pass-through `@Input()` only | `generateCustomId`, `generateLegacyCustomId`, `md5`, `md5Legacy` | **No generation, no hashing, no id derivation.** `custom_id` is handed verbatim to `new Translate(...)`.                                                                                                                                                                                                                                                                                                                                     |
| **ICU-1..5** (interpolation recovery)              | `intl-messageformat\|interpolate\|isICU\|plural`                                                                | **0**                        | **15** (8 files)                                                 | Params pass through as `Record<string, ParamPrimitive>`; the core formats.                                                                                                                                                                                                                                                                                                                                                                   |
| **REG-1..12** (write lane)                         | `batch\|flush\|keepalive\|sendBeacon\|debounce\|queue`                                                          | **0**                        | **42** (5 files)                                                 | No scheduling, batching or teardown flush.                                                                                                                                                                                                                                                                                                                                                                                                   |
| **BIND-3 / network**                               | `fetch\|XMLHttpRequest\|setTimeout\|setInterval\|retry\|backoff\|headers`                                       | **0**                        | **18** (3 files)                                                 | No network behaviour of any kind.                                                                                                                                                                                                                                                                                                                                                                                                            |
| **HINT-1..12** (discovery reports)                 | `location\|href\|hint\|discover\|fragment`                                                                      | **0**                        | **25** (5 files)                                                 | The hint lane reads `window.location.href` **inside the core** (`discovery.ts`) and normalizes at `normalizeHintUrl`, whose `/^#!?\/.+/` preserves `#/x` and `#!/x` while dropping bare anchors. No Angular code is on that path.                                                                                                                                                                                                            |
| **GATE-5, GATE-6** (bookkeeping, lane exclusivity) | `isContentBlockKnown\|registerContentBlock\|isPhraseMarked\|isTranslationExcluded\|sTranslations.(set\|update)` | **0**                        | **23** (6 files)                                                 | No "already seen" bookkeeping; the binding never writes the catalog store. **Reported honestly:** adding `PHRASE_MARKER` to this pattern gives **3** hits in the binding — the import, the re-export and the `@HostBinding` from the Wave-3 marker fix. Those are DOM contract, not bookkeeping, so the constant is excluded from the pattern rather than the hits being explained away. Both numbers are stated so the choice is auditable. |
| **GATE-3** (never persist the decision)            | `localStorage\|sessionStorage\|persist`                                                                         | **0**                        | **6** (4 files)                                                  | This binding writes to no storage of any kind.                                                                                                                                                                                                                                                                                                                                                                                               |
| **GATE-1** (server-computed capability)            | `write_enabled`                                                                                                 | **0**                        | **7** (3 files)                                                  | The binding never reads the field.                                                                                                                                                                                                                                                                                                                                                                                                           |
| **CAT-2, CAT-3** (presence vs value; block shape)  | direct catalog reads                                                                                            | **0**                        | —                                                                | The catalog is reached only through `t()` and `sTranslations`, both re-exported by reference.                                                                                                                                                                                                                                                                                                                                                |

> **A discarded probe, recorded because the lesson generalises.** GATE-5/6 was first probed with
> `registered|seen|marker`. That pattern returns **2 hits in this binding and 0 in the core** — the
> positive control fails, so the probe proves nothing, and had it been trusted it would have
> reported a violation that does not exist. The two hits are `@HostBinding` marker attributes (see
> below), not bookkeeping. **A `delegated` grade is only as good as a control that fires**; when
> the control comes back empty, the probe is wrong, not the code.

**On the marker attributes — both Wave-3 items closed.** `PhraseDirective` stamps `data-ls-phrase` and
`DontTranslateDirective` stamps `translate="no"` plus `data-ls-dont-translate`. Both are DOM
contract, not bookkeeping — the core's `content-block.ts` documents `data-ls-phrase` as _"set by
this SDK's framework `<Phrase>` components"_, which is precisely the shape-adaptation BIND-1
sanctions. Both Wave-3 items are closed:

- **Now imported, not hardcoded.** `@HostBinding(\`attr.${PHRASE_MARKER_ATTR}\`)`reads the core's
export, so a rename there fails here instead of silently orphaning every phrase this binding
stamps. Proving it required fixing the *test double* first: it echoed the real attribute name, so
it could not tell an imported constant from a hardcoded literal — both stamp the same string. The
double now returns a **sentinel**, which makes the two outcomes different. Mutation: reverting the
directive to`'attr.data-ls-phrase'`turns the test red. *(AOT resolves the template literal — the
built host binding is`"attr.data-ls-phrase"`. The unresolved form survives only in the JIT
  metadata block, where the constant is in scope.)*
- **`data-ls-dont-translate` removed.** Nothing in the core read it — `isTranslationExcluded()`
  honours `translate="no"` and `data-notrans` only — so it was a binding-invented DOM contract with
  no consumer: surface pretending to be behaviour. The directive is unaffected because
  `translate="no"` was always doing the work. A test now asserts the attribute is **absent**, so it
  cannot quietly return.

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

## Resolved — the pipe memo (BIND-5 / GATE-2 / GATE-7 / CAT-1)

The question this file carried as `open` for two waves — _does a binding-level memo in front of
`t()` violate BIND-5?_ — was answered by the Typescript lane, and the answer was **yes, in one
half**.

**Registration** is idempotent, so a memo costs nothing there. **Discovery** is not: the core
records a miss _before_ its registration dedup, deliberately, because the hint lane keys on the URL
the miss occurred on. `TFunction` identity is stable across a client-side route change, so the memo
as originally shipped suppressed the discovery record for every phrase already rendered anywhere
else in the session. A page built largely from shared chrome, navigation and error copy would have
reported **nothing at all** — not a degraded hint, no hint, silently, for the rest of the session.

The fix adds the **raw, unnormalized** `location.href` to the memo key. Unnormalized on purpose:
the core normalizes for the hint lane, but `normalizeHintUrl` is not exported, and guessing at a
matching normalization is the wrong risk. Over-invalidating costs one extra `t()` call per binding,
which lands in the core's own per-URL and per-`(category, phrase)` dedup and costs nothing
downstream. Under-invalidating silently destroys a page's discovery. When one side of the trade is
a few wasted lookups and the other is a whole page reporting nothing forever, the key should be too
sensitive rather than too clever.

**Worth recording as a class:** the memo was correct on every axis anyone had thought to check —
it never served a stale translation, and the `TFunction` key is genuinely sound for that. It was
wrong about a side effect of the function it was caching. A cache in front of a call that both
returns a value _and_ records something is only as correct as its model of the recording, and
nothing about the returned string reveals the omission.

**Also confirmed by the ruling:** fresh-`TFunction`-identity-per-emit is a contract, not an
incidental, and the core is pinning it with a comment at both emit sites plus an identity-reuse
test. The memo's primary key stands on a promise rather than an observation.

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

1. **The hydration guard has never met a real hydration.** jsdom proves the deferral and the
   tri-state; it cannot prove that a genuine SSR → hydrate handoff avoids a mismatch, because that
   needs a server render and a client hydration in one process. Deferred to the program's E2E wave.
2. **v19 incremental hydration is not covered.** A `@defer (hydrate on viewport)` subtree branching
   on `writeEnabled` hydrates long after this guard has dropped, against server markup built from
   `undefined` — mismatch, subtree recreated. A render-pass-scoped guard structurally cannot see
   this; it needs the value pinned per hydration boundary. Raised by independent review, filed to
   the E2E wave's scenario list. Not a defect in what shipped, a limit of what a v17-shaped guard
   can do.

_Resolved by independent review:_ the `afterNextRender` platform-gating claim the SSR guard rests on
is **Angular's documented contract**, not incidental behaviour (`core.mjs:15156`, "on browser
platforms only"). The guard is therefore redundant-but-principled exactly as filed, and the SSR row
stands.

Both remaining gaps are **program** items on the E2E wave's scenario list, not lane items. Nothing
on the implementable surface is outstanding.

_Closed:_ the pipe memo (all four rows, per the Typescript ruling), OBS-1 (core-owned), the
locale-double inversion, both marker-attribute items, and the zone-based-v17 repaint bug.

## Reproducing this file's evidence

```bash
npm link langsys-js-typescript     # bench: local core, not the registry tarball
npm test                           # 85 tests, 8 files — includes the precondition
npm run typecheck                  # red against the published core; green against local
npm run lint
```

Every probe in this file is the `probe()` filter from §3 — a `grep` over `src/`, excluding
`*.spec.ts` **and comment lines** — paired with the identical probe over
`langsys-js-typescript/src/` as its positive control. Patterns are stated inline per row so they
can be re-run rather than trusted, and a probe whose control returns zero is reported as a broken
probe rather than a passing row.
