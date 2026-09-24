import {
    DestroyRef,
    ENVIRONMENT_INITIALIZER,
    PLATFORM_ID,
    inject,
    makeEnvironmentProviders,
    type EnvironmentProviders,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { notifyNavigation } from 'langsys-js-typescript';

/**
 * Tell the base SDK about every completed router navigation (spec HINT-13).
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *     providers: [provideRouter(routes), provideLangsys({ … }), provideLangsysNavigation()],
 * });
 * ```
 *
 * Components that persist across a navigation — a header beside `<router-outlet>`, an `OnPush`
 * shell, a `computed` translation, an `lsTranslate` block in the layout — are not re-rendered
 * when only the route changes, so without this their missing phrases are never recorded for
 * the new page. `notifyNavigation()` makes every translated node still attached to the document
 * look its phrases up again at the new URL. The core decides everything after that; this only
 * decides when.
 *
 * The call is made on `NavigationEnd`, after the outgoing route's components have been
 * destroyed. `Location.onUrlChange` looks equivalent and needs no router, but it fires when the
 * URL is written — before the outgoing route is torn down — so that page's still-attached blocks
 * would be recorded at the new URL.
 *
 * Browser only: under server rendering there is no visitor URL to report.
 */
export function provideLangsysNavigation(): EnvironmentProviders {
    return makeEnvironmentProviders([
        {
            provide: ENVIRONMENT_INITIALIZER,
            multi: true,
            useValue: () => {
                if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
                const subscription = inject(Router).events.subscribe((event) => {
                    if (event instanceof NavigationEnd) notifyNavigation();
                });
                inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
            },
        },
    ]);
}
