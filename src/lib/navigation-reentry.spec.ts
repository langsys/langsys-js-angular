import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserPlatformLocation, PlatformLocation } from '@angular/common';
import { ChangeDetectionStrategy, Component, NgZone, computed, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import type { TFunction } from 'langsys-js-typescript';

/**
 * HINT-4 (spec 8.0.1) — the hint lane's per-URL cap assumes a URL change re-enters `t()`. Its note:
 * a translated component in a **persistent layout** stays mounted while only the route changes, and
 * if nothing calls back into the SDK, no URL is captured for the new route — "a known non-capture,
 * not conformance", recorded as such until the navigation entry point lands.
 *
 * Measured here with a real `Router` and a shell that persists outside `<router-outlet>`, for every
 * way this binding lets a layout translate. Two harness controls run on every case, because a
 * negative result without them proves nothing:
 *  - the URL really moved — TestBed substitutes `MockPlatformLocation` by default, under which
 *    `location.href` never changes and every shape would falsely read as "does not re-enter";
 *  - a component INSIDE the outlet re-entered `t()` for the new URL.
 *
 * Navigations run inside the Angular zone, as a `routerLink` click or application code does, so the
 * app ticks afterwards. Called from outside the zone, nothing re-renders at all — a harness artefact
 * that would also read as "does not re-enter".
 */

const spies = vi.hoisted(() => ({ translateCtor: vi.fn(), translateSetParams: vi.fn() }));
vi.mock('langsys-js-typescript', () => {
    class Translate {
        constructor(host: HTMLElement, options: unknown) {
            spies.translateCtor(host, options);
        }
        setParams(p: unknown) {
            spies.translateSetParams(p);
        }
        destroy() {}
    }
    class Phrase {
        setParams() {}
        destroy() {}
    }
    return { Translate, Phrase, PHRASE_MARKER_ATTR: 'data-ls-phrase' };
});

const { LangsysService } = await import('./langsys.service');
const { TranslatePipe } = await import('./translate.pipe');
const { TranslateDirective } = await import('./directives/translate.directive');

@Component({
    selector: 'ls-route-a',
    standalone: true,
    imports: [TranslatePipe],
    template: `<p>{{ 'PageA' | t: 'UI' }}</p>`,
})
class RouteA {}

@Component({
    selector: 'ls-route-b',
    standalone: true,
    imports: [TranslatePipe],
    template: `<p>{{ 'PageB' | t: 'UI' }}</p>`,
})
class RouteB {}

@Component({
    selector: 'ls-shell-pipe',
    standalone: true,
    imports: [TranslatePipe, RouterOutlet],
    template: `<nav>{{ 'Nav' | t: 'UI' }}</nav>
        <router-outlet />`,
})
class ShellPipe {}

@Component({
    selector: 'ls-shell-signal',
    standalone: true,
    imports: [RouterOutlet],
    template: `<nav>{{ langsys.t()('Nav', 'UI') }}</nav>
        <router-outlet />`,
})
class ShellSignalRead {
    readonly langsys = inject(LangsysService);
}

@Component({
    selector: 'ls-shell-onpush',
    standalone: true,
    imports: [TranslatePipe, RouterOutlet],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<nav>{{ 'Nav' | t: 'UI' }}</nav>
        <router-outlet />`,
})
class OnPushShellPipe {}

@Component({
    selector: 'ls-header',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<nav>{{ 'Nav' | t: 'UI' }}</nav>`,
})
class OnPushHeader {}

@Component({
    selector: 'ls-shell-header',
    standalone: true,
    imports: [OnPushHeader, RouterOutlet],
    template: `<ls-header /><router-outlet />`,
})
class ShellWithOnPushHeader {}

@Component({
    selector: 'ls-shell-computed',
    standalone: true,
    imports: [RouterOutlet],
    template: `<nav>{{ label() }}</nav>
        <router-outlet />`,
})
class ShellComputed {
    private readonly langsys = inject(LangsysService);
    readonly label = computed(() => (this.langsys.t() as unknown as (p: string, c: string) => string)('Nav', 'UI'));
}

@Component({
    selector: 'ls-shell-block',
    standalone: true,
    imports: [TranslateDirective, RouterOutlet],
    template: `<section lsTranslate category="UI"><h2>Nav</h2></section>
        <router-outlet />`,
})
class ShellBlock {}

async function navigateAcross(shell: unknown) {
    const calls: { phrase: string; href: string }[] = [];
    const t = (phrase: string) => {
        calls.push({ phrase, href: location.pathname });
        return `T:${phrase}`;
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
        providers: [
            { provide: LangsysService, useValue: { t: signal(t as unknown as TFunction) } },
            provideRouter([
                { path: 'a', component: RouteA },
                { path: 'b', component: RouteB },
            ]),
            { provide: PlatformLocation, useClass: BrowserPlatformLocation },
        ],
    });
    history.replaceState({}, '', '/');
    const fixture = TestBed.createComponent(shell as never);
    fixture.autoDetectChanges(true);
    const zone = TestBed.inject(NgZone);
    const router = TestBed.inject(Router);

    await zone.run(() => router.navigateByUrl('/a'));
    await fixture.whenStable();
    const before = calls.length;
    const coreBefore = spies.translateCtor.mock.calls.length + spies.translateSetParams.mock.calls.length;

    await zone.run(() => router.navigateByUrl('/b'));
    await fixture.whenStable();
    const after = calls.slice(before);

    return {
        urlMoved: location.pathname === '/b',
        outletReentered: after.some((c) => c.phrase === 'PageB' && c.href === '/b'),
        shellReenteredT: after.some((c) => c.phrase === 'Nav' && c.href === '/b'),
        coreCallsAfterNav:
            spies.translateCtor.mock.calls.length + spies.translateSetParams.mock.calls.length - coreBefore,
    };
}

const SHAPES = [
    { name: 'the | t pipe in a default-change-detection shell', shell: ShellPipe, reenters: true },
    { name: 'a t() signal read in a default-change-detection shell template', shell: ShellSignalRead, reenters: true },
    { name: 'the | t pipe in an OnPush shell that contains the outlet', shell: OnPushShellPipe, reenters: true },
    { name: 'the | t pipe in an OnPush header beside the outlet', shell: ShellWithOnPushHeader, reenters: false },
    { name: 'computed(() => t()(…)) in a shell', shell: ShellComputed, reenters: false },
    { name: 'an lsTranslate block in a shell', shell: ShellBlock, reenters: false },
].map((s) => ({ ...s, outcome: s.reenters ? 're-enters for the new URL' : 'KNOWN NON-CAPTURE' }));

describe('HINT-4 — a persistent layout across a real router navigation', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each(SHAPES)('$name — $outcome', async ({ name, shell, reenters }) => {
        const r = await navigateAcross(shell);
        if (process.env['PROBE_REPORT'] === '1') {
            console.info(
                `HINT-4 ${name.padEnd(64)} urlMoved=${r.urlMoved} outlet=${r.outletReentered} shellT=${r.shellReenteredT} coreCalls=${r.coreCallsAfterNav}`
            );
        }

        expect(r.urlMoved, 'harness control: location did not move').toBe(true);
        expect(r.outletReentered, 'positive control: the outlet component did not re-enter t() for the new URL').toBe(
            true
        );
        expect(r.shellReenteredT || r.coreCallsAfterNav > 0).toBe(reenters);
    });
});
