import { Component, PLATFORM_ID, TransferState, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import * as core from 'langsys-js-typescript';
import { LANGSYS_CONFIG } from '../src/lib/config';
import { LangsysService } from '../src/lib/langsys.service';
import { LANGSYS_SEED } from '../src/lib/request-scope';
import { TranslateDirective } from '../src/lib/directives/translate.directive';
import { TranslatePipe } from '../src/lib/translate.pipe';

/**
 * Server renders through the real core under a server `PLATFORM_ID`, one application per request
 * as Angular SSR bootstraps them, against the contract double. Destroying the application is the
 * end of the request.
 */

@Component({
    standalone: true,
    imports: [TranslatePipe, TranslateDirective, AsyncPipe],
    template: `
        <p id="pipe">{{ 'Pricing' | t: 'UI' }}</p>
        <p id="miss">{{ 'Not in any catalog' | t: 'UI' }}</p>
        <p id="svc">{{ svc.currentLocale() }}|{{ svc.translations()['UI']?.['Pricing'] }}</p>
        <p id="obs">{{ svc.currentLocale$ | async }}|{{ (svc.translations$ | async)?.['UI']?.['Pricing'] }}</p>
        <section id="named" lsTranslate category="UI" custom_id="pricing-hero"><h2>Pricing plans</h2></section>
        <section id="unnamed" lsTranslate category="UI"><h2>Pricing plans</h2></section>
    `,
})
export class ServerPage {
    svc = inject(LangsysService);
}

export const SERVER_SEED = (keyType: 'read' | 'write') => ({
    projects: [
        {
            id: 'p1',
            base_locale: 'en',
            target_locales: ['it-it', 'de-de'],
            phrases: [{ category: 'UI', phrase: 'Pricing', translations: { 'it-it': 'Prezzi', 'de-de': 'Preise' } }],
        },
    ],
    keys: [{ key: 'k1', project: 'p1', type: keyType }],
});

/** Every subscribe on the core's process-wide signals, counted. */
export const subscriptions = { opened: 0 };
for (const name of ['tSignal', 'currentlyLoadedLocale', 'sTranslations', 'writeEnabled'] as const) {
    const sig = core[name] as unknown as { subscribe: (run: (v: unknown) => void) => () => void };
    const subscribe = sig.subscribe.bind(sig);
    sig.subscribe = (run) => {
        subscriptions.opened++;
        return subscribe(run);
    };
}

export interface ServedRequest {
    html: string;
    text: (id: string) => string;
    host: (id: string) => HTMLElement;
    seed: { locale: string; catalog: Record<string, Record<string, unknown>> } | null;
    error: string | null;
    /** End the request: destroy its application, as Angular SSR does once the document is serialized. */
    end: () => void;
}

export async function serveRequest(
    apiUrl: string,
    locale: string,
    extra: Record<string, unknown> = {}
): Promise<ServedRequest> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            { provide: PLATFORM_ID, useValue: 'server' },
            {
                provide: LANGSYS_CONFIG,
                useValue: {
                    projectid: 'p1',
                    key: 'k1',
                    apiUrl,
                    baseLocale: 'en',
                    initialLocale: locale,
                    ssrTokenStrategy: 'server',
                    ...extra,
                },
            },
        ],
    });
    const svc = TestBed.inject(LangsysService);
    await svc.init();
    const fixture = TestBed.createComponent(ServerPage);
    fixture.detectChanges();
    // The observables emit through an effect, flushed by the pass after the first.
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
        html: el.innerHTML,
        text: (id) => el.querySelector(`#${id}`)?.textContent?.trim() ?? '',
        host: (id) => el.querySelector(`#${id}`) as HTMLElement,
        seed: TestBed.inject(TransferState).get(LANGSYS_SEED, null) as ServedRequest['seed'],
        error: svc.error(),
        end: () => TestBed.resetTestingModule(),
    };
}
