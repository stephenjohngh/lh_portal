// src/lib/apps/dossier/utils/calloutNode.js
// The callout block — "⚠ Key issue" / "ℹ Background" / "✅ Recommendation".
// The three variants are taken straight from spec 1 §4.2.
//
// No node view is needed: the icon is drawn by CSS from `data-variant`, so the
// node is a plain declarative spec. That keeps it renderable by the P3 public
// reader with no editor code involved.

import { Node, mergeAttributes } from '@tiptap/core';

export const CALLOUT_VARIANTS = [
  { value: 'info',    label: 'Background',     icon: 'ℹ' },
  { value: 'warning', label: 'Key issue',      icon: '⚠' },
  { value: 'success', label: 'Recommendation', icon: '✅' },
];

const DEFAULT_VARIANT = 'info';

/** Coerce anything unrecognised to the default — stored docs must never carry a bad variant. */
export function normaliseVariant(value) {
  return CALLOUT_VARIANTS.some(v => v.value === value) ? value : DEFAULT_VARIANT;
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: DEFAULT_VARIANT,
        parseHTML:  el => normaliseVariant(el.getAttribute('data-variant')),
        renderHTML: attrs => ({ 'data-variant': normaliseVariant(attrs.variant) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  addCommands() {
    return {
      setCallout: (variant = DEFAULT_VARIANT) => ({ commands }) =>
        commands.wrapIn(this.name, { variant: normaliseVariant(variant) }),

      // Wrapping the selection again with the SAME variant unwraps it, which is
      // what makes the toolbar button feel like a toggle.
      toggleCallout: (variant = DEFAULT_VARIANT) => ({ commands }) =>
        commands.toggleWrap(this.name, { variant: normaliseVariant(variant) }),

      unsetCallout: () => ({ commands }) => commands.lift(this.name),
    };
  },
});
