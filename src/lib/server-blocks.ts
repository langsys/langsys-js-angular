import {
    CONTENT_BLOCK_MARKER_ATTR,
    CONTENT_BLOCK_MARKER_ATTRS,
    applyRendered,
    blockNodesOf,
    registerBlock,
    type BlockNode,
    renderBlock,
    warnUnrenderedBlock,
    type BlockOptions,
} from 'langsys-js-typescript';

/**
 * Content blocks on a server (spec SRV-1, MARK-1, SRV-5). The core's DOM classes
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
    // A block holding nested blocks is served as source: the rendered tree's nested hosts carry
    // their ids and resolved markers, but applying it writes neither onto the nested elements, and a
    // translated nested block served without them is read on the client as new source text.
    const nested = holdsNestedBlock(nodes);
    if (nested || !applyRendered(host, rendered).applied) {
        if (rendered.customId) host.setAttribute(CONTENT_BLOCK_MARKER_ATTR, rendered.customId);
        warnUnrenderedBlock(
            nested ? 'it contains nested blocks' : 'its translation reorders the markup Angular rendered'
        );
    }
    registerBlock(nodes, { ...options, host });
}

/** Whether a block's tree holds a nested block host. */
function holdsNestedBlock(nodes: readonly BlockNode[]): boolean {
    return nodes.some(
        (node) =>
            'tag' in node &&
            (CONTENT_BLOCK_MARKER_ATTRS.some((name) => node.attrs?.[name] !== undefined) ||
                holdsNestedBlock(node.children ?? []))
    );
}
