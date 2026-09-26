import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildSnapshot } from 'langsys-js-typescript';
import { serveRequest } from '../../../test/server-render-scenario';

/**
 * SRV-6 offline: with authorization unavailable, a configured snapshot answers for it — the served
 * set is its base locale plus its locales, and it supplies the catalog.
 */

const snapshot = buildSnapshot({
    projectId: 'p1',
    baseLocale: 'en',
    categories: ['UI'],
    catalogs: { 'it-it': { UI: { Pricing: 'Prezzi (instantanea)' } } },
    generatedAt: new Date('2026-09-26T00:00:00Z'),
});
const served: Record<string, { svc: string; pipe: string }> = {};

beforeAll(async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('offline')))
    );
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    for (const requested of ['it-it', 'de-de']) {
        const request = await serveRequest('http://127.0.0.1:9/api', requested, { snapshot });
        served[requested] = { svc: request.text('svc').split('|')[0], pipe: request.text('pipe') };
        request.end();
    }
});

describe('SRV-6 — offline, a loaded snapshot answers for authorization', () => {
    it('a locale the snapshot holds is served from it', () => {
        expect(served['it-it']).toEqual({ svc: 'it-it', pipe: 'Prezzi (instantanea)' });
    });

    it("a locale it lacks falls through to the snapshot's base locale", () => {
        expect(served['de-de']).toEqual({ svc: 'en', pipe: 'Pricing' });
    });
});
