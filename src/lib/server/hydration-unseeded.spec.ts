import { beforeAll, describe, expect, it } from 'vitest';
import { serveThenHydrate, type Hydration } from '../../../test/hydration-scenario';

/**
 * SRV-4's positive control: the same served page with the seed removed from `TransferState`.
 * Angular's hydration reuses the served text node without comparing its text, so the disagreement
 * shows as the first client render replacing the served language — the visitor watching the page
 * change language — rather than as a warning; no NG05xx is logged with or without the seed.
 */

let run: Hydration;
beforeAll(async () => {
    run = await serveThenHydrate({ dropSeed: true });
});

describe('SRV-4 control — without the seed, the first client render disagrees with the served bytes', () => {
    it('the server served Italian, and hydration ran over it', () => {
        expect(run.served).toBe('Prezzi');
        expect(run.hydratedComponents).toBeGreaterThan(0);
        expect(run.reusedTextNode).toBe(true);
    });

    it('the first client render is the base language', () => {
        expect(run.first).toBe('Pricing');
        expect(run.first).not.toBe(run.served);
    });

    it('Angular reports no mismatch: the text is what disagrees', () => {
        expect(run.logged.filter((l) => /NG05|hydrat/i.test(l))).toEqual([]);
    });
});
