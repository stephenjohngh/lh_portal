// src/lib/apps/admin/utils/registerDownloads.js
//
// Ways of getting the register out of the screen. TWO, and both pass the rows
// the SCREEN is showing straight through.
//
// ⭐ THERE USED TO BE FOUR, AND THE STATEMENT WAS ONE OF THEM. It is not any
// more, because it is not a different document: with no filter applied and every
// section included, the Word file IS this building's obligations statement. The
// user asked for exactly that, and it is better than two overlapping documents
// plus a red warning telling people not to mix them up — that warning existed
// ONLY because there were two.
//
// ⛔ NOTHING HERE SAYS WHICH DOCUMENT TO MAKE. The builder decides from what it
// was handed, so a caller cannot produce a file whose title contradicts its
// contents. The server names the file by the same rule.
//
// ⚠ The route styles what it is given and re-derives nothing, which is the rule
// the compliance Word report already follows: a document that recomputed its own
// rows could disagree with the list the person was looking at when they asked
// for it, and they would have no way of telling which was right.
//
// ⛔ THE FOURTH WAS `downloadStatementSection6`, AND IT IS DELETED. It produced
// the register section as markdown to paste into a hand-maintained copy of the
// statement — so it existed only because a hand-maintained copy existed.
// ⚠ Its button read "⬇ Statement §6", and the user's objection was exactly
// right: *"§6 doesn't mean anything to a user."* Nobody on this screen is
// holding the document, so its internal section numbering is vocabulary from
// somewhere they cannot see. The same fault as the import buttons — machinery
// shown to someone who never sees the machinery.

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

export async function downloadRegisterDocx(params) {
  const {
    rows, total, fields, values, query = '', building = 'Lancaster House',
    sections = {}, items = {},
  } = params;

  const res = await fetch('/api/reports/generate-register-extract', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      building,
      total,
      generatedAt: fmtGenerated(),
      filterSummary: describeFilters(fields, values, query),
      // ⭐ The sections and their rows go with it, and NOTHING here says which
      // document to make. Unfiltered plus every section IS the obligations
      // statement; the builder works that out from what it was handed, so a
      // caller cannot ask for a title that contradicts the contents.
      sections,
      items,
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

  // ⚠ The SERVER names the file, from the same rule that titles it. A download
  // called "extract" holding the full statement is the confusion one document
  // was meant to end, and a filename outlives the covering email.
  const fallback = `register-${new Date().toISOString().slice(0, 10)}.docx`;
  await downloadResponse(res, fallback);
  return { filename: fallback };
}
