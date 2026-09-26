import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as core from 'langsys-js-typescript';
import { LANGSYS_CONFIG } from './config';
import { LangsysService } from './langsys.service';

/**
 * Every subscription the service opens on the core's process-wide signals is released when its
 * application is destroyed. On a server each request bootstraps its own application, so one left
 * open outlives the request; `_dev_/ssr-measure/leak.mjs` counts the same thing over 50 real
 * server renders.
 */

const SIGNALS = ['tSignal', 'currentlyLoadedLocale', 'sTranslations'] as const;
const counts = { opened: 0, released: 0 };
for (const name of SIGNALS) {
    const sig = core[name] as unknown as { subscribe: (run: (v: unknown) => void) => () => void };
    const subscribe = sig.subscribe.bind(sig);
    sig.subscribe = (run) => {
        counts.opened++;
        const unsubscribe = subscribe(run);
        let released = false;
        return () => {
            if (!released) {
                released = true;
                counts.released++;
            }
            unsubscribe();
        };
    };
}

describe('subscriptions on the core signals live exactly as long as the application', () => {
    it('opens one per bridged signal, and releases each when the root injector is destroyed', () => {
        TestBed.configureTestingModule({
            providers: [{ provide: LANGSYS_CONFIG, useValue: { projectid: '', key: '' } }],
        });
        TestBed.inject(LangsysService);
        expect(counts).toEqual({ opened: SIGNALS.length, released: 0 });

        TestBed.resetTestingModule();
        expect(counts).toEqual({ opened: SIGNALS.length, released: SIGNALS.length });
    });
});
