import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as core from 'langsys-js-typescript';
import { currentlyLoadedLocale, sTranslations, type ServerMessage } from 'langsys-js-typescript';
import vectors from '../../test/fixtures/server-message-vectors.json';
import { LANGSYS_CONFIG } from './config';
import { MessagePipe } from './message.pipe';
import { resolveServerMessages } from '../public-api';

/**
 * MSG-1, MSG-5 and MSG-6 through this binding, against the real base SDK and the shared vectors
 * (`test/fixtures/server-message-vectors.json`, vendored byte-exact from langsys-js-typescript).
 *
 * Every `resolve` row is replayed through `resolveServerMessages` as this package exports it: entries
 * are read only where the app's configuration says they sit, over the framework's own error body.
 *
 * Every `render` row is replayed through a rendered template — `{{ entry | tMessage: category }}` —
 * so what is asserted is what a user sees, not a return value.
 */

type ResolveRow = {
    id: string;
    body: unknown;
    options: core.ResolveServerMessagesOptions;
    expected: ServerMessage[];
    body_unchanged?: boolean;
};

type RenderRow = {
    id: string;
    locale: string;
    category: string;
    catalog: Record<string, Record<string, string>> | null;
    entry: ServerMessage;
    expected: string;
};

/** Publish a catalog the way the vector file describes: `null` means no catalog at all. */
function publish(catalog: Record<string, Record<string, string>> | null, locale: string): void {
    const categories: Record<string, Record<string, string>> = {
        __uncategorized__: { __category__: '__uncategorized__', __symbol__: '__uncategorized__' },
    };
    for (const [category, entries] of Object.entries(catalog ?? {})) {
        categories[category] = { __category__: category, __symbol__: category, ...entries };
    }
    sTranslations.set(categories as never);
    currentlyLoadedLocale.set(catalog ? locale : '');
}

@Component({
    standalone: true,
    imports: [MessagePipe],
    template: `<span>{{ entry | tMessage: category }}</span>`,
})
class MessageHost {
    entry: ServerMessage | null = null;
    category: string | undefined = undefined;
}

function mount(entry: ServerMessage | null, category?: string) {
    const fixture = TestBed.createComponent(MessageHost);
    fixture.componentInstance.entry = entry;
    fixture.componentInstance.category = category;
    fixture.detectChanges();
    return fixture;
}

const render = (entry: ServerMessage | null, category?: string): string =>
    (mount(entry, category).nativeElement as HTMLElement).textContent ?? '';

beforeAll(() => {
    // A lookup that misses may be recorded; nothing here may reach a network.
    vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.reject(new Error('no network in this test')))
    );
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
});

afterEach(() => {
    TestBed.resetTestingModule();
    publish(null, '');
});

function configure(messagesCategory?: string) {
    TestBed.configureTestingModule({
        providers: [{ provide: LANGSYS_CONFIG, useValue: { projectid: '', key: '', messagesCategory } }],
    });
}

describe('MSG-5 — the shared render vectors, through the tMessage pipe', () => {
    const rows = (vectors as unknown as { render: RenderRow[] }).render;

    it('carries every render row', () => {
        expect(rows).toHaveLength(12);
    });

    it.each(rows.map((r) => [r.id, r] as const))('%s', (_id, row) => {
        configure();
        publish(row.catalog, row.locale);

        expect(render(row.entry, row.category)).toBe(row.expected);
    });
});

describe("MSG-1 — the shared resolve vectors, through this package's export", () => {
    const rows = (vectors as unknown as { resolve: ResolveRow[] }).resolve;

    it("is the core's own function, re-exported by reference", () => {
        expect(resolveServerMessages).toBe(core.resolveServerMessages);
    });

    it('carries every resolve row', () => {
        expect(rows).toHaveLength(10);
    });

    it.each(rows.map((r) => [r.id, r] as const))('%s', (_id, row) => {
        const body = structuredClone(row.body);
        expect(resolveServerMessages(body, row.options)).toEqual(row.expected);
        if (row.body_unchanged) expect(body).toEqual(row.body);
    });

    it('with neither a key nor a resolver there is nowhere to look, and it throws', () => {
        expect(() => resolveServerMessages({ langsys_errors: [] }, {})).toThrow(/key/);
    });
});

describe('MSG-5 — the pipe in a template', () => {
    const entry: ServerMessage = {
        field: 'password_confirmation',
        code: 'Confirmed',
        message: 'The passwords do not match.',
        template: 'The passwords do not match.',
    };

    it('renders nothing for a missing entry', () => {
        configure();
        expect(render(null)).toBe('');
    });

    it('follows the catalog: the same host re-renders when a translation is published', () => {
        configure();
        publish({ Errors: {} }, 'es');
        const fixture = mount(entry);
        expect((fixture.nativeElement as HTMLElement).textContent).toBe('The passwords do not match.');

        publish({ Errors: { 'The passwords do not match.': 'Las contraseñas no coinciden.' } }, 'es');
        fixture.detectChanges();

        expect((fixture.nativeElement as HTMLElement).textContent).toBe('Las contraseñas no coinciden.');
    });
});
