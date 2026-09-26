/* global process, console */
// What escapes the request scope. The binding's own surface — the pipes and the service — reads its
// request's scope explicitly. App code that calls the core directly (`tSignal.get()(…)`,
// `LangsysApp.t`) reads whatever scope is ambient, and Angular's render gives it none:
//   direct  — concurrent it-it and de-de renders, as an app runs them.
//   wrapped — the same, each render wrapped in `scope.run()` with an AsyncLocalStorage installed,
//             which is how a host makes the scope ambient; zone.js's promise shows whether the
//             async context survives an Angular render.
//   entered — the same storage, the scope opened and `scope.enter()` called in the body of the
//             request's own APP_INITIALIZER, the closest an Angular app gets to its render.
import '@angular/compiler';
import 'zone.js/node';
import { AsyncLocalStorage } from 'node:async_hooks';
import { APP_INITIALIZER, Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import * as core from 'langsys-js-typescript';
import { LANGSYS_IMPORTS, provideLangsys } from 'langsys-js-angular';

globalThis.fetch = async () => {
    throw new Error('network blocked in measurement');
};
console.error = () => {};
console.warn = () => {};

const CATALOG = { 'it-it': 'Prezzi', 'de-de': 'Preise' };

class App {
    direct() {
        return core.tSignal.get()('Pricing', 'UI');
    }
}
Component({
    selector: 'app-root',
    standalone: true,
    imports: [...LANGSYS_IMPORTS],
    template: `<p id="pipe">{{ 'Pricing' | t: 'UI' }}</p><p id="direct">{{ direct() }}</p>`,
})(App);

async function render(locale, extra = []) {
    const html = await renderApplication(
        () =>
            bootstrapApplication(App, {
                providers: [
                    provideServerRendering(),
                    ...extra,
                    provideLangsys({
                        projectid: 'measure',
                        key: 'measure',
                        apiUrl: 'http://127.0.0.1:9/api',
                        baseLocale: 'en-us',
                        initialLocale: locale,
                        initialTranslations: { UI: { Pricing: CATALOG[locale] } },
                        initialTranslationsLocale: locale,
                    }),
                ],
            }),
        { document: '<html><body><app-root></app-root></body></html>', url: `/${locale}` }
    );
    const pick = (id) => (html.match(new RegExp(`<p id="${id}">([^<]*)</p>`)) ?? [])[1];
    return { pipe: pick('pipe'), direct: pick('direct') };
}

const [mode] = process.argv.slice(2);
let run = render;
if (mode === 'wrapped') {
    core.setRequestScopeStorage(new AsyncLocalStorage());
    run = async (locale) => {
        const scope = await core.createRequestScope({ locale, catalog: { UI: { Pricing: CATALOG[locale] } } });
        return scope.run(() => render(locale));
    };
}
if (mode === 'entered') {
    core.setRequestScopeStorage(new AsyncLocalStorage());
    run = (locale) =>
        render(locale, [
            {
                provide: APP_INITIALIZER,
                multi: true,
                useValue: async () => {
                    const scope = await core.createRequestScope({
                        locale,
                        catalog: { UI: { Pricing: CATALOG[locale] } },
                    });
                    scope.enter();
                },
            },
        ]);
}
const [it, de] = await Promise.all([run('it-it'), run('de-de')]);
console.log(
    `SRV-7 escape (${mode}): it-it pipe ${JSON.stringify(it.pipe)} direct ${JSON.stringify(it.direct)}; de-de pipe ${JSON.stringify(de.pipe)} direct ${JSON.stringify(de.direct)}`
);
process.exit(0);
