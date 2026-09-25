import { Component, NgZone } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { buildSnapshot, type CatalogSnapshot } from 'langsys-js-typescript';
import { LANGSYS_CONFIG } from '../src/lib/config';
import { LangsysService } from '../src/lib/langsys.service';
import { TranslatePipe } from '../src/lib/translate.pipe';
import { until } from './contract-fixture';

/**
 * SNAP-2 scenarios, one per spec file: the core is a module-level singleton, so each needs its own
 * module graph. The snapshot's translation for `Pricing` differs from the catalog's, so the rendered
 * text says which of the two supplied it; `Checkout` is in the catalog and not in the snapshot.
 */

@Component({
    standalone: true,
    imports: [TranslatePipe],
    template: `<span id="pricing">{{ 'Pricing' | t: 'UI' }}</span
        ><span id="checkout">{{ 'Checkout' | t: 'UI' }}</span>`,
})
export class SnapshotPage {}

export const CATALOG_SEED = {
    projects: [
        {
            id: 'p1',
            base_locale: 'en',
            target_locales: ['es-es'],
            phrases: [
                { category: 'UI', phrase: 'Pricing', translations: { 'es-es': 'Precios' } },
                { category: 'UI', phrase: 'Checkout', translations: { 'es-es': 'Pagar' } },
            ],
        },
    ],
    keys: [{ key: 'k-read', project: 'p1', type: 'read' }],
};

export function snapshotFor(pricing: string): CatalogSnapshot {
    return buildSnapshot({
        projectId: 'p1',
        baseLocale: 'en',
        categories: ['UI'],
        catalogs: { 'es-es': { UI: { Pricing: pricing } } },
        generatedAt: new Date('2026-09-24T00:00:00Z'),
    });
}

export interface Started {
    langsys: LangsysService;
    fixture: ComponentFixture<SnapshotPage>;
    /** What the first render showed, read before anything was awaited. */
    first: { pricing: string; checkout: string };
    initialized: Promise<unknown>;
    text: () => { pricing: string; checkout: string };
}

/**
 * Wait for `init()` and for the rendered text to satisfy `done`, and return that text. Runs inside
 * `beforeAll`: TestBed destroys the fixture after each test, so a later test cannot render it.
 */
export async function settle(
    run: Started,
    done: (t: { pricing: string; checkout: string }) => boolean
): Promise<{ pricing: string; checkout: string }> {
    await run.initialized;
    await until(() => {
        run.fixture.detectChanges();
        return done(run.text());
    });
    return run.text();
}

/**
 * Start the service as `provideLangsys()` does and render at once, before awaiting anything — the
 * first render of an app that does not block bootstrap on the catalog.
 */
export function startWithSnapshot(apiUrl: string, snapshot: string | CatalogSnapshot): Started {
    TestBed.configureTestingModule({
        providers: [
            {
                provide: LANGSYS_CONFIG,
                useValue: {
                    projectid: 'p1',
                    key: 'k-read',
                    apiUrl,
                    baseLocale: 'en',
                    initialLocale: 'es-es',
                    snapshot,
                },
            },
        ],
    });
    const langsys = TestBed.inject(LangsysService);
    const initialized = TestBed.inject(NgZone).run(() => langsys.init());
    const fixture = TestBed.createComponent(SnapshotPage);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = () => ({
        pricing: el.querySelector('#pricing')?.textContent ?? '',
        checkout: el.querySelector('#checkout')?.textContent ?? '',
    });
    return { langsys, fixture, first: text(), initialized, text };
}
