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
import {
  previewKind, fileProxyUrl, fmtSize, assetIsMissing,
  IMAGE_WIDTHS, IMAGE_WIDTH_LABEL, normaliseImageWidth,
} from './assetPreview.js';
import { renderSheetPreviewHtml } from './sheetPreview.js';

/**
 * Simple attr spec: round-trip through a data- attribute of the same name.
 * @param {string} name
 * @param {string|null} [fallback]
 */
function dataAttr(name, fallback = null) {
  return {
    default: fallback,
    parseHTML:  el => el.getAttribute(`data-${name}`) ?? fallback,
    renderHTML: attrs => (attrs[name] ? { [`data-${name}`]: attrs[name] } : {}),
  };
}

export const Asset = Node.create({
  name: 'asset',

  addOptions() {
    return {
      /**
       * A Svelte-store-shaped `{ subscribe }` yielding the pack's shelf, or
       * null. Injected rather than imported so this module stays free of app
       * state — the P3 reader uses read mode and supplies nothing.
       *
       * The node view SUBSCRIBES to it. Checking once at paint time would go
       * stale the moment a file was deleted, which is exactly the bug this
       * exists to fix: the editor kept showing a healthy image because nothing
       * told it the file had gone, and a cached image never raises an error.
       */
      filesProvider: null,

      /**
       * Where this render's file bytes come from.
       *
       * Empty (the default) means this app's own media proxy, which is right
       * for the AUTHOR. A published pack passes its token-scoped base, so the
       * URL becomes `<base><document_id>` and every request is checked against
       * the publication's manifest, its expiry and its revocation.
       *
       * Deciding it here rather than rewriting the HTML afterwards is
       * deliberate: a post-render pass needs a DOM, so it would quietly do
       * nothing during SSR and emit portal-wide proxy URLs to a recipient.
       */
      assetBase: '',
    };
  },
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      document_id:      dataAttr('document_id'),
      filename:         dataAttr('filename', 'File'),
      mime_type:        dataAttr('mime_type', ''),
      provider_file_id: dataAttr('provider_file_id', ''),
      width: {
        default: 'full',
        parseHTML:  el => normaliseImageWidth(el.getAttribute('data-width')),
        renderHTML: attrs => ({ 'data-width': normaliseImageWidth(attrs.width) }),
      },
      /**
       * A SNAPSHOT of the first few rows of a spreadsheet, taken once when the
       * block is inserted (P2 step 4).
       *
       * Caching here rather than fetching at render time is what keeps the
       * renderer synchronous — the same reason filename and size are cached,
       * and the same trade-off. It also means a P3 published pack shows its
       * tables with no extra endpoint and no exceljs in the reader.
       *
       * Staleness is not a real risk: document_library never rewrites a file in
       * place, so a replacement is a new row and therefore a new block. There
       * is deliberately no refresh control.
       */
      sheet_preview: {
        default: null,
        parseHTML: (el) => {
          try { return JSON.parse(el.getAttribute('data-sheet_preview') ?? 'null'); }
          catch { return null; }     // a corrupted attr degrades to a plain card
        },
        renderHTML: attrs => (attrs.sheet_preview
          ? { 'data-sheet_preview': JSON.stringify(attrs.sheet_preview) } : {}),
      },
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
    const { filename, mime_type, provider_file_id, size_bytes, document_id } = node.attrs;
    const kind = previewKind(mime_type, filename);
    const url  = this.options.assetBase
      ? `${this.options.assetBase}${encodeURIComponent(document_id ?? '')}`
      : fileProxyUrl(provider_file_id, mime_type);
    const name = filename || 'File';
    const size = fmtSize(size_bytes);

    // Belt to stripStorageIds()'s braces: when rendering for a recipient, the
    // storage id must not appear even as a data- attribute. The media proxy is
    // unauthenticated, so a leaked provider id outlives revocation entirely —
    // and a caller who forgets to strip should still not be able to leak one.
    const attrs = this.options.assetBase
      ? Object.fromEntries(
          Object.entries(HTMLAttributes).filter(([k]) => k !== 'data-provider_file_id'))
      : HTMLAttributes;

    const wrapper = mergeAttributes(attrs, {
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

    if (kind === 'sheet') {
      // The card only. blockRender's resolveSheetPreviews() puts the table
      // above it from the snapshot in data-sheet_preview, using the same one
      // renderer the node view calls — a Tiptap render spec cannot carry raw
      // HTML, and a second table renderer here would be free to drift.
      return ['div', wrapper, ...cardChildren(name, size, url, '▦', 'Open')];
    }

    if (kind === 'pdf') {
      // A card, not an embedded viewer — see assetPreview.js for the four
      // failed frame attempts and why stopping was the better call.
      return ['div', wrapper, ...cardChildren(name, size, url, '📄', 'Open PDF')];
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
    const { filesProvider } = this.options;

    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'dossier-asset-host';

      const inner = document.createElement('div');
      inner.className = 'dossier-asset-inner';
      dom.appendChild(inner);

      const controls = document.createElement('div');
      controls.className = 'dossier-block-controls';
      controls.contentEditable = 'false';

      // Size is only meaningful for an image; a card is always full width.
      const sizes = document.createElement('span');
      sizes.className = 'dossier-block-sizes';
      for (const value of IMAGE_WIDTHS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = IMAGE_WIDTH_LABEL[value];
        button.title = `Show this image at ${IMAGE_WIDTH_LABEL[value].toLowerCase()} width`;
        button.dataset.width = value;
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          if (typeof getPos !== 'function') return;
          const pos = getPos();
          if (pos == null) return;
          // A real document change: the chosen size is an author decision that
          // must persist and reach the reader, not a view preference.
          editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, 'width', value));
        });
        sizes.appendChild(button);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'dossier-block-remove';
      remove.title = 'Remove this file from the page';
      remove.setAttribute('aria-label', 'Remove this file from the page');
      remove.textContent = '×';
      remove.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;      // node already gone from the document
        editor.view.dispatch(
          editor.state.tr.delete(pos, pos + node.nodeSize)
        );
      });

      controls.append(sizes, remove);
      dom.appendChild(controls);

      let current = node;
      let missing = false;
      let lastFiles = null;   // latest shelf seen, so update() can re-derive

      const repaint = () => {
        paint(inner, current, missing, describeFile(current, lastFiles));
        // Size controls only apply to an image that actually rendered.
        const isImage = !missing && previewKind(current.attrs.mime_type) === 'image'
          && Boolean(fileProxyUrl(current.attrs.provider_file_id, current.attrs.mime_type));
        sizes.hidden = !isImage;
        const active = normaliseImageWidth(current.attrs.width);
        for (const button of sizes.children) {
          button.classList.toggle('is-active', button.dataset.width === active);
        }
      };

      // Re-check whenever the shelf changes, so removing a file marks the block
      // immediately rather than at the next reload.
      const unsubscribe = filesProvider?.subscribe
        ? filesProvider.subscribe((files) => {
            lastFiles = files;
            const next = assetIsMissing(current.attrs.document_id, files);
            // Repaint on ANY shelf change, not only when missing flips: the
            // file's description is read from the shelf too, so an edit to it
            // must show here without re-inserting the block.
            missing = next;
            repaint();
          })
        : null;

      repaint();

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'asset') return false;
          current = updated;
          // Re-derive against the last known shelf: the subscription only fires
          // when the shelf changes, so it will not correct this for us.
          missing = assetIsMissing(current.attrs.document_id, lastFiles);
          repaint();
          return true;
        },
        destroy() { unsubscribe?.(); },
        ignoreMutation: () => true,   // the whole subtree is ours, not ProseMirror's
      };
    };
  },

  addCommands() {
    // Cast: Tiptap types commands against its own RawCommands, which cannot
    // know about one we add without a .d.ts augmentation — disproportionate
    // for a single command.
    return /** @type {any} */ ({
      /** @param {object} attrs from assetAttrsFromDocument() */
      insertAsset: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    });
  },
});

/**
 * Draw an asset's preview into a host element, reusing the same decisions as
 * renderHTML so edit and read modes stay identical.
 */
/** The file's description, read live from the shelf (never copied onto the node). */
function describeFile(node, files) {
  if (!Array.isArray(files)) return '';
  return files.find(f => f.id === node.attrs.document_id)?.description ?? '';
}

function paint(host, node, missing = false, description = '') {
  const { filename, mime_type, provider_file_id, size_bytes } = node.attrs;
  const kind = previewKind(mime_type, filename);
  const url  = fileProxyUrl(provider_file_id, mime_type);
  const name = filename || 'File';
  const size = fmtSize(size_bytes);

  host.textContent = '';
  host.className = 'dossier-asset-inner dossier-asset';
  host.setAttribute('data-kind', missing ? 'missing' : (url ? kind : 'file'));
  host.setAttribute('data-width', normaliseImageWidth(node.attrs.width));

  if (missing) {
    host.appendChild(missingCard(name));
    return;
  }

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
    // The editor cannot know the shelf, so it finds out the way the browser
    // does: a file deleted from storage fails to load, and the block says so
    // instead of showing a broken-image glyph and a link that 404s.
    img.addEventListener('error', () => {
      host.textContent = '';
      host.appendChild(missingCard(name));
    }, { once: true });
    host.append(img, caption(`${name} — view full size`, url));
    if (description) host.appendChild(descriptionEl(description));
    return;
  }

  // A spreadsheet shows its snapshot above the card. Same function the read
  // path calls, so the author sees what the reader will get.
  if (kind === 'sheet' && node.attrs.sheet_preview) {
    const table = document.createElement('div');
    // Escaped inside renderSheetPreviewHtml; the values are cell text.
    table.innerHTML = renderSheetPreviewHtml(node.attrs.sheet_preview, escapeAttr);
    if (table.firstChild) host.appendChild(table.firstChild);
  }

  // PDFs and everything else: the same card renderHTML produces, built as DOM.
  // Kept structurally identical on purpose — if these two drift, the author
  // stops seeing what the reader will get.
  const isPdf = kind === 'pdf';
  const card = document.createElement('div');
  card.className = 'dossier-asset-card';

  const icon = document.createElement('span');
  icon.className = 'dossier-asset-icon';
  icon.textContent = isPdf ? '📄' : (kind === 'sheet' ? '▦' : '📎');

  const label = document.createElement('span');
  label.className = 'dossier-asset-name';
  label.textContent = size ? `${name} · ${size}` : name;

  let action;
  if (url) {
    const link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.className = 'dossier-asset-action';
    link.textContent = isPdf ? 'Open PDF' : 'Open';
    action = link;
  } else {
    action = document.createElement('span');
    action.className = 'dossier-asset-action dossier-asset-missing';
    action.textContent = 'Unavailable';
  }

  card.append(icon, label, action);
  host.appendChild(card);
  if (description) host.appendChild(descriptionEl(description));
}

/** Escape for HTML text and quoted attribute contexts. */
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The caption an author typed when uploading — what the file IS, not what it is called. */
function descriptionEl(text) {
  const el = document.createElement('div');
  el.className = 'dossier-asset-description';
  el.textContent = text;
  return el;
}

/** Shown in place of a preview once we know the file is gone. */
function missingCard(name) {
  const card = document.createElement('div');
  card.className = 'dossier-asset-card dossier-asset-gone';

  const icon = document.createElement('span');
  icon.className = 'dossier-asset-icon';
  icon.textContent = '⚠';

  const label = document.createElement('span');
  label.className = 'dossier-asset-name';
  label.textContent = `${name} — this file is no longer available`;

  card.append(icon, label);
  return card;
}

/** The file card: icon, name, size, and an open-in-new-tab link when we have a URL. */
function cardChildren(name, size, url, icon = '📎', action = 'Open') {
  const label = size ? `${name} · ${size}` : name;
  return [
    ['div', { class: 'dossier-asset-card' },
      ['span', { class: 'dossier-asset-icon' }, icon],
      ['span', { class: 'dossier-asset-name' }, label],
      url
        ? ['a', { href: url, target: '_blank', rel: 'noopener noreferrer',
                  class: 'dossier-asset-action' }, action]
        : ['span', { class: 'dossier-asset-action dossier-asset-missing' }, 'Unavailable'],
    ],
  ];
}
