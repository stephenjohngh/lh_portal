// src/lib/apps/golden_thread/utils/gtAuditHistory.js
//
// A document's audit history: changes to the document row, AND the citations
// made to or from it. A citation is chained like everything else (a `gt_links`
// row in `gt_audit`), but it is a change to a different table, so the document's
// own history left it out — an admin reading "4 entries" could not see that the
// document had been linked to a mandatory occurrence report. Pure, no I/O.

/** The link row's data, whichever side of the change it is on. */
const dataOf = (row) => row?.after_data ?? row?.before_data ?? null;

/** Does this audit row record a citation to or from the document? */
export function isLinkOf(row, documentId) {
  if (row?.target_table !== 'gt_links') return false;
  const d = dataOf(row);
  if (!d) return false;
  return (d.source_type === 'gt_document' && d.source_id === documentId)
      || (d.target_type === 'gt_document' && d.target_id === documentId);
}

/**
 * Document rows and link rows as one list, in chain order.
 * @param {Array<any>} documentRows  audit rows for the document itself
 * @param {Array<any>} linkRows      audit rows for gt_links (any document's)
 * @param {string} documentId
 */
export function mergeDocumentAudit(documentRows, linkRows, documentId) {
  return [...(documentRows ?? []), ...(linkRows ?? []).filter((r) => isLinkOf(r, documentId))]
    .sort((a, b) => a.seq - b.seq);
}

/**
 * One line for a citation row: "Citation added — cites mor_case" or, seen from
 * the cited document, "Cited by gt_document (cites)".
 * @returns {string|null} null for a row that is not a citation of this document
 */
export function describeLinkAudit(row, documentId) {
  if (!isLinkOf(row, documentId)) return null;
  const d = dataOf(row);
  const outgoing = d.source_type === 'gt_document' && d.source_id === documentId;
  const verb = row.action === 'delete' ? 'removed' : 'added';
  return outgoing
    ? `Citation ${verb} — ${d.relation} ${d.target_type}`
    : `Citation ${verb} — cited by ${d.source_type} (${d.relation})`;
}
