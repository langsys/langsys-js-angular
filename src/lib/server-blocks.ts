import {
    CONTENT_BLOCK_MARKER_ATTR,
    CONTENT_BLOCK_MARKER_ATTRS,
    PHRASE_MARKER_ATTR,
    applyRendered,
    blockNodesOf,
    registerBlock,
    type BlockNode,
    renderBlock,
    warnUnrenderedBlock,
    type BlockOptions,
} from 'langsys-js-typescript';

/**
 * Content blocks and rich phrases on a server (spec SRV-1, MARK-1, SRV-5). The core's DOM classes
 * are the browser's; on a server a directive reads its host into the core's block tree, renders it
 * from the request's catalog, writes the result into the nodes Angular already rendered, and
 * registers the block for the request's flush. Called inside the request's scope.
 */

/** Whether an enclosing block host renders this one: the outermost host renders every unit inside it. */
export function insideBlock(host: Element): boolean {
    return host.parentElement?.closest(CONTENT_BLOCK_MARKER_ATTRS.map((name) => `[${name}]`).join(',')) != null;
}

/** Declare a block host before any host renders, so an enclosing block treats it as its own unit. */
export function declareBlockHost(host: Element, customId: string | undefined, category: string | undefined): void {
    host.setAttribute(CONTENT_BLOCK_MARKER_ATTR, customId ?? '');
    if (category) host.setAttribute('data-ls-category', category);
}

/**
 * Render a block host's content in place. When the translation cannot be written into the nodes
 * Angular owns — it reorders inline markup — the block is served as source, still stamped with its
 * id, and the client translates it after hydration.
 */
export function renderBlockHost(host: Element, options: BlockOptions): void {
    const nodes = blockNodesOf(host);
    const rendered = renderBlock(nodes, options);
    if (!applyRendered(host, rendered).applied) {
        if (rendered.customId) host.setAttribute(CONTENT_BLOCK_MARKER_ATTR, rendered.customId);
        warnUnrenderedBlock('its translation reorders the markup Angular rendered');
    }
    registerBlock(nodes, { ...options, host });
}

/** Render a rich-phrase host in place: the host is the tree's one element, applied to itself. */
export function renderPhraseHost(host: Element, options: BlockOptions): void {
    const node: BlockNode = { tag: host.localName, attrs: { [PHRASE_MARKER_ATTR]: '' }, children: blockNodesOf(host) };
    const rendered = renderBlock([node], options);
    if (!applyRendered(host, rendered.nodes, { self: true }).applied) {
        warnUnrenderedBlock('its translation reorders the markup Angular rendered');
    }
    registerBlock([node], { ...options, host });
}
