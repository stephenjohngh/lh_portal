// src/lib/apps/dossier/utils/toggleNode.js
// The toggle block — spec 2 §5.1 calls this "the primary progressive-disclosure
// mechanism", and §9.3 has the reader arriving with author-collapsed sections
// already closed.
//
// Structure: toggle > (toggleSummary, toggleBody). The summary is one line of
// rich text; the body holds any blocks, including nested toggles.
//
// `open` is a persisted node ATTRIBUTE, not view state, because the author
// decides what a recipient sees collapsed — that is the whole point of the
// feature. Flipping it is marked addToHistory:false so it is not an undo step.
//
// Why a vanilla ProseMirror node view rather than a Svelte one: @tiptap/svelte
// is not a dependency, and adding it would pull Svelte-5 runes into a codebase
// that is deliberately legacy-syntax throughout. A plain dom/contentDOM view
// needs no framework binding at all.
//
// Why not <details>/<summary>: browsers treat a click inside <summary> as a
// toggle, so placing a caret to edit the summary text fights the element.

import { Node, mergeAttributes } from '@tiptap/core';

export const ToggleSummary = Node.create({
  name: 'toggleSummary',
  content: 'inline*',
  // Not in the 'block' group: it may only appear inside a toggle.
  parseHTML()  { return [{ tag: 'div[data-toggle-summary]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle-summary': '' }), 0];
  },
});

export const ToggleBody = Node.create({
  name: 'toggleBody',
  content: 'block+',
  parseHTML()  { return [{ tag: 'div[data-toggle-body]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle-body': '' }), 0];
  },
});

export const Toggle = Node.create({
  name: 'toggle',
  group: 'block',
  content: 'toggleSummary toggleBody',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML:  el => el.getAttribute('data-open') !== 'false',
        renderHTML: attrs => ({ 'data-open': attrs.open ? 'true' : 'false' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-toggle]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-toggle': '' }), 0];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'dossier-toggle';
      dom.setAttribute('data-open', node.attrs.open ? 'true' : 'false');

      const chevron = document.createElement('button');
      chevron.type = 'button';
      chevron.className = 'dossier-toggle-chevron';
      chevron.contentEditable = 'false';
      chevron.setAttribute('aria-label', 'Expand or collapse this section');
      chevron.textContent = node.attrs.open ? '▼' : '▶';

      chevron.addEventListener('mousedown', (event) => {
        // preventDefault keeps the caret where it was — without it, clicking
        // the chevron also moves the selection into the toggle.
        event.preventDefault();
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        const current = editor.state.doc.nodeAt(pos);
        if (!current) return;
        editor.view.dispatch(
          editor.state.tr
            .setNodeAttribute(pos, 'open', !current.attrs.open)
            .setMeta('addToHistory', false)
        );
      });

      const contentDOM = document.createElement('div');
      contentDOM.className = 'dossier-toggle-inner';

      dom.appendChild(chevron);
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        update(updated) {
          if (updated.type.name !== 'toggle') return false;
          dom.setAttribute('data-open', updated.attrs.open ? 'true' : 'false');
          chevron.textContent = updated.attrs.open ? '▼' : '▶';
          return true;
        },
        // The chevron is ours, not ProseMirror's — its mutations must not be
        // read back as document changes.
        ignoreMutation: (mutation) =>
          mutation.target === chevron || chevron.contains(mutation.target),
      };
    };
  },

  addCommands() {
    return {
      setToggle: () => ({ commands }) =>
        commands.insertContent({
          type: this.name,
          content: [
            { type: 'toggleSummary' },
            { type: 'toggleBody', content: [{ type: 'paragraph' }] },
          ],
        }),
    };
  },
});
