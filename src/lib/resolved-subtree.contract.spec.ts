import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Component, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { startContractFixture, until, type AcceptedState, type ContractFixture } from '../../test/contract-fixture';
import { LANGSYS_CONFIG } from './config';
import { LangsysService } from './langsys.service';
import { PhraseDirective } from './directives/phrase.directive';
import { TranslatePipe } from './translate.pipe';
import { TranslateDirective } from './directives/translate.directive';

/**
 * GATE-10, graded against the contract double: text a DOM host reads inside a subtree marked
 * `data-ls-resolved` is already-output text, not source, so no miss is recorded for it. This
 * binding's part is handing the core the real DOM host, so the core can walk that host's ancestors —
 * the marker is usually on an element the directive does not own. A bare `t()` — the pipe — has no
 * host and is outside the rule: under a resolved ancestor it still records its miss.
 *
 * The session holds a `write` key, so the double accepts every registration. An unregistered
 * block is therefore something the SDK withheld, not something the double refused, and each
 * absence stands beside a registration that did land.
 */

@Component({
    standalone: true,
    imports: [TranslateDirective, PhraseDirective, TranslatePipe],
    template: `
        <section lsTranslate category="UI"><h2>Unmarked block</h2></section>
        <div data-ls-resolved="es-es">
            <section lsTranslate category="UI" id="resolved-block"><h2>Resolved block</h2></section>
        </div>
        <div data-langsys-resolved="es-es">
            <section lsTranslate category="UI"><h2>Legacy-spelling resolved block</h2></section>
        </div>
        <div data-ls-resolved>
            <div>
                <section lsTranslate category="UI"><h2>Block under a bare ancestor</h2></section>
            </div>
        </div>
        <div data-ls-resolved="es-es">
            <div data-ls-resolved="false">
                <section lsTranslate category="UI"><h2>Opted-out block</h2></section>
            </div>
        </div>
        <p lsPhrase category="UI">Unmarked phrase</p>
        <div data-ls-resolved="es-es"><p lsPhrase category="UI">Resolved phrase</p></div>
        <div data-ls-resolved="es-es">
            <span>{{ 'Bare lookup under a resolved ancestor' | t: 'UI' }}</span>
        </div>
    `,
})
class Page {}

let fx: ContractFixture;
let state: AcceptedState;
let host: HTMLElement;
const registered = () => {
    const p = state.projects['p1'];
    return [...p.phrases.map((x) => x.phrase), ...p.blocks.flatMap((b) => b.phrases.map((x) => x.phrase))].join(' | ');
};

beforeAll(async () => {
    fx = await startContractFixture();
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await fx.seed({
        projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'] }],
        keys: [{ key: 'k-write', project: 'p1', type: 'write' }],
    });
    TestBed.configureTestingModule({
        providers: [
            {
                provide: LANGSYS_CONFIG,
                useValue: {
                    projectid: 'p1',
                    key: 'k-write',
                    apiUrl: fx.baseUrl,
                    baseLocale: 'en',
                    initialLocale: 'es-es',
                },
            },
        ],
    });
    const langsys = TestBed.inject(LangsysService);
    await TestBed.inject(NgZone).run(() => langsys.init());
    await until(() => langsys.currentLocale() === 'es-es');
    const fixture = TestBed.createComponent(Page);
    fixture.detectChanges();
    // Registrations are debounced; wait for the ones that must land, then long enough for any other.
    await until(async () => {
        state = await fx.state();
        return (
            registered().includes('Unmarked block') &&
            registered().includes('Unmarked phrase') &&
            registered().includes('Bare lookup under a resolved ancestor')
        );
    });
    await new Promise((r) => setTimeout(r, 800));
    state = await fx.state();
    host = (fixture.nativeElement as HTMLElement).querySelector('#resolved-block') as HTMLElement;
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('GATE-10 — a resolved subtree is not source', () => {
    it('control: unmarked content registers, through both directives', () => {
        expect(registered()).toContain('Unmarked block');
        expect(registered()).toContain('Unmarked phrase');
    });

    it('lsTranslate inside data-ls-resolved records nothing', () => {
        expect(registered()).not.toContain('Resolved block');
    });

    it('the legacy data-langsys-resolved spelling is honoured on read', () => {
        expect(registered()).not.toContain('Legacy-spelling resolved block');
    });

    it('a bare marker two ancestors up decides — the core walks from the host this binding hands it', () => {
        expect(registered()).not.toContain('Block under a bare ancestor');
    });

    it('data-ls-resolved="false" nearer the host opts back out, and registers', () => {
        expect(registered()).toContain('Opted-out block');
    });

    it('lsPhrase inside data-ls-resolved records nothing', () => {
        expect(registered()).not.toContain('Resolved phrase');
    });

    it('negative control: a bare t() under a resolved ancestor is outside the rule and records its miss', () => {
        // GATE-10's readers are DOM hosts. The pipe is a bare lookup with no host of its own, so a
        // resolved ancestor does not silence it; GATE-9 is the gate that governs t().
        expect(registered()).toContain('Bare lookup under a resolved ancestor');
    });

    it('identity is untouched: a resolved block still carries its content-block stamp', () => {
        expect(host.getAttribute('data-ls-contentblock')).toMatch(/^[0-9a-f]{32}$/);
    });
});
