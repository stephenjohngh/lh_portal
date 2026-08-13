// src/lib/apps/dossier/utils/embedDatasetNode.js
// Showing a table — usually the chronology — inside a page.
//
// Unlike embedDoc, this one renders the REAL thing in the editor rather than a
// stand-in. A page embed has to stay a stub because resolving it can recurse
// and needs the cycle guard; a table cannot contain another embed, so there is
// nothing to guard against and no reason to make the author open Preview to see
// what they have inserted.
//
// Both modes go through renderDatasetTableHtml(), so the author and the
// recipient see the same table (merge doc D10).

import { Node, mergeAttributes } from '@tiptap/core';
import {
  renderDatasetTableHtml, renderMissingDatasetHtml, escapeHtml,
} from './datasetRender.js';

export const EmbedDataset = Node.create({
  name: 'embedDataset',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return {
      /**
       * A Svelte-store-shaped `{ subscribe }` yielding
       * `{ datasets, records, docs, files }`, or null. Injected rather than
       * imported, so this module stays free of app state — the P3 reader uses
       * read mode and supplies nothing.
       *
       * `docs` and `files` are what let a row's reference render here. Without
       * them the editor showed a bare table while the reader showed a Detail
       * column, which is precisely the author/recipient divergence D10 exists
       * to prevent.
       */
      dataProvider: null,
      /**
       * Called with a doc id when the author clicks a row's page reference.
       * Editing affordance only; the reader has its own navigation.
       */
      onOpenDoc: null,
    };
  },

  addAttributes() {
    return {
      dataset_id: {
        default: null,
        parseHTML:  el => el.getAttribute('data-embed-dataset'),
        renderHTML: attrs => (attrs.dataset_id ? { 'data-embed-dataset': attrs.dataset_id } : {}),
      },
      // Remembered so a deleted table can still be named in the gap it leaves.
      dataset_title: {
        default: null,
        parseHTML:  el => el.getAttribute('data-embed-dataset-title'),
        renderHTML: attrs => (attrs.dataset_title
          ? { 'data-embed-dataset-title': attrs.dataset_title } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-embed-dataset]' }];
  },

  renderHTML({ HTMLAttributes }) {
    // A placeholder; blockRender.resolveDatasetEmbeds() fills it, because a
    // declarative renderHTML cannot reach the pack's tables.
    return ['div', mergeAttributes(HTMLAttributes, { class: 'dossier-dataset-embed' })];
  },

  addNodeView() {
    const { dataProvider, onOpenDoc } = this.options;

    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'dossier-dataset-embed dossier-dataset-embed-host';
      dom.contentEditable = 'false';

      const body = document.createElement('div');
      dom.appendChild(body);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'dossier-block-remove';
      remove.title = 'Remove this table from the page';
      remove.setAttribute('aria-label', 'Remove this table from the page');
      remove.textContent = '×';
      remove.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (typeof getPos !== 'function') return;
        const pos = getPos();
        if (pos == null) return;
        editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
      });
      dom.appendChild(remove);

      let current = node;
      let latest  = null;
      /** The markup currently in `body`, so an identical repaint is skipped. */
      let painted = null;

      /**
       * Replace the table's markup — but ONLY when it has actually changed.
       *
       * The provider fires on every store update, and the editor's props are
       * objects, which Svelte's safe_not_equal reports as changed on every
       * parent render. So this ran constantly, and each run replaced the DOM
       * wholesale: a reader who opened a folded email body watched it close
       * again about a second later, when the next autosave happened to tick.
       *
       * Skipping an identical repaint fixes that outright. When the markup HAS
       * changed — a row edited, an entry added — the open/closed state of each
       * folded body is carried across, because losing the one you were reading
       * is exactly as annoying as it sounds.
       */
      const render = (html) => {
        if (html === painted) return;

        const open = [...body.querySelectorAll('details')].map(d => d.open);
        body.innerHTML = html;
        painted = html;
        body.querySelectorAll('details').forEach((d, i) => { d.open = open[i] ?? false; });
      };

      const paint = (data) => {
        if (data !== undefined) latest = data;
        const datasets = latest?.datasets ?? [];
        const records  = latest?.records ?? [];
        const dataset  = datasets.find(d => d.id === current.attrs.dataset_id);

        if (!dataset) {
          // With nothing loaded we cannot tell "deleted" from "not loaded yet",
          // so name the table rather than accuse it of being gone.
          render(datasets.length
            ? renderMissingDatasetHtml(current.attrs.dataset_title)
            : `<div class="dossier-dataset"><div class="dossier-dataset-title">`
              + `${escapeHtml(current.attrs.dataset_title || 'Table')}</div>`
              + '<div class="dossier-dataset-empty">Loading…</div></div>');
          return;
        }
        render(renderDatasetTableHtml(
          dataset, records.filter(r => r.dataset_id === dataset.id),
          // No assetBase in the editor: a file reference renders as a label
          // rather than a link, because the author already has the shelf.
          { links: { docs: latest?.docs ?? [], files: latest?.files ?? [] } }));
      };

      // A page reference is navigation, not a URL. The table is innerHTML, so
      // the click is caught by delegation — and on mousedown, because
      // ProseMirror selects the atom on mousedown and would otherwise swallow
      // it.
      body.addEventListener('mousedown', (event) => {
        const anchor = event.target instanceof Element
          ? event.target.closest('a[data-doc-id]') : null;
        if (!anchor) return;
        event.preventDefault();
        event.stopPropagation();
        onOpenDoc?.(anchor.getAttribute('data-doc-id'));
      });

      // Subscribing keeps the embedded table live: adding a chronology entry
      // shows up on the page that embeds it without a reload.
      const unsubscribe = dataProvider?.subscribe
        ? dataProvider.subscribe(paint)
        : (paint(null), null);

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'embedDataset') return false;
          current = updated;
          paint(undefined);          // same data, different table
          return true;
        },
        destroy() { unsubscribe?.(); },
        ignoreMutation: () => true,
      };
    };
  },

  addCommands() {
    // Cast: Tiptap types commands against its own RawCommands.
    return /** @type {any} */ ({
      insertDatasetEmbed: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    });
  },
});
