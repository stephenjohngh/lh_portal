// src/lib/apps/dossier/utils/contentsPage.js
//
// A contents page made in the editor (user, 2026-11-12). It replaces the
// "Start with a contents page" tick in the Publish dialog, which generated a
// page the author never saw and could not change. This one is an ordinary
// page: every page of the pack as a link, nested as the page tree is, which the
// author can then edit, and which the recipient reads like any other page.
//
// The contents page is found by its title, at the top level.
//
// Pure.

import { buildTree } from './docTree.js';
import { newUuid } from '#lib/utils/uuid.js';

export const CONTENTS_TITLE = 'Contents';

/** @param {any[]} docs @returns {any|null} the pack's contents page */
export function findContentsPage(docs = []) {
  return docs.find(d => !d.parent_doc_id && String(d.title ?? '').trim().toLowerCase() === CONTENTS_TITLE.toLowerCase()) ?? null;
}

/**
 * The contents page's content: a heading, then the pages as nested lists of links.
 * @param {any[]} docs  the pack's pages
 * @param {string|null} [selfId]  the contents page itself, left out
 * @param {() => string} [mint]
 */
export function contentsBlocks(docs = [], selfId = null, mint = newUuid) {
  const tree = buildTree(docs.filter(d => d.id !== selfId));
  /** @param {any[]} nodes @returns {any} */
  const list = (nodes) => ({
    type: 'bulletList',
    content: nodes.map(n => ({
      type: 'listItem',
      content: [
        { type: 'paragraph', content: [{
          type: 'text', text: n.title || 'Untitled',
          marks: [{ type: 'docLink', attrs: { target_doc_id: n.id, target_slug: n.slug ?? null } }],
        }] },
        ...(n.children?.length ? [list(n.children)] : []),
      ],
    })),
  });
  const content = [{ type: 'heading', attrs: { level: 1, uid: mint() }, content: [{ type: 'text', text: CONTENTS_TITLE }] }];
  content.push(tree.length ? list(tree) : { type: 'paragraph', content: [{ type: 'text', text: 'This pack has no other pages yet.' }] });
  return { type: 'doc', content };
}
