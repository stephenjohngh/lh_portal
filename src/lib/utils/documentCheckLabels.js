// src/lib/utils/documentCheckLabels.js
// What Admin → Document Demo → Check files found, in words (2026-09-27).
// The checking is the server's ($lib/server/documentCheck.js); this only says
// what each answer means, so the list and the summary cannot disagree.
//
// ⛔ "Could not tell" is never "fine". A row whose file could not be checked is
// flagged, not left unmarked — an unmarked row after a check reads as a clean
// bill of health, which is the one thing it has not had.

/** @typedef {{ owner?: string, file?: string, fileDetail?: string }} CheckResult */
/** @typedef {{ kind: 'owner'|'file', label: string, tone: 'red'|'amber', detail?: string }} CheckProblem */

/** @type {Record<string, { label: string, tone: 'red'|'amber' }>} */
export const FILE_PROBLEM = {
  missing:        { label: 'File missing from storage',         tone: 'red' },
  in_bin:         { label: 'File is in the Drive bin',          tone: 'amber' },
  outside_folder: { label: 'File is outside the portal’s folder', tone: 'amber' },
  unchecked:      { label: 'File not checked',                  tone: 'amber' },
  error:          { label: 'Could not check the file',          tone: 'amber' },
};

/** @type {Record<string, { label: string, tone: 'red'|'amber' }>} */
export const OWNER_PROBLEM = {
  missing: { label: 'The record it was attached to is deleted', tone: 'red' },
  unknown: { label: 'Attached to something the portal does not recognise', tone: 'amber' },
};

/**
 * What is wrong with one document; [] when both its record and its file were
 * found (or it is a loose upload, attached to nothing by design).
 * @param {CheckResult|null|undefined} result
 * @returns {CheckProblem[]}
 */
export function checkProblems(result) {
  if (!result) return [];
  /** @type {CheckProblem[]} */
  const out = [];
  const owner = result.owner ? OWNER_PROBLEM[result.owner] : null;
  if (owner) out.push({ kind: 'owner', ...owner });
  const file = result.file ? FILE_PROBLEM[result.file] : null;
  if (file) out.push({ kind: 'file', ...file, ...(result.fileDetail ? { detail: result.fileDetail } : {}) });
  // An answer this file does not know is not a pass.
  if (result.owner && !owner && result.owner !== 'present' && result.owner !== 'loose') {
    out.push({ kind: 'owner', label: `Record state not recognised (${result.owner})`, tone: 'amber' });
  }
  if (result.file && !file && result.file !== 'present') {
    out.push({ kind: 'file', label: `File state not recognised (${result.file})`, tone: 'amber' });
  }
  return out;
}

/**
 * Counts over the documents SHOWN — a row loaded after the check (a new filter,
 * an upload) is "not checked", never counted as fine.
 * @param {Array<{ id: string }>} docs
 * @param {Record<string, CheckResult>|null|undefined} results
 */
export function checkSummary(docs, results) {
  let checked = 0, fine = 0, withProblems = 0, notChecked = 0;
  /** @type {Map<string, { label: string, tone: string, count: number }>} */
  const byLabel = new Map();
  for (const d of docs ?? []) {
    const r = results?.[d.id];
    if (!r) { notChecked++; continue; }
    checked++;
    const problems = checkProblems(r);
    if (!problems.length) { fine++; continue; }
    withProblems++;
    for (const p of problems) {
      const cur = byLabel.get(p.label) ?? { label: p.label, tone: p.tone, count: 0 };
      cur.count++;
      byLabel.set(p.label, cur);
    }
  }
  return { checked, fine, withProblems, notChecked, byLabel: [...byLabel.values()] };
}
