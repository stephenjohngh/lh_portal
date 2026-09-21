// src/lib/apps/compliance/utils/registerExport.js
//
// The periodic activity register as a spreadsheet — whatever the filter bar is
// currently showing.
//
// ⭐ WHY A SPREADSHEET CARRIES EVERY FIELD. A Word table has to choose, because
// thirty-five columns of prose is unreadable on a page. A spreadsheet does not:
// its whole value is that the reader sorts and filters it themselves, and a
// column somebody else decided to omit is one they cannot get back. So this
// exports ALL of them, and a test asserts it stays that way — the register has
// twice acquired a field that nothing downstream ever read
// (`PROJECT_STATUS.md` §6f), and an exporter is exactly where that recurs.
//
// Pure — builds `{ headers, rows }` and nothing else. The server route only
// styles what it is given, so the sheet cannot disagree with the screen.

import { REGISTER_COLUMNS, PROVENANCE_COLUMNS, toField } from '$lib/utils/registerRowMapping.js';
import { REGISTER_STATUS_LABEL } from './registerFilter.js';

/**
 * Human headers for the register's own fields.
 *
 * ⛔ Every key in `REGISTER_COLUMNS` must appear here — a test fails otherwise,
 * so a field added to the register cannot quietly export as a blank column or
 * vanish. The wording follows the screen and the statement, not the column name.
 */
const HEADERS = {
  template_key:               'Key',
  name:                       'Compliance obligation',
  description:                'What must be done',
  group_key:                  'Group',
  basis:                      'Source',
  statutory_ref:              'Reference',
  applies_when:               'Applies when',
  trigger_event:              'Trigger event',
  trigger_type:               'Trigger type',
  trigger_source:             'What detects it',
  frequency_days:             'Planned every (days)',
  max_interval_days:          'Ceiling (days)',
  interval_basis:             'Interval basis',
  source_interval_words:      "Source's period, verbatim",
  max_is_scheduling_tolerance: 'Ceiling is OUR tolerance',
  evidenced_by:               'Evidence route',
  handled_by:                 'Tracked in',
  responsible_party:          'Performed by',
  statutory_duty_holder:      'Duty holder in law',
  competency_required:        'Competence required',
  evidence_required:          'Evidence required',
  retention_basis:            'Retention basis',
  retention_period_months:    'Retention (months)',
  suggested_scope:            'Proposed scope',
  scope_note:                 'Scoping note',
  operationally_incomplete:   'Operationally incomplete',
  completion_action:          'Completion action',
  assurance_only:             'Assurance only',
  reviewer_note:              'Reviewer note',
  handling_note:              'Handling note',
  superseded_on:              'Withdrawn on',
  superseded_by:              'Withdrawn by',
  superseded_note:            'Withdrawal note',
  citation_verified_on:       'Citation checked on',
  citation_verified_against:  'Citation checked against',
  origin:                     'Origin',
  seed_modified_at:           'Edited here on',
  citation_verified_by:       'Citation checked by',
};

/**
 * A cell value. ⚠ `null` and `undefined` become an EMPTY cell, never the text
 * "null" — a spreadsheet that says "null" looks like data. A boolean becomes
 * Yes/blank rather than TRUE/FALSE, because a column of blanks with a few Yeses
 * reads at a glance and a column of FALSEs does not.
 */
function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return scopeText(value);
  return value;
}

/** A scope object in words — the same shape the panel shows. */
function scopeText(scope) {
  const bits = [];
  if (scope?.typeCodes?.length) bits.push(`types: ${scope.typeCodes.join(', ')}`);
  for (const f of scope?.fixedAttrFilters ?? []) bits.push(`${f.name} = ${f.value}`);
  if (scope?.systemIds?.length) bits.push(`${scope.systemIds.length} system(s)`);
  if (scope?.floorIds?.length) bits.push(`${scope.floorIds.length} floor(s)`);
  if (scope?.statuses?.length) bits.push(`status: ${scope.statuses.join(', ')}`);
  return bits.join(' · ');
}

/**
 * The columns the sheet carries, in order: what state this building is in
 * first, then the register's own fields, then how the row got here.
 *
 * ⚠ Status leads because it is the reason most people open this — the register
 * says what is required, and only the status says whether it is being done.
 */
export const EXPORT_COLUMNS = [
  { key: 'status', header: 'Status here' },
  ...REGISTER_COLUMNS.map(c => ({ key: c, header: HEADERS[c] ?? c })),
  ...PROVENANCE_COLUMNS.map(c => ({ key: c, header: HEADERS[c] ?? c })),
];

/**
 * Build the sheet from the rows the screen is showing.
 *
 * @param {{entry: Object, status: string}[]} rows  straight from `filterRegister`
 * @param {(key: string) => {origin?: string, seedModifiedAt?: string|null, citationVerifiedBy?: string|null}} [provenanceOf]
 * @returns {{headers: string[], rows: (string|number)[][]}}
 */
export function buildRegisterSheet(rows, provenanceOf = () => ({})) {
  const headers = EXPORT_COLUMNS.map(c => c.header);
  const out = (rows ?? []).map(({ entry, status }) => {
    const prov = provenanceOf(entry.key) ?? {};
    return EXPORT_COLUMNS.map(({ key }) => {
      if (key === 'status') return REGISTER_STATUS_LABEL[status] ?? status;
      if (key === 'origin') return cell(prov.origin ?? 'seed');
      if (key === 'seed_modified_at') return cell(prov.seedModifiedAt);
      if (key === 'citation_verified_by') return cell(prov.citationVerifiedBy);
      return cell(entry[toField(key)]);
    });
  });
  return { headers, rows: out };
}

/**
 * Fill colours for the Status column, keyed by the label the sheet prints.
 *
 * ⛔ The two gap states are coloured the SAME. "Added — needs scope" is not a
 * softer kind of covered — it is a work queue, and the compliance report makes
 * the same choice with `assured` vs `ok`. A spreadsheet that shaded it amber
 * between red and green would reintroduce on a page the distinction the status
 * function exists to prevent.
 */
export const STATUS_FILL = {
  [REGISTER_STATUS_LABEL.not_covered]:    'FFB91C1C',
  [REGISTER_STATUS_LABEL.awaiting_setup]: 'FFB91C1C',
  [REGISTER_STATUS_LABEL.no_home]:        'FFB45309',
  [REGISTER_STATUS_LABEL.elsewhere]:      'FF1D4ED8',
  [REGISTER_STATUS_LABEL.scheduled]:      'FF15803D',
  [REGISTER_STATUS_LABEL.not_applicable]: 'FF6B7280',
  [REGISTER_STATUS_LABEL.superseded]:     'FF6B7280',
};
