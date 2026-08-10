// src/lib/apps/dossier/utils/blockSchema.js
// The Dossier editor's Tiptap schema.
//
// Decision (merge doc §10.2): Tiptap/ProseMirror JSON *is* the canonical
// `blocks jsonb` — there is no bespoke block array to translate to and from.
// That buys a mature editor, and costs us the block-identity work below.
//
// P0 block set is deliberately small (plan §4): paragraph, heading 1-3, lists,
// blockquote, horizontal rule, callout and toggle. Asset/embed/dataset blocks
// are P1-P2 by definition.

import { Extension } from '@tiptap/core';
import StarterKit    from '@tiptap/starter-kit';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { newUuid }   from '$lib/utils/uuid';
import { planIdFixes, collectBlocks } from './blockId.js';
import { Callout }   from './calloutNode.js';
import { Toggle, ToggleSummary, ToggleBody } from './toggleNode.js';

/** An empty ProseMirror doc — matches the DB default on dossier_docs.blocks. */
export const EMPTY_DOC = { type: 'doc', content: [] };

/**
 * Node types that carry a stable `uid`. Deliberately excludes listItem: a link
 * to "the third bullet" is not a useful anchor, and stamping every item would
 * bloat the stored JSON for no benefit. Likewise toggleSummary/toggleBody —
 * the addressable thing is the toggle itself, not its two halves.
 */
export const ADDRESSABLE_TYPES = [
  'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList',
  'codeBlock', 'horizontalRule', 'callout', 'toggle',
];

/**
 * Adds a `uid` attribute to addressable blocks and keeps it correct.
 *
 * The plugin runs on every doc-changing transaction, but planIdFixes() returns
 * an empty list when nothing is wrong — so a normal keystroke appends no extra
 * transaction. See utils/blockId.js for the stamping rule and why duplicates
 * (copy/paste) matter as much as missing ids.
 */
export const BlockId = Extension.create({
  name: 'blockId',

  addOptions() {
    return { types: ADDRESSABLE_TYPES };
  },

  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        uid: {
          default: null,
          // Round-trip through HTML so copy/paste within the editor keeps the
          // attribute — which is exactly why the duplicate guard is needed.
          parseHTML:  el => el.getAttribute('data-uid'),
          renderHTML: attrs => (attrs.uid ? { 'data-uid': attrs.uid } : {}),
        },
      },
    }];
  },

  addProseMirrorPlugins() {
    const types = new Set(this.options.types);

    return [
      new Plugin({
        key: new PluginKey('dossierBlockId'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null;

          const fixes = planIdFixes(collectBlocks(newState.doc, types), newUuid);
          if (!fixes.length) return null;

          const tr = newState.tr;
          // Only attributes change, so earlier positions stay valid as we go.
          for (const fix of fixes) tr.setNodeAttribute(fix.pos, 'uid', fix.uid);
          return tr.setMeta('addToHistory', false);   // id repair is not an undo step
        },
      }),
    ];
  },
});

/**
 * The extension list for a Dossier editor.
 * @param {{ placeholder?: string }} [opts]
 */
export function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Kept: paragraph, text, bold, italic, strike, code, lists, blockquote,
      // codeBlock, horizontalRule, hardBreak, history, link.
      link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } },
    }),
    Callout,
    Toggle, ToggleSummary, ToggleBody,
    BlockId,
  ];
}

/**
 * True when a doc has no meaningful content — used to decide whether a save is
 * worth writing and to show the empty-page hint.
 * @param {object} json ProseMirror doc JSON
 */
export function isEmptyDoc(json) {
  const content = json?.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every(node =>
    (node.type === 'paragraph') && !(node.content?.length));
}
