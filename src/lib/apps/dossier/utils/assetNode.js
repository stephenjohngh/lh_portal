// src/lib/apps/dossier/utils/assetNode.js
// The asset block — a reference to a file on the pack's shelf.
//
// Declarative renderHTML with no node view, so the SAME markup is produced by
// the editor and by the read-only renderer (merge doc D10). An atom: it has no
// editable content, you select it as a unit.
//
// See utils/assetPreview.js for why display metadata is cached on the node
// alongside the document_id reference.

import { Node, mergeAttributes } from '@tiptap/core';
import { previewKind, fileProxyUrl, fmtSize } from './assetPreview.js';

/** Simple attr spec: round-trip through a data- attribute of the same name. */
function dataAttr(name, fallback = null) {
  return {
    default: fallback,
    parseHTML:  el => el.getAttribute(`data-${name}`) ?? fallback,
    renderHTML: attrs => (attrs[name] ? { [`data-${name}`]: attrs[name] } : {}),
  };
}

export const Asset = Node.create({
  name: 'asset',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      document_id:      dataAttr('document_id'),
      filename:         dataAttr('filename', 'File'),
      mime_type:        dataAttr('mime_type', ''),
      provider_file_id: dataAttr('provider_file_id', ''),
      size_bytes: {
        default: 0,
        parseHTML:  el => Number(el.getAttribute('data-size_bytes')) || 0,
        renderHTML: attrs => (attrs.size_bytes ? { 'data-size_bytes': String(attrs.size_bytes) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-asset]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { filename, mime_type, provider_file_id, size_bytes } = node.attrs;
    const kind = previewKind(mime_type);
    const url  = fileProxyUrl(provider_file_id, mime_type);
    const name = filename || 'File';
    const size = fmtSize(size_bytes);

    const wrapper = mergeAttributes(HTMLAttributes, {
      'data-asset': '',
      'data-kind': url ? kind : 'file',   // no usable URL → always the plain card
      class: 'dossier-asset',
    });

    // An unusable provider id (or a provider that addresses files by path)
    // degrades to a card with no link rather than a broken embed.
    if (!url) {
      return ['div', wrapper, ...cardChildren(name, size, null)];
    }

    if (kind === 'image') {
      return ['div', wrapper,
        ['img', { src: url, alt: name, class: 'dossier-asset-image' }],
        // The caption is the full-size affordance: an <a> around the <img>
        // itself would fight ProseMirror's node selection in edit mode.
        ['div', { class: 'dossier-asset-caption' },
          ['a', { href: url, target: '_blank', rel: 'noopener noreferrer' },
            `${name} — view full size`],
        ],
      ];
    }

    if (kind === 'pdf') {
      return ['div', wrapper,
        // An <iframe>, not an <object>: the portal's CSP sets object-src 'none'
        // (good hardening, left alone), while frame-src falls back to
        // default-src 'self' — so a same-origin iframe is already permitted.
        //
        // `sandbox` with no tokens gives the frame an opaque origin and no
        // scripting. That matters because these are USER-UPLOADED bytes: a file
        // stored as application/pdf but actually HTML would otherwise execute
        // in this app's own origin. The browser's built-in PDF viewer is not
        // page script, so it still renders.
        //
        // The sanitiser admits iframes only when the src is our own proxy.
        ['iframe', {
          src: url,
          sandbox: '',
          title: name,
          class: 'dossier-asset-pdf',
        }],
        ['div', { class: 'dossier-asset-caption' },
          ['a', { href: url, target: '_blank', rel: 'noopener noreferrer' },
            `${name} — open`],
        ],
      ];
    }

    return ['div', wrapper, ...cardChildren(name, size, url)];
  },

  /**
   * An editing affordance only — spec 2 §11 allows exactly this to differ
   * between modes. The node view renders the SAME declarative markup (via
   * renderHTML above) and adds a remove button over it, so the read-only
   * renderer is untouched and no markup is duplicated.
   *
   * It exists because an asset is an atom with no text cursor: without a
   * visible control, removing one means knowing to click-select it and press
   * Backspace, and a click lands inside the iframe or image instead.
   */
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'dossier-asset-host';

      const inner = document.createElement('div');
      inner.className = 'dossier-asset-inner';
      dom.appendChild(inner);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'dossier-asset-remove';
      remove.title = 'Remove this file from the page';
      remove.setAttribute('aria-label', 'Remove this file from the page');
      remove.textContent = '×';
      remove.contentEditable = 'false';
      remove.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        editor.view.dispatch(
          editor.state.tr.delete(pos, pos + node.nodeSize)
        );
      });
      dom.appendChild(remove);

      // Render the node's declarative markup into `inner`.
      paint(inner, node);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'asset') return false;
          paint(inner, updated);
          return true;
        },
        ignoreMutation: () => true,   // the whole subtree is ours, not ProseMirror's
      };
    };
  },

  addCommands() {
    return {
      /** @param {object} attrs from assetAttrsFromDocument() */
      insertAsset: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/**
 * Draw an asset's preview into a host element, reusing the same decisions as
 * renderHTML so edit and read modes stay identical.
 */
function paint(host, node) {
  const { filename, mime_type, provider_file_id, size_bytes } = node.attrs;
  const kind = previewKind(mime_type);
  const url  = fileProxyUrl(provider_file_id, mime_type);
  const name = filename || 'File';
  const size = fmtSize(size_bytes);

  host.textContent = '';
  host.className = 'dossier-asset-inner dossier-asset';
  host.setAttribute('data-kind', url ? kind : 'file');

  const caption = (text, href) => {
    const cap = document.createElement('div');
    cap.className = 'dossier-asset-caption';
    if (href) {
      const a = document.createElement('a');
      a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = text;
      cap.appendChild(a);
    } else {
      cap.textContent = text;
    }
    return cap;
  };

  if (url && kind === 'image') {
    const img = document.createElement('img');
    img.src = url; img.alt = name; img.className = 'dossier-asset-image';
    host.append(img, caption(`${name} — view full size`, url));
    return;
  }

  if (url && kind === 'pdf') {
    const frame = document.createElement('iframe');
    frame.src = url;
    frame.setAttribute('sandbox', '');
    frame.title = name;
    frame.className = 'dossier-asset-pdf';
    host.append(frame, caption(`${name} — open`, url));
    return;
  }

  const card = document.createElement('div');
  card.className = 'dossier-asset-card';
  const icon = document.createElement('span');
  icon.className = 'dossier-asset-icon';
  icon.textContent = '📎';
  const label = document.createElement(url ? 'a' : 'span');
  label.className = 'dossier-asset-name';
  label.textContent = size ? `${name} · ${size}` : name;
  if (url) { label.href = url; label.target = '_blank'; label.rel = 'noopener noreferrer'; }
  card.append(icon, label);
  host.appendChild(card);
}

/** The generic file card: name, size, and a download link when we have a URL. */
function cardChildren(name, size, url) {
  const label = size ? `${name} · ${size}` : name;
  return [
    ['div', { class: 'dossier-asset-card' },
      ['span', { class: 'dossier-asset-icon' }, '📎'],
      url
        ? ['a', { href: url, target: '_blank', rel: 'noopener noreferrer',
                  class: 'dossier-asset-name' }, label]
        : ['span', { class: 'dossier-asset-name' }, label],
    ],
  ];
}
