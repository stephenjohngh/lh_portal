// src/lib/utils/editorSearchExtension.js
// Find-in-editor: the ProseMirror half. The matching itself is pure and lives
// in editorSearch.js.
//
// The whole document is flattened to ONE string with a position for each
// character, rather than searching text nodes one at a time. Formatting splits
// text into separate nodes, so a per-node search cannot find "the fire door"
// when "fire" is bold — the phrase does not exist in any single node. That is
// the same fault the Management search had against stored HTML, arrived at from
// the other direction.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findRanges, stepIndex } from './editorSearch.js';

export const searchKey = new PluginKey('editorSearch');

/** A block boundary is a word boundary — see textWithPositions. */
const BLOCK_GAP = '\n';

/**
 * The document as text, with the ProseMirror position of every character.
 *
 * @param {import('@tiptap/pm/model').Node} doc
 * @returns {{ text: string, positions: number[] }}
 */
export function textWithPositions(doc) {
  let text = '';
  const positions = [];

  doc.descendants((node, pos) => {
    if (node.isText) {
      const value = node.text ?? '';
      for (let i = 0; i < value.length; i++) positions.push(pos + i);
      text += value;
      return false;
    }
    // A separator between blocks, so the last word of one paragraph and the
    // first of the next do not fuse into a match that is not there. It gets a
    // position too, so the arrays stay the same length and index maths below
    // needs no special case.
    if (node.isBlock && text.length && !text.endsWith(BLOCK_GAP)) {
      text += BLOCK_GAP;
      positions.push(pos);
    }
    return true;
  });

  return { text, positions };
}

/** Matches as ProseMirror ranges, ready to decorate. */
export function matchRanges(doc, query) {
  if (!query) return [];
  const { text, positions } = textWithPositions(doc);

  return findRanges(text, query)
    .map(({ from, to }) => ({
      from: positions[from],
      // `to` is exclusive, so the last character's position plus one. Reading
      // positions[to] would be wrong at the end of a text node, where the next
      // character lives at a position a step away rather than one along.
      to: positions[to - 1] + 1,
    }))
    .filter(range => Number.isInteger(range.from) && Number.isInteger(range.to));
}

function decorate(ranges, activeIndex) {
  return ranges.map((range, i) => Decoration.inline(range.from, range.to, {
    class: i === activeIndex ? 'editor-find-hit editor-find-hit-active' : 'editor-find-hit',
  }));
}

export const EditorSearch = Extension.create({
  name: 'editorSearch',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,

        state: {
          init() {
            return { query: '', ranges: [], index: -1, decorations: DecorationSet.empty };
          },

          apply(tr, value, oldState, newState) {
            const meta = tr.getMeta(searchKey);

            // Nothing to do unless the query changed, the cursor was moved
            // between matches, or the document did.
            if (!meta && !tr.docChanged) return value;

            const query = meta?.query ?? value.query;
            if (!query) {
              return { query: '', ranges: [], index: -1, decorations: DecorationSet.empty };
            }

            // Re-found on every document change rather than mapped through the
            // transaction. Mapping keeps stale ranges alive: type inside a hit
            // and the highlight stays on text that no longer matches.
            const ranges = (meta?.query !== undefined || tr.docChanged)
              ? matchRanges(newState.doc, query)
              : value.ranges;

            let index;
            if (meta?.step) {
              index = stepIndex(ranges.length, value.index, meta.step);
            } else if (meta?.query !== undefined) {
              index = ranges.length ? 0 : -1;      // a new query starts at the first hit
            } else {
              index = Math.min(value.index, ranges.length - 1);
            }

            return {
              query,
              ranges,
              index,
              decorations: DecorationSet.create(newState.doc, decorate(ranges, index)),
            };
          },
        },

        props: {
          decorations(state) { return searchKey.getState(state)?.decorations; },
        },
      }),
    ];
  },

  // Both commands MUTATE the transaction Tiptap hands them and let Tiptap
  // dispatch it. The first version built its own transaction and dispatched
  // that, leaving Tiptap to dispatch its own — two transactions per keystroke,
  // the second built from a state that no longer existed. ProseMirror rejects
  // a mismatched transaction, which is why the arrows appeared to do nothing
  // and the count read one keystroke behind.
  addCommands() {
    return {
      /** Set (or clear, with '') what is being looked for. */
      setSearchQuery: (query) => ({ tr, dispatch }) => {
        if (dispatch) tr.setMeta(searchKey, { query: query ?? '' });
        return true;
      },

      /**
       * Move to the next or previous match and select it.
       *
       * Selecting the match rather than placing a caret near it does two
       * things: the editor scrolls to it, and typing replaces what was found —
       * which is usually why somebody went looking for it.
       */
      goToMatch: (step) => ({ state, tr, dispatch }) => {
        const current = searchKey.getState(state);
        if (!current?.ranges.length) return false;

        const index = stepIndex(current.ranges.length, current.index, step);
        const range = current.ranges[index];
        if (!range) return false;

        if (dispatch) {
          tr.setMeta(searchKey, { step });
          tr.setSelection(TextSelection.create(tr.doc, range.from, range.to));
          tr.scrollIntoView();
        }
        return true;
      },
    };
  },
});

/** What the find bar shows — read straight from plugin state. */
export function searchState(editor) {
  if (!editor) return { query: '', count: 0, index: -1 };
  const state = searchKey.getState(editor.state);
  return { query: state?.query ?? '', count: state?.ranges.length ?? 0, index: state?.index ?? -1 };
}
