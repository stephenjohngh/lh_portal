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
 * Render one dataset as a table.
 *
 * @param {object} dataset - a dossier_datasets row
 * @param {object[]} records - that dataset's rows (any order; sorted here)
 * @param {{ heading?: boolean }} [opts]
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

  const head = fields
    .map(f => `<th${f.width ? ` style="width:${escapeHtml(f.width)}"` : ''}>`
      + `${escapeHtml(f.label)}</th>`)
    .join('');

  const body = rows.map(record => {
    const cells = fields
      // An empty cell gets a dash, not nothing: a blank in a table reads as an
      // oversight, whereas "—" reads as deliberately not applicable.
      .map(f => `<td>${escapeHtml(record?.fields?.[f.key] || '—')}</td>`)
      .join('');
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
