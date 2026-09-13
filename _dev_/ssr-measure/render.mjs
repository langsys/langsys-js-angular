/* global process, console, setTimeout */
// One SRV case per invocation. `measure.mjs` runs each in a FRESH process: the base SDK's catalog is a
// process-wide singleton, so cases sharing a process contaminate each other silently (CONF-3).
import '@angular/compiler';
import 'zone.js/node';
import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { LANGSYS_IMPORTS, provideLangsys } from 'langsys-js-angular';

// No network, ever: every request fails fast, so what is served comes only from what the binding handed in.
globalThis.fetch = async () => {
    throw new Error('network blocked in measurement');
};
console.error = () => {}; // the expected blocked-network logs
setTimeout(() => {
    console.log('TIMEOUT');
    process.exit(2);
}, 45000).unref();

const CATALOG = { 'it-it': 'Prezzi', 'de-de': 'Preise' };

class App {}
Component({
    selector: 'app-root',
    standalone: true,
    imports: [...LANGSYS_IMPORTS],
    template: `<p id="pipe">{{ 'Pricing' | t: 'UI' }}</p><p id="miss">{{ 'NotInCatalog' | t: 'UI' }}</p><section id="block" lsTranslate category="UI"><h2>Pricing</h2></section>`,
})(App);

async function render(locale) {
    const html = await renderApplication(
        () =>
            bootstrapApplication(App, {
                providers: [
                    provideServerRendering(),
                    // The binding's own SSR hand-off, exactly as its README documents it.
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
    const pick = (id) => (html.match(new RegExp(`<[a-z0-9]+ id="${id}"[^>]*>([\\s\\S]*?)</[a-z0-9]+>`)) ?? [])[1];
    const blockTag = (html.match(/<section id="block"[^>]*>/) ?? [''])[0];
    return {
        pipe: pick('pipe'),
        miss: pick('miss'),
        block: pick('block'),
        stamped: /data-ls-contentblock=/.test(blockTag),
    };
}

const [mode, arg] = process.argv.slice(2);
if (mode === 'served') {
    const r = await render('it-it');
    console.log(
        `SRV-1/MARK-1 served it-it: pipe=${JSON.stringify(r.pipe)} miss=${JSON.stringify(r.miss)} block=${JSON.stringify(r.block)} blockStamped=${r.stamped}`
    );
}
if (mode === 'solo') {
    const r = await render(arg);
    console.log(
        `SRV-2 control, ${arg} alone: served ${JSON.stringify(r.pipe)} (expected ${JSON.stringify(CATALOG[arg])})`
    );
}
if (mode === 'pair') {
    const [it, de] = await Promise.all([render('it-it'), render('de-de')]);
    console.log(
        `SRV-2 concurrent: it-it served ${JSON.stringify(it.pipe)} (expected "Prezzi"), de-de served ${JSON.stringify(de.pipe)} (expected "Preise")`
    );
}
process.exit(0);
