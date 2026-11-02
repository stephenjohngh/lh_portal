// src/lib/apps/dossier/utils/planBlocks.js
// Turning a plan's blocks (packPlan.js) into the ProseMirror JSON a page stores.
//
// Markdown becomes nodes the way a markdown PASTE does: markdownToHtml, then the
// editor's own schema parses that HTML. That is the only route that cannot drift
// from what the editor accepts, so it is the only one used. It needs a DOM, which
// the browser (and jsdom in tests) has; the converter is therefore injected.

import { getSchema } from '@tiptap/core';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { buildExtensions } from './blockSchema.js';
import { markdownToHtml } from '#lib/utils/markdownPaste.js';
import { assetAttrsFromDocument } from './assetPreview.js';
import { newUuid } from '#lib/utils/uuid.js';
import { findFile, findPage, findTable, pathKey } from './packPlan.js';

/**
 * A converter from an HTML string to the top-level nodes the schema allows.
 * Browser/jsdom only (it parses with a real DOM).
 */
export function makeHtmlToNodes() {
  const schema = getSchema(buildExtensions());
  const parser = PMDOMParser.fromSchema(schema);
  return (html) => {
    const dom = new window.DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    return parser.parse(dom.body).toJSON().content ?? [];
  };
}

const para = (text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined });

/**
 * @param {object} block - a plan block
 * @param {{ htmlToNodes: (html:string)=>object[],
 *           files: Map<string, object>,      lower-case ref → document_library row (or a stand-in)
 *           pages: Map<string, {id:string, slug:string, title:string}>,   pathKey → page
 *           tables: Map<string, {id:string, title:string}>,                lower-case title → dataset
 *           plan: object,
 *           mint?: ()=>string }} ctx
 * @returns {object[]} nodes to append to the page
 */
export function blockToNodes(block, ctx) {
  const mint = ctx.mint ?? newUuid;
  const md = (text) => {
    const nodes = ctx.htmlToNodes(markdownToHtml(String(text ?? ''), { tables: true, internalLinks: true }));
    return nodes.length ? nodes : [para('')];
  };

  switch (block.type) {
    case 'heading':
      return [{ type: 'heading', attrs: { level: block.level, uid: mint() },
                content: [{ type: 'text', text: block.text }] }];

    case 'text':
      return md(block.markdown);

    case 'html': {
      const nodes = ctx.htmlToNodes(String(block.html ?? ''));
      return nodes.length ? nodes : [para('')];
    }

    case 'image':
    case 'attachment': {
      const file = findFile(ctx.plan, block.file);
      const doc = file ? ctx.files.get(file.ref.toLowerCase()) : null;
      if (!doc) return [para(`[missing file: ${block.file}]`)];
      const attrs = { ...assetAttrsFromDocument(doc), uid: mint() };
      if (block.type === 'image' && block.width) attrs.width = block.width;
      return [{ type: 'asset', attrs }];
    }

    case 'callout':
      return [{ type: 'callout', attrs: { variant: block.variant, uid: mint() }, content: md(block.markdown) }];

    case 'toggle':
      return [{
        type: 'toggle', attrs: { open: block.open !== false, uid: mint() },
        content: [
          { type: 'toggleSummary', content: [{ type: 'text', text: block.summary }] },
          { type: 'toggleBody', content: md(block.markdown) },
        ],
      }];

    case 'embedPage': {
      const target = ctx.pages.get(pathKey(block.path));
      if (!target) return [para(`[missing page: ${block.path.join(' / ')}]`)];
      return [{ type: 'embedDoc', attrs: {
        target_doc_id: target.id, target_slug: target.slug, target_title: target.title,
        render_mode: block.mode ?? 'full', uid: mint(),
      } }];
    }

    case 'embedTable': {
      const set = ctx.tables.get(String(block.title).trim().toLowerCase());
      if (!set) return [para(`[missing table: ${block.title}]`)];
      return [{ type: 'embedDataset', attrs: { dataset_id: set.id, dataset_title: set.title, uid: mint() } }];
    }

    default:
      return [];
  }
}

/**
 * Give each page link (`[x](./slug.md)`) the id of the page it names, as well as
 * the slug it was written with. A slug naming no page in the pack is left alone:
 * the broken-reference panel reports it, as it does for a link typed in the editor.
 */
function resolvePageLinks(node, ctx) {
  if (!node || typeof node !== 'object') return node;
  const bySlug = new Map([...ctx.pages.values()].map(p => [p.slug, p.id]));
  const out = { ...node };
  if (Array.isArray(out.marks)) {
    out.marks = out.marks.map(m => (m?.type === 'docLink' && m.attrs?.target_slug && bySlug.has(m.attrs.target_slug)
      ? { ...m, attrs: { ...m.attrs, target_doc_id: bySlug.get(m.attrs.target_slug) } } : m));
  }
  if (Array.isArray(out.content)) out.content = out.content.map(c => resolvePageLinks(c, ctx));
  return out;
}

/** A whole page's `blocks` JSON. */
export function pageBlocksJson(page, ctx) {
  const content = (page?.blocks ?? []).flatMap(b => blockToNodes(b, ctx));
  return resolvePageLinks({ type: 'doc', content: content.length ? content : [para('')] }, ctx);
}

// Re-exported so callers building the context need one import.
export { findPage, findTable };
