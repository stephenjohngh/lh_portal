// src/lib/apps/dossier/utils/embedDocNode.js
// Transclusion — showing another page's content inside this one.
//
// The node itself is an ATOM that renders only a placeholder. It cannot render
// the target's content, because a declarative renderHTML has no access to the
// other pages — resolution is a separate pipeline stage (spec 2 §11: "resolve
// references → cycle + depth guard → render tree"), performed by
// blockRender.expandEmbeds() once the host page's HTML exists.
//
// That split is deliberate: it keeps the guard in one pure place and means the
// P3 reader resolves against a snapshot with exactly the same code.

import { Node, mergeAttributes } from '@tiptap/core';
import { normaliseEmbedMode } from './embedGuard.js';

export const EmbedDoc = Node.create({
  name: 'embedDoc',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      target_doc_id: {
        default: null,
        parseHTML:  el => el.getAttribute('data-embed-doc'),
        renderHTML: attrs => (attrs.target_doc_id ? { 'data-embed-doc': attrs.target_doc_id } : {}),
      },
      target_slug: {
        default: null,
        parseHTML:  el => el.getAttribute('data-embed-slug'),
        renderHTML: attrs => (attrs.target_slug ? { 'data-embed-slug': attrs.target_slug } : {}),
      },
      render_mode: {
        default: 'full',
        parseHTML:  el => normaliseEmbedMode(el.getAttribute('data-embed-mode')),
        renderHTML: attrs => ({ 'data-embed-mode': normaliseEmbedMode(attrs.render_mode) }),
      },
      // The title as it was when embedded — so a link card still reads sensibly
      // if the target has since been deleted.
      target_title: {
        default: null,
        parseHTML:  el => el.getAttribute('data-embed-title'),
        renderHTML: attrs => (attrs.target_title ? { 'data-embed-title': attrs.target_title } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-doc]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // A placeholder only. expandEmbeds() fills it, applying the guard first.
    return ['div', mergeAttributes(HTMLAttributes, { class: 'dossier-embed' })];
  },

  /**
   * Edit-mode affordance. The editor genuinely cannot show the target's content
   * — a Tiptap node has no access to the other pages — so instead of an empty
   * placeholder it shows WHAT is embedded and HOW, plus a remove control. The
   * Preview button in the workspace renders the real thing through the read
   * path, which is where an author checks the result.
   */
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'dossier-embed dossier-embed-stub';
      dom.contentEditable = 'false';

      const title = document.createElement('div');
      title.className = 'dossier-embed-title';
      title.textContent = node.attrs.target_title || 'Embedded page';

      const hint = document.createElement('div');
      hint.className = 'dossier-embed-summary';
      hint.textContent = {
        full:      'Shows this page in full. Use Preview to see it.',
        summary:   'Shows this page’s title and opening line.',
        link_card: 'Shows a link to this page only.',
      }[normaliseEmbedMode(node.attrs.render_mode)];

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'dossier-asset-remove';
      remove.title = 'Remove this embedded page';
      remove.setAttribute('aria-label', 'Remove this embedded page');
      remove.textContent = '×';
      remove.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
      });

      dom.append(title, hint, remove);
      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'embedDoc') return false;
          title.textContent = updated.attrs.target_title || 'Embedded page';
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },

  addCommands() {
    // Cast: Tiptap types commands against its own RawCommands.
    return /** @type {any} */ ({
      /** @param {{target_doc_id, target_slug, target_title, render_mode}} attrs */
      insertDocEmbed: (attrs) => ({ commands }) =>
        commands.insertContent({
          type: this.name,
          attrs: { ...attrs, render_mode: normaliseEmbedMode(attrs?.render_mode) },
        }),
    });
  },
});
