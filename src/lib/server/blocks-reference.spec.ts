import { describe, expect, it } from 'vitest';
import { generateCustomId, tokenizeElement } from 'langsys-js-typescript';
import { BROWSER_IDS, MARKUP } from '../../../test/server-blocks-scenario';

/**
 * MARK-1's second path: the browser's own tokenizer, over each block's markup in a browser DOM,
 * derives the ids the server's tree path must stamp and register (`blocks.contract.spec.ts`).
 */
describe('the ids the browser derives for the served blocks', () => {
    it.each(Object.entries(MARKUP))('%s', (name, html) => {
        const host = document.createElement('section');
        host.innerHTML = html;
        expect(generateCustomId('UI', tokenizeElement(host).tokens)).toBe(BROWSER_IDS[name as keyof typeof MARKUP]);
    });
});
