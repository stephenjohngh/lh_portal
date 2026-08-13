// src/lib/apps/dossier/utils/datasetRender.js
// Rendering a dataset as a read-only table — pure, Type-1 testable, no DOM.
//
// ONE definition, used by both the editor's node view and the read-only
// renderer, so an embedded chronology looks the same to the author and to the
// recipient (merge doc D10). Returns an HTML string rather than building DOM,
// so it can be tested in the node environment and called from a P3 snapshot.
//
// Everything interpolated is escaped here: the values are author-typed text
// and one of them will eventually contain an angle bracket.

import { fieldsFor, sortRecords, templateFor } from './datasetTemplates.js';

/** Escape for HTML text and quoted attribute contexts. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * What a row's reference points at, as a link.
 *
 * Rows can carry `doc_id` (a page in the same pack) or `document_id` (a file on
 * its shelf). The EDITOR shows these through its own control; the read-only
 * renderer has to draw them itself, or a published pack silently drops them —
 * the author points entries at the detail and the recipient sees a table of
 * text with nothing to follow.
 *
 * A page becomes an in-pack anchor the reader intercepts; a file becomes a real
 * href under the caller's asset base. With no `links` option nothing is drawn
 * at all, which is what the editor wants.
 *
 * @param {object} record
 * @param {{ docs?: object[], files?: object[], assetBase?: string }} links
 * @returns {string} a table cell's inner HTML, or ''
 */
function renderRecordLink(record, links) {
  if (record?.doc_id) {
    const doc = (links.docs ?? []).find(d => d.id === record.doc_id);
    // A deleted page leaves the entry standing (doc_id is ON DELETE SET NULL),
    // so an id with no page is a genuine possibility, not a bug.
    if (doc) {
      return `<a class="dossier-record-link" href="#" data-doc-id="${escapeHtml(doc.id)}">`
        + `${escapeHtml(doc.title || 'Page')}</a>`;
    }
  }

  if (record?.document_id) {
    const file = (links.files ?? []).find(f => f.id === record.document_id);
    const name = file
      ? (file.display_name || file.filename || 'File')
      : 'File';
    if (links.assetBase) {
      return `<a class="dossier-record-link" target="_blank" rel="noopener noreferrer" `
        + `href="${escapeHtml(links.assetBase)}${encodeURIComponent(record.document_id)}">`
        + `${escapeHtml(name)}</a>`;
    }
    // No asset base (a print rendering, say) — name it without pretending it
    // can be opened.
    return `<span class="dossier-record-link-plain">${escapeHtml(name)}</span>`;
  }

  return '';
}

/**
 * Render one dataset as a table.
 *
 * @param {object} dataset - a dossier_datasets row
 * @param {object[]} records - that dataset's rows (any order; sorted here)
 * @param {{ heading?: boolean,
 *           links?: { docs?: object[], files?: object[], assetBase?: string } }} [opts]
 * @returns {string} HTML
 */
export function renderDatasetTableHtml(dataset, records = [], opts = {}) {
  const template = templateFor(dataset?.key);
  if (!template) return '';

  const fields = fieldsFor(dataset.key);
  const rows = sortRecords(dataset.key, records);

  const heading = opts.heading === false
    ? ''
    : `<div class="dossier-dataset-title">${escapeHtml(dataset.title)}</div>`;

  if (!rows.length) {
    return `<div class="dossier-dataset">${heading}`
      + '<div class="dossier-dataset-empty">This table has no entries yet.</div></div>';
  }

  // The reference column only appears when references were supplied AND some
  // row actually has one — an empty "Detail" column on every table would be
  // clutter on the many packs that never use the feature.
  const links = opts.links ?? null;
  const linked = links
    ? rows.map(r => renderRecordLink(r, links))
    : [];
  const showLinks = linked.some(Boolean);

  const head = fields
    .map(f => `<th${f.width ? ` style="width:${escapeHtml(f.width)}"` : ''}>`
      + `${escapeHtml(f.label)}</th>`)
    .join('')
    + (showLinks ? '<th style="width:10rem">Detail</th>' : '');

  const body = rows.map((record, i) => {
    const cells = fields
      // An empty cell gets a dash, not nothing: a blank in a table reads as an
      // oversight, whereas "—" reads as deliberately not applicable.
      .map(f => `<td>${escapeHtml(record?.fields?.[f.key] || '—')}</td>`)
      .join('')
      + (showLinks ? `<td>${linked[i] || '—'}</td>` : '');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<div class="dossier-dataset">${heading}`
    + `<table class="dossier-dataset-table"><thead><tr>${head}</tr></thead>`
    + `<tbody>${body}</tbody></table></div>`;
}

/** What to show when an embedded table has been deleted. */
export function renderMissingDatasetHtml(title) {
  return '<div class="dossier-dataset dossier-dataset-gone">'
    + `<div class="dossier-dataset-title">${escapeHtml(title || 'Table')}</div>`
    + '<div class="dossier-dataset-note">This table no longer exists.</div></div>';
}
