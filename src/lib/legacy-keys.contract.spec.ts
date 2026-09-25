import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Component, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { startContractFixture, until, type AcceptedState, type ContractFixture } from '../../test/contract-fixture';
import { LANGSYS_CONFIG } from './config';
import { LangsysService } from './langsys.service';
import { TranslatePipe } from './translate.pipe';

/**
 * The legacy-key mode (spec MIG), graded against the contract double. The mode is the core's; this
 * binding's part is carrying `legacyKeys` from `LangsysConfig` to the core's `init()` untouched, so
 * the `t` pipe resolves its argument as a key exactly as the core's own `t()` does.
 *
 * The session holds a `write` key, so the double accepts every registration: a key string absent
 * from the accepted state is one the SDK never sent, beside the key's value that did land.
 */

@Component({
    standalone: true,
    imports: [TranslatePipe],
    template: `
        <span id="hit">{{ 'checkout.submit' | t }}</span>
        <span id="miss">{{ 'Keep shopping' | t: 'UI' }}</span>
    `,
})
class Page {}

let fx: ContractFixture;
let state: AcceptedState;
let el: HTMLElement;
const phrases = () => state.projects['p1'].phrases;

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
                    legacyKeys: [{ name: 'en.json', format: 'i18next', data: { checkout: { submit: 'Place order' } } }],
                },
            },
        ],
    });
    const langsys = TestBed.inject(LangsysService);
    await TestBed.inject(NgZone).run(() => langsys.init());
    await until(() => langsys.currentLocale() === 'es-es');
    const fixture = TestBed.createComponent(Page);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    // Registrations are debounced. Wait for the control, which lands with or without the mode, then
    // long enough for the rest of the batch.
    await until(async () => {
        state = await fx.state();
        return phrases().some((p) => p.phrase === 'Keep shopping');
    });
    await new Promise((r) => setTimeout(r, 800));
    state = await fx.state();
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('MIG — legacyKeys reaches the core through LangsysConfig', () => {
    it('a key the configured file holds registers its value, under the key namespace', () => {
        expect(phrases()).toContainEqual(expect.objectContaining({ category: 'checkout', phrase: 'Place order' }));
    });

    it('the key itself is never registered', () => {
        expect(phrases().map((p) => p.phrase)).not.toContain('checkout.submit');
    });

    it('the pipe renders the value, not the key', () => {
        expect(el.querySelector('#hit')?.textContent).toBe('Place order');
    });

    it('control: a phrase no file holds registers as written, in the category the call passes', () => {
        expect(phrases()).toContainEqual(expect.objectContaining({ category: 'UI', phrase: 'Keep shopping' }));
    });
});
