// src/lib/utils/markdownPasteExtension.js
// Paste markdown and get a page, not a wall of asterisks.
//
// Editing only. The read renderer never installs this — there is nothing to
// paste into — which is also why the conversion itself lives in a pure module
// next door rather than in here.
//
// ── When it declines to act, which matters more than when it acts ───────────
//   * The clipboard carries text/html. Something richer than markdown is on
//     offer and ProseMirror's own parser handles it better than we would.
//   * The text does not look like markdown (see looksLikeMarkdown). Converting
//     prose somebody meant literally is the irritating failure mode, and it is
//     harder to recover from than a paste that stayed plain.
//   * The cursor is inside a code block. Markdown pasted into code is code.
//
// ── The target's schema decides what survives ───────────────────────────────
// This produces headings, quotes, code blocks and rules whether or not the
// editor it is installed in can hold them: ProseMirror drops nodes its schema
// does not define. An editor that turns this on should therefore ENABLE the
// nodes markdown produces, or accept that pasting a document flattens it —
// see common/RichTextEditor.svelte, which does the former behind its
// `markdown` prop.

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { looksLikeMarkdown, markdownToHtml } from './markdownPaste.js';

export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addOptions() {
    return {
      /**
       * Treat `[label](./page.md)` as a link to another page of the same pack.
       * Dossier only — elsewhere there is no page for it to name.
       */
      internalLinks: false,
      /**
       * The heading level a single `#` becomes. Raise it where the editor's
       * schema starts lower than h1 — see RichTextEditor's `levels: [2, 3]`.
       */
      minHeading: 1,
      /**
       * Convert a markdown table into a real table. Only where the editor has
       * the table nodes — without them ProseMirror drops the whole thing, so
       * the default instead puts each row on its own line and keeps the text.
       */
      tables: false,
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;

    return [
      new Plugin({
        key: new PluginKey('dossierMarkdownPaste'),
        props: {
          handlePaste(view, event) {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;

            // A source offering HTML knows its own structure better than a
            // markdown guess would.
            if (clipboard.getData('text/html')) return false;

            const text = clipboard.getData('text/plain');
            if (!looksLikeMarkdown(text)) return false;

            // Inside a code block the markdown IS the content.
            const { $from } = view.state.selection;
            for (let depth = $from.depth; depth > 0; depth--) {
              if ($from.node(depth).type.name === 'codeBlock') return false;
            }

            const html = markdownToHtml(text, options);
            if (!html) return false;

            event.preventDefault();
            // parseOptions.preserveWhitespace false: the generated HTML is
            // already block-structured, and keeping the source's newlines would
            // add an empty paragraph between every element.
            editor.commands.insertContent(html, {
              parseOptions: { preserveWhitespace: false },
            });
            return true;
          },
        },
      }),
    ];
  },
});
