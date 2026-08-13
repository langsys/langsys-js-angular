import { APP_INITIALIZER, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import { LANGSYS_CONFIG, type LangsysConfig } from './config';
import { LangsysService } from './langsys.service';

/**
 * Register Langsys with a standalone Angular application.
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideLangsys({
 *       projectid: environment.langsysProjectId,
 *       key: environment.langsysKey,
 *       apiUrl: environment.langsysApiUrl,   // optional: self-hosted backend
 *       baseLocale: 'en-US',
 *       initialLocale: 'en-US',
 *     }),
 *   ],
 * });
 * ```
 *
 * By default this blocks bootstrap until the first catalog load settles, so the
 * app never paints untranslated text. Set `blockUntilReady: false` to let the
 * app render immediately and fill in as translations arrive.
 */
export function provideLangsys(config: LangsysConfig): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: LANGSYS_CONFIG, useValue: config },
        {
            provide: APP_INITIALIZER,
            multi: true,
            deps: [LangsysService],
            useFactory: (langsys: LangsysService) => () => {
                const started = langsys.init();
                return config.blockUntilReady === false ? undefined : started;
            },
        },
    ]);
}
