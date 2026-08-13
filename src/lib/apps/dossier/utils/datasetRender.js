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

import {
  columnFields, rowFields, sortRecords, templateFor,
} from './datasetTemplates.js';

/**
 * How much of a long field shows in its cell before the rest is folded away.
 *
 * A pasted email body is the case that forced this: the whole message goes into
 * Summary (deliberately — it is the author's evidence and truncating it would
 * lose text they can no longer see), and a single row then ran to forty lines,
 * pushing every other entry off the screen. The body has to be READABLE without
 * being the only thing visible.
 */
export const LONGTEXT_PREVIEW_CHARS = 140;

/** Does this value need folding, or does it fit in a cell as it is? */
export function needsFolding(value) {
  const text = String(value ?? '');
  // Multi-line counts even when short: a pasted email with three one-word
  // paragraphs still reads as a body, not as a cell value.
  return text.length > LONGTEXT_PREVIEW_CHARS || text.includes('\n');
}

/** The one-line gist that stays in the cell. */
export function previewOf(value) {
  const flat = String(value ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > LONGTEXT_PREVIEW_CHARS
    ? `${flat.slice(0, LONGTEXT_PREVIEW_CHARS).trimEnd()}…`
    : flat;
}

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

  // Columns and beneath-the-row fields are different things: a body is never a
  // column, and a column folds only when it is too long to sit in one.
  const fields = columnFields(dataset.key);
  const beneath = rowFields(dataset.key);
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
    // No width: the table lays out automatically now, so a hard width here
    // would take space from the prose columns that need it.
    + (showLinks ? '<th>Detail</th>' : '');

  const columnCount = fields.length + (showLinks ? 1 : 0);

  const body = rows.map((record, i) => {
    // Long or multi-line COLUMN values show a gist in the cell and their full
    // text below, so one long note cannot push every other entry off screen.
    const folded = fields.filter(f =>
      f.type === 'longtext' && needsFolding(record?.fields?.[f.key]));
    // Beneath-the-row fields always go below, when they have anything in them.
    const below = beneath.filter(f => String(record?.fields?.[f.key] ?? '').trim());

    const cells = fields
      .map((f) => {
        const value = record?.fields?.[f.key] ?? '';
        // An empty cell gets a dash, not nothing: a blank in a table reads as
        // an oversight, whereas "—" reads as deliberately not applicable.
        if (!value) return '<td>—</td>';
        return folded.includes(f)
          ? `<td>${escapeHtml(previewOf(value))}</td>`
          : `<td>${escapeHtml(value)}</td>`;
      })
      .join('')
      + (showLinks ? `<td>${linked[i] || '—'}</td>` : '');

    const row = `<tr>${cells}</tr>`;
    if (!folded.length && !below.length) return row;

    // <details> rather than a scripted toggle: native, keyboard-accessible,
    // works in a published pack with no JS of its own, and the print stylesheet
    // can force it open — a body hidden on paper would be dropped evidence.
    const fold = (f, label) =>
      '<details class="dossier-dataset-body">'
      + `<summary>${escapeHtml(label)}</summary>`
      + `<div class="dossier-dataset-body-text">${escapeHtml(record.fields[f.key])}</div>`
      + '</details>';

    const bodies = [
      ...below.map(f => fold(f, f.label)),
      ...folded.map(f => fold(f, `${f.label} — full text`)),
    ].join('');

    return row
      + `<tr class="dossier-dataset-bodyrow"><td colspan="${columnCount}">${bodies}</td></tr>`;
  }).join('');

  // The table scrolls inside its own element, NOT inside the outer box. A block
  // in a scroll container is only as wide as the container's visible area, so
  // with the heading inside it the title bar's background stopped short the
  // moment the table was scrolled sideways. Keeping the heading out of the
  // scrolling region also means it stays put while the columns move, which is
  // what a caption should do.
  return `<div class="dossier-dataset">${heading}`
    + '<div class="dossier-dataset-scroll">'
    + `<table class="dossier-dataset-table"><thead><tr>${head}</tr></thead>`
    + `<tbody>${body}</tbody></table></div></div>`;
}

/** What to show when an embedded table has been deleted. */
export function renderMissingDatasetHtml(title) {
  return '<div class="dossier-dataset dossier-dataset-gone">'
    + `<div class="dossier-dataset-title">${escapeHtml(title || 'Table')}</div>`
    + '<div class="dossier-dataset-note">This table no longer exists.</div></div>';
}
