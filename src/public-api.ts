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

// Raw reactive primitives + helpers from the base SDK (advanced / direct use).
export {
    LangsysAppAPI,
    canonicalizeLocale,
    createSignal,
    currentlyLoadedLocale,
    sTranslations,
    tSignal as t,
} from 'langsys-js-typescript';

// Framework-agnostic type re-exports, so consumers never reach into the base SDK.
export type {
    ExtractParamKeys,
    ParamPrimitive,
    ParamsFor,
    Signal as SdkSignal,
    TArgs,
    TFunction,
    TranslationParams,
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
