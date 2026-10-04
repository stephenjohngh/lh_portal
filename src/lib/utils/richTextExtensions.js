// src/lib/utils/richTextExtensions.js
// The extension list of common/RichTextEditor.svelte — the editor behind an
// Info note and Management's three activity boxes.
//
// A module rather than inline in the component so a test can build a REAL
// editor from exactly what the app uses (richTextExtensions.test.js). What a
// paste turns into is decided by the schema, and a schema written out twice —
// once here, once in a test — is two schemas.
//
// ── `markdown`: paste a document and keep it (2026-09-28) ───────────────────
// With it on, pasted markdown becomes what Dossier makes of it: headings,
// lists, quotes, code, rules, links and TABLES. This editor is also asked to
// HOLD those nodes, which it otherwise turns off — ProseMirror drops what its
// schema cannot hold, taking the text with it, which is worse than not
// converting at all.
//   · Headings are h2–h4, three levels one step below Dossier's h1–h3. The top
//     level of a note is its title, and of a comment the comment; `#`, `##`
//     and `###` stay three distinct levels.
//   · Tables have no toolbar of their own, exactly as in Dossier: type in the
//     cells; select every cell and press Delete to remove one.
// Every caller turns it on today. Off, the editor is the plain comment box it
// started as: bold, italic, underline, lists, links.
//
// ⚠ Whatever this schema can hold, #lib/utils/sanitizeHtml.js must let through
// on save and on display, or it is lost on the way to the database with no
// error — the table tags were added there for exactly this.

import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { MarkdownPaste } from './markdownPasteExtension.js';
import { EditorSearch } from './editorSearchExtension.js';

/** The heading tags a markdown-mode editor holds. h1 is the note title's. */
export const RICH_TEXT_HEADING_LEVELS = /** @type {(1|2|3|4|5|6)[]} */ ([2, 3, 4]);

/**
 * @param {{ markdown?: boolean }} [opts]
 */
export function richTextExtensions({ markdown = false } = {}) {
  const levels = RICH_TEXT_HEADING_LEVELS;
  return [
    StarterKit.configure({
      // Keep: bold, italic, underline, bulletList, orderedList,
      //       hardBreak, history, paragraph, text, document
      //
      // The rest are off because the toolbar does not offer them — except
      // when `markdown` is set, where a paste can produce them and the
      // schema has to be able to hold what it produces.
      heading:        markdown ? { levels } : false,
      blockquote:     markdown ? {} : false,
      codeBlock:      markdown ? {} : false,
      horizontalRule: markdown ? {} : false,
      strike:         markdown ? {} : false,
      code:           markdown ? {} : false,
      // Link ships inside StarterKit v3 — configure it here rather than
      // registering @tiptap/extension-link separately (which duplicates it).
      link: {
        // Auto-convert typed/pasted URLs to links
        autolink:   true,
        // Don't open in the editor on click (allows cursor placement)
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel:    'noopener noreferrer',
          class:  'rte-link',
        },
      },
    }),
    // resizable off, as in Dossier: column widths are a layout decision, and
    // the sanitiser would strip the widths on save anyway.
    ...(markdown ? [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell] : []),
    // After StarterKit, and only when asked for: it reads the clipboard before
    // Tiptap's own handler but after the component's editorProps.handlePaste,
    // which is the order that matters — an email paste in an email activity is
    // not a markdown paste. Its heading range matches `levels` above, or a
    // converted heading is a tag this schema drops, line and all.
    ...(markdown ? [MarkdownPaste.configure({
      minHeading: levels[0],
      maxHeading: levels[levels.length - 1],
      tables:     true,
    })] : []),
    // Find-in-editor. Always on: the browser's Ctrl+F searches the whole page,
    // which for an editor inside a dialog means it matches — and scrolls to —
    // text behind the dialog that nobody can see.
    EditorSearch,
  ];
}
