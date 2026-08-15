// src/lib/apps/dossier/utils/markdownPasteExtension.js
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

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { looksLikeMarkdown, markdownToHtml } from './markdownPaste.js';

export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;

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

            const html = markdownToHtml(text);
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
