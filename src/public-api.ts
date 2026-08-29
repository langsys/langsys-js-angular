/**
 * langsys-js-angular — idiomatic Angular binding over `langsys-js-typescript`.
 *
 * Public API:
 *   - `provideLangsys(config)` — register + initialize during app bootstrap.
 *   - `LangsysService` — signals-first API (`t`, `currentLocale`, `translations`,
 *     `locale`, `ready`) with Observable mirrors, plus every SDK helper.
 *   - `TranslatePipe` (`| t`) — translate in templates.
 *   - `TranslateDirective` / `PhraseDirective` / `DontTranslateDirective` —
 *     the DOM-tokenizing content-block, rich-phrase, and opt-out directives.
 *   - `createLocaleStore` / `signalToLocaleSource` / `fromSdkSignal` — adapters.
 *   - Raw SDK signals and `canonicalizeLocale` re-exported for advanced use.
 */

// Bootstrap + config
export { provideLangsys } from './lib/provide-langsys';
export { LANGSYS_CONFIG, type LangsysConfig } from './lib/config';

// Service
export { LangsysService } from './lib/langsys.service';

// Template API
export { TranslatePipe } from './lib/translate.pipe';
export { TranslateDirective } from './lib/directives/translate.directive';
export { PhraseDirective } from './lib/directives/phrase.directive';
export { DontTranslateDirective } from './lib/directives/dont-translate.directive';

// Adapters
export { createLocaleStore, signalToLocaleSource, type LocaleStore } from './lib/locale-store';
export { fromSdkSignal } from './lib/signal-bridge';
export { adaptWriteGrant, type WriteGrantSource } from './lib/write-grant';
export { createWriteEnabledSignal } from './lib/write-enabled';

/**
 * Convenience bundle: import every Langsys template feature at once in a
 * standalone component's `imports`.
 *
 *   imports: [LANGSYS_IMPORTS]
 */
import { TranslatePipe } from './lib/translate.pipe';
import { TranslateDirective } from './lib/directives/translate.directive';
import { PhraseDirective } from './lib/directives/phrase.directive';
import { DontTranslateDirective } from './lib/directives/dont-translate.directive';

export const LANGSYS_IMPORTS = [TranslatePipe, TranslateDirective, PhraseDirective, DontTranslateDirective] as const;

/**
 * Re-exported **by reference** from the base SDK — not wrapped.
 *
 * BIND-6: a binding's job is to adapt what the framework needs adapted and to
 * get out of the way for everything else. `LangsysApp` carries the reference-data
 * helpers (`getCountries`, `getLocalesData`, `detectPreferredLocale`, …) and
 * `refresh()`; none of them are reactive or lifecycle-bound, so wrapping them on
 * the service bought nothing and cost the ability to rule this binding out of an
 * investigation in one sentence.
 *
 * `setWriteGrant` is re-exported rather than wrapped for a sharper reason: it
 * must **re-authorize**, not merely store configuration (GRANT-3), and that
 * re-authorization is the core's. A wrapper here could only get it wrong.
 */
export {
    LangsysApp,
    LangsysAppAPI,
    PHRASE_MARKER_ATTR,
    canonicalizeLocale,
    createSignal,
    currentlyLoadedLocale,
    sTranslations,
    setWriteGrant,
    tSignal as t,
} from 'langsys-js-typescript';

// NOT re-exported: the core's raw `writeEnabled`. It is the one value where a
// by-reference re-export would be a defect — reading it during the hydration
// pass is exactly the mismatch `LangsysService.writeEnabled` exists to prevent,
// and exporting it beside the guarded signal would hand callers the foot-gun
// while implying the two are interchangeable. Reach it through the service.

// Framework-agnostic type re-exports, so consumers never reach into the base SDK.
export type {
    ExtractParamKeys,
    ParamPrimitive,
    ParamsFor,
    Signal as SdkSignal,
    TArgs,
    TFunction,
    TranslationParams,
    WriteGrant,
    iCategories,
    iContentBlock,
    iCountry,
    iCountryDialCode,
    iCountryList,
    iCurrency,
    iCurrencyList,
    iLangsysResponse,
    iLanguageName,
    iLocaleData,
    iLocaleDefault,
    iLocaleFlat,
    iProject,
    iTranslations,
} from 'langsys-js-typescript';
