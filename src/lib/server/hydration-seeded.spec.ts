import { beforeAll, describe, expect, it } from 'vitest';
import { serveThenHydrate, type Hydration } from '../../../test/hydration-scenario';

let run: Hydration;
beforeAll(async () => {
    run = await serveThenHydrate({ dropSeed: false });
});

describe('SRV-4 — the client is seeded with the catalog the server rendered with', () => {
    it('the server serves Italian', () => {
        expect(run.served).toBe('Prezzi');
    });

    it('hydration ran over the served bytes', () => {
        expect(run.hydratedComponents).toBeGreaterThan(0);
        expect(run.reusedTextNode).toBe(true);
    });

    it('the first client render is Italian, with no network', () => {
        expect(run.first).toBe('Prezzi');
    });

    it('no hydration mismatch is reported', () => {
        expect(run.logged.filter((l) => /NG05|hydrat/i.test(l))).toEqual([]);
    });
});
