/* global process, console, setTimeout */
// Subscription accounting under SSR: every subscribe on the core's reactive singletons is counted as
// opened, and every unsubscribe it returns as released. A server renders many requests in one
// process, so anything a request opens and never releases outlives it on a process-wide object.
import '@angular/compiler';
import 'zone.js/node';
import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { provideRouter } from '@angular/router';
import * as core from 'langsys-js-typescript';
import { LANGSYS_IMPORTS, LangsysService, fromSdkSignal, provideLangsys } from 'langsys-js-angular';
import { provideLangsysNavigation } from 'langsys-js-angular/router';

globalThis.fetch = async () => {
    throw new Error('network blocked in measurement');
};
console.error = () => {};
console.warn = () => {};
setTimeout(() => {
    console.log('TIMEOUT');
    process.exit(2);
}, 120000).unref();

const SIGNALS = ['tSignal', 'currentlyLoadedLocale', 'sTranslations', 'writeEnabled'];
const counts = Object.fromEntries(SIGNALS.map((n) => [n, { opened: 0, released: 0 }]));
for (const name of SIGNALS) {
    const sig = core[name];
    const subscribe = sig.subscribe.bind(sig);
    sig.subscribe = (run) => {
        counts[name].opened++;
        const unsubscribe = subscribe(run);
        let released = false;
        return () => {
            if (!released) {
                released = true;
                counts[name].released++;
            }
            return unsubscribe();
        };
    };
}
const snapshot = () => JSON.parse(JSON.stringify(counts));
const total = (c) =>
    SIGNALS.reduce((a, n) => ({ opened: a.opened + c[n].opened, released: a.released + c[n].released }), {
        opened: 0,
        released: 0,
    });

const entry = {
    template: 'The {attribute} field is required.',
    params: { attribute: 'email' },
    message: 'The email field is required.',
};

// A page using every template feature and every service member this package exports.
class Page {
    svc = inject(LangsysService);
    entry = entry;
}
Component({
    selector: 'app-root',
    standalone: true,
    imports: [...LANGSYS_IMPORTS, AsyncPipe],
    template: `
        <p>{{ 'Pricing' | t: 'UI' }}</p>
        <p>{{ entry | tMessage }}</p>
        <section lsTranslate category="UI"><h2>Pricing</h2></section>
        <p lsPhrase category="UI">Hello there</p>
        <span lsDontTranslate>Brand</span>
        <p>
            {{ svc.translate('Save', 'UI') }} {{ svc.t()('Cancel', 'UI') }} {{ svc.renderServerMessage(entry) }}
            {{ svc.currentLocale() }} {{ svc.locale() }} {{ svc.translations() ? 'catalog' : '' }}
            {{ svc.ready() }} {{ svc.error() }} {{ svc.writeEnabled() }} {{ svc.keyType() }}
            {{ (svc.t$ | async) ? 't$' : '' }} {{ svc.currentLocale$ | async }} {{ (svc.translations$ | async) ? 'tr$' : '' }}
        </p>
    `,
})(Page);

// Positive control: the same pipeline, one component bridging tSignal with the default
// `autoDestroy`, which ties the subscription to the component's DestroyRef.
class Control {
    t = fromSdkSignal(core.tSignal);
}
Component({ selector: 'app-root', standalone: true, template: `<p>{{ t() ? 'ok' : '' }}</p>` })(Control);

const render = (root, providers) =>
    renderApplication(() => bootstrapApplication(root, { providers: [provideServerRendering(), ...providers] }), {
        document: '<html><body><app-root></app-root></body></html>',
        url: '/',
    });

const langsys = () =>
    provideLangsys({
        projectid: 'measure',
        key: 'measure',
        apiUrl: 'http://127.0.0.1:9/api',
        baseLocale: 'en-us',
        initialLocale: 'it-it',
        initialTranslations: { UI: { Pricing: 'Prezzi' } },
        initialTranslationsLocale: 'it-it',
    });

const settle = () => new Promise((r) => setTimeout(r, 0));

const [mode] = process.argv.slice(2);
if (mode === 'control') {
    const before = total(snapshot());
    await render(Control, []);
    await settle();
    const after = total(snapshot());
    console.log(
        `LEAK control (fromSdkSignal, default autoDestroy, one render): opened ${after.opened - before.opened}, released ${after.released - before.released}`
    );
}
if (mode === 'renders') {
    const N = 50;
    for (let i = 0; i < N; i++) {
        const html = await render(Page, [langsys(), provideRouter([]), provideLangsysNavigation()]);
        if (i === 0 && !html.includes('Prezzi')) console.log('LEAK render did not serve the catalog');
        await settle();
    }
    const c = snapshot();
    const t = total(c);
    console.log(
        `LEAK ${N} renders: opened ${t.opened}, released ${t.released}, open ${t.opened - t.released} — ` +
            SIGNALS.map((n) => `${n} ${c[n].opened}/${c[n].released}`).join(', ')
    );
}
process.exit(0);
