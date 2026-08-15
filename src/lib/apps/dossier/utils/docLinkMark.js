// src/lib/apps/dossier/utils/docLinkMark.js
// A cross-link to another page in the same pack.
//
// A MARK, not a node: it wraps existing text so an author writes "as set out in
// the chronology" and links the two words that read naturally, rather than
// dropping a labelled chip into the sentence.
//
// It carries BOTH the target's id and its slug:
//   * `target_doc_id`   — the real reference; what the link graph follows and
//                         what survives a rename.
//   * `target_slug`     — the address, which becomes the href in a published
//                         pack (P3) and is what remains legible if the target
//                         is ever deleted.
//
// Rendered declaratively so the read-only renderer produces the same markup.

import { Mark, mergeAttributes } from '@tiptap/core';

export const DocLink = Mark.create({
  name: 'docLink',

  // A cross-link should not bleed into text typed after it.
  inclusive: false,
  // Cross-links and external links are different things; don't merge them.
  excludes: 'link',

  addAttributes() {
    return {
      target_doc_id: {
        default: null,
        parseHTML:  el => el.getAttribute('data-doc-id'),
        renderHTML: attrs => (attrs.target_doc_id ? { 'data-doc-id': attrs.target_doc_id } : {}),
      },
      target_slug: {
        default: null,
        parseHTML:  el => el.getAttribute('data-doc-slug'),
        renderHTML: attrs => (attrs.target_slug ? { 'data-doc-slug': attrs.target_slug } : {}),
      },
    };
  },

  parseHTML() {
    // Either identifier is enough to be a cross-link. A link pasted as markdown
    // arrives with a SLUG only — it cannot know an id it has never seen — and
    // requiring the id meant such a link silently became ordinary text.
    return [{ tag: 'a[data-doc-id]' }, { tag: 'a[data-doc-slug]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // href is the slug fragment, not a real route: inside the workspace a
    // delegated click handler intercepts it, and at P3 the reader rewrites it
    // to the published path. Never an absolute URL — a pack must not contain
    // links that only work on one deployment.
    const slug = HTMLAttributes['data-doc-slug'];
    return ['a', mergeAttributes(HTMLAttributes, {
      class: 'dossier-doclink',
      href: slug ? `#${slug}` : '#',
    }), 0];
  },

  addCommands() {
    // Cast: Tiptap types commands against its own RawCommands, which cannot
    // know about ones we add without a .d.ts augmentation.
    return /** @type {any} */ ({
      /** @param {{ target_doc_id: string, target_slug: string|null }} attrs */
      setDocLink: (attrs) => ({ commands }) => commands.setMark(this.name, attrs),
      unsetDocLink: () => ({ commands }) => commands.unsetMark(this.name),
    });
  },
});
