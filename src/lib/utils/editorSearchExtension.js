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
import { Plugin, PluginKey } from '@tiptap/pm/state';
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

  addCommands() {
    return {
      /** Set (or clear, with '') what is being looked for. */
      setSearchQuery: (query) => ({ state, dispatch }) => {
        dispatch?.(state.tr.setMeta(searchKey, { query: query ?? '' }));
        return true;
      },

      /**
       * Move to the next or previous match and put the cursor there.
       *
       * The selection moves as well as the highlight, so the editor scrolls to
       * it — and so typing continues from where the reader was sent, which is
       * what they were looking for the text in order to do.
       */
      goToMatch: (step) => ({ state, dispatch, tr }) => {
        const current = searchKey.getState(state);
        if (!current?.ranges.length) return false;

        const index = stepIndex(current.ranges.length, current.index, step);
        const range = current.ranges[index];

        tr.setMeta(searchKey, { step });
        tr.setSelection(state.selection.constructor.near(tr.doc.resolve(range.from)));
        tr.scrollIntoView();
        dispatch?.(tr);
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
