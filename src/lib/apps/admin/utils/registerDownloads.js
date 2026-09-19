// src/lib/apps/admin/utils/registerDownloads.js
//
// Downloads the register — as filtered — as a spreadsheet or a Word extract.
//
// ⛔ The rows are the ones the SCREEN is showing, passed straight through. The
// route styles what it is given and re-derives nothing, which is the rule the
// compliance Word report already follows: a document that recomputed its own
// rows could disagree with the list the person was looking at when they asked
// for it, and they would have no way of telling which was right.

import { authHeaders } from '$lib/utils/authHeaders';
import { downloadResponse } from '$lib/utils/download.js';
import { describeFilters } from '$lib/components/common/filterSummary.js';
import { buildRegisterSheet, STATUS_FILL } from './registerExport.js';
import { REGISTER_STATUS_LABEL } from './registerFilter.js';
import { fmtGenerated } from '$lib/utils/dates.js';

/**
 * @param {Object} params
 * @param {{entry: Object, status: string}[]} params.rows      what is on screen
 * @param {number} params.total                                the whole register
 * @param {Object[]} params.fields                             the facet definitions
 * @param {Record<string, Set<string>>} params.values          the active facets
 * @param {string} [params.query]                              the search box
 * @param {(key: string) => Object} [params.provenanceOf]
 * @param {string} [params.building]
 * @returns {Promise<{filename: string}>}
 */
export async function downloadRegisterXlsx(params) {
  const {
    rows, total, fields, values, query = '',
    provenanceOf = () => ({}), building = 'Lancaster House',
  } = params;

  const detail = buildRegisterSheet(rows, provenanceOf);

  // ⚠ The filter description and the count go INTO the workbook, not just the
  // filename. A spreadsheet of 14 rows is indistinguishable from a register of
  // 14 requirements once it is off the screen and in somebody's inbox.
  const filterSummary = `${describeFilters(fields, values, query)} — ${rows.length} of ${total}`;

  const res = await fetch('/api/generate-xlsx', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      building,
      filterSummary,
      generatedAt: fmtGenerated(),
      detail,
      sheetName: 'Register',
      reportTitle: 'Periodic activity register',
      filenameStem: 'Periodic_Register',
      statusFill: STATUS_FILL,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }

  const filename = `periodic-register-${new Date().toISOString().slice(0, 10)}.xlsx`;
  await downloadResponse(res, filename);
  return { filename };
}

/**
 * The same selection as a Word document — a curated seven columns rather than
 * every field, because thirty-five columns of prose is unreadable on a page.
 *
 * ⛔ The two exports answer different questions and the guide says so: the
 * spreadsheet is for working the list, this is for showing somebody. It is an
 * EXTRACT and says so on its first page — see `registerDocx.js`.
 *
 * @param {Object} params  same shape as `downloadRegisterXlsx`
 * @returns {Promise<{filename: string}>}
 */
export async function downloadRegisterDocx(params) {
  const { rows, total, fields, values, query = '', building = 'Lancaster House' } = params;

  const res = await fetch('/api/reports/generate-register-extract', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      building,
      total,
      generatedAt: fmtGenerated(),
      filterSummary: describeFilters(fields, values, query),
      // Only what the document prints — the status LABEL, not the code, so the
      // page and the screen use one vocabulary.
      rows: rows.map(({ entry, status }) => ({
        entry,
        statusLabel: REGISTER_STATUS_LABEL[status] ?? status,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }

  const filename = `register-extract-${new Date().toISOString().slice(0, 10)}.docx`;
  await downloadResponse(res, filename);
  return { filename };
}
