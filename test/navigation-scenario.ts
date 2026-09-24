import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserPlatformLocation, PlatformLocation } from '@angular/common';
import {
    ChangeDetectionStrategy,
    Component,
    NgZone,
    computed,
    inject,
    type EnvironmentProviders,
    type Provider,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { LANGSYS_CONFIG } from '../src/lib/config';
import { LangsysService } from '../src/lib/langsys.service';
import { TranslatePipe } from '../src/lib/translate.pipe';
import { TranslateDirective } from '../src/lib/directives/translate.directive';
import { provideLangsysNavigation } from '../router/provide-langsys-navigation';
import { startContractFixture, until, type ContractFixture } from './contract-fixture';

/**
 * HINT-13's scenario against the contract double: a persistent layout holding a missing phrase,
 * navigated from one route to another through the real Angular Router.
 *
 * The session is read-only (an `ip_write` key from a non-allow-listed address) and permitted to
 * report, so the double stores the hint for any URL the SDK reports — an absence at the second
 * URL is therefore evidence, not a refusal. Reports wait 5–30s of jitter; timers auto-advance so
 * real network I/O proceeds while a test jumps the jitter.
 */

@Component({
    selector: 'ls-page-a',
    standalone: true,
    imports: [TranslatePipe],
    template: `<p>{{ 'Only on page A' | t: 'UI' }}</p>`,
})
class PageA {}

@Component({ selector: 'ls-page-b', standalone: true, template: `<p>Nothing translated here</p>` })
class PageB {}

@Component({
    selector: 'ls-header',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<nav>{{ 'Persistent header' | t: 'UI' }}</nav>`,
})
class OnPushHeader {}

/** The known non-capture shape: an OnPush header beside the outlet. */
@Component({
    selector: 'ls-shell',
    standalone: true,
    imports: [OnPushHeader, RouterOutlet],
    template: `<ls-header /><router-outlet />`,
})
export class ShellWithPersistentHeader {}

/** The known non-capture shape: a `computed` translation in the layout. */
@Component({
    selector: 'ls-computed-shell',
    standalone: true,
    imports: [RouterOutlet],
    template: `<nav>{{ label() }}</nav>
        <router-outlet />`,
})
export class ShellWithComputedTranslation {
    private readonly langsys = inject(LangsysService);
    readonly label = computed(() =>
        (this.langsys.t() as unknown as (p: string, c: string) => string)('Persistent computed label', 'UI')
    );
}

/** The known non-capture shape: an `lsTranslate` block in the layout. */
@Component({
    selector: 'ls-block-shell',
    standalone: true,
    imports: [TranslateDirective, RouterOutlet],
    template: `<section lsTranslate category="UI"><h2>Persistent layout block</h2></section>
        <router-outlet />`,
})
export class ShellWithPersistentBlock {}

/** No persistent translation: only the routed page translates. */
@Component({ selector: 'ls-bare-shell', standalone: true, imports: [RouterOutlet], template: `<router-outlet />` })
export class BareShell {}

export function seedFor(origin: string) {
    return {
        config: { renderer_egress_ips: ['10.9.9.9'] },
        projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: origin }],
        keys: [{ key: 'k-public', project: 'p1', type: 'ip_write', report_discovered_content: true }],
    };
}

export async function hintedPaths(fx: ContractFixture): Promise<string[]> {
    return (await fx.state()).hints.map((h) => new URL(h.url).pathname);
}

/** Mount `shell`, visit `from` then `to`, running out the jitter after each; returns when done. */
export async function navigateThrough(
    fx: ContractFixture,
    shell: unknown,
    extraProviders: Array<Provider | EnvironmentProviders>,
    from: string,
    to: string
): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            {
                provide: LANGSYS_CONFIG,
                useValue: {
                    projectid: 'p1',
                    key: 'k-public',
                    apiUrl: fx.baseUrl,
                    baseLocale: 'en',
                    initialLocale: 'es-es',
                },
            },
            provideRouter([
                { path: from.slice(1), component: PageA },
                { path: to.slice(1), component: PageB },
            ]),
            // Real history: TestBed's default MockPlatformLocation never moves location.href.
            { provide: PlatformLocation, useClass: BrowserPlatformLocation },
            ...extraProviders,
        ],
    });
    history.replaceState({}, '', '/');
    const zone = TestBed.inject(NgZone);
    const router = TestBed.inject(Router);
    const langsys = TestBed.inject(LangsysService);

    // Quiescent start, as an app is: init inside the zone (APP_INITIALIZER runs there), and the
    // catalog loaded before first render. Started outside the zone, the catalog's arrival marks
    // OnPush views dirty with no tick to service them, and the next tick — the navigation — would
    // re-render them at the new URL for reasons that have nothing to do with the route change.
    await zone.run(() => langsys.init());
    await until(() => langsys.currentLocale() === 'es-es');
    const fixture = TestBed.createComponent(shell as never);
    fixture.autoDetectChanges(true);
    await fixture.whenStable();

    // Inside the zone, as a routerLink click is — outside it, nothing re-renders.
    await zone.run(() => router.navigateByUrl(from));
    await fixture.whenStable();
    await vi.advanceTimersByTimeAsync(31_000);
    await until(async () => (await hintedPaths(fx)).includes(from));

    await zone.run(() => router.navigateByUrl(to));
    await fixture.whenStable();
    await vi.advanceTimersByTimeAsync(31_000);
    // Long enough for a sent report to have been stored.
    await new Promise((r) => setTimeout(r, 600));
}

/**
 * One HINT-13 case per spec file. The core is a module-level singleton, so each scenario needs
 * its own module graph — vitest gives every file one — or a later scenario inherits the earlier
 * one's catalog and a late reload re-renders the layout mid-navigation.
 */
export function hint13Case(opts: { name: string; shell: unknown; wired: boolean; reportedAtNewUrl: boolean }): void {
    let fx: ContractFixture;
    beforeAll(async () => {
        fx = await startContractFixture();
    });
    afterAll(() => fx.stop());
    beforeEach(async () => {
        vi.useFakeTimers({
            toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
            shouldAdvanceTime: true,
        });
        for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
            vi.spyOn(console, m).mockImplementation(() => {});
        }
        await fx.seed(seedFor(location.origin));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe(`HINT-13 — ${opts.wired ? 'with provideLangsysNavigation()' : 'without the wiring'}`, () => {
        it(opts.name, async () => {
            await navigateThrough(fx, opts.shell, opts.wired ? [provideLangsysNavigation()] : [], '/a', '/b');

            const hinted = await hintedPaths(fx);
            expect(hinted, 'presence: the first page was reported').toContain('/a');
            if (opts.reportedAtNewUrl) expect(hinted, 'reported for the page navigated to').toContain('/b');
            else expect(hinted, 'nothing reported for the page navigated to').not.toContain('/b');
        });
    });
}
