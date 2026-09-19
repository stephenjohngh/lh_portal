// src/lib/utils/dutyHolderRole.js
//
// Who bears a register entry's duty IN LAW, as a short role derived from the
// sentence the register stores.
//
// ⚠ DELIBERATELY IMPORTS NOTHING, and that is the whole reason it is its own
// file. It began in `registerFilter.js`, which imports `$lib/...` — unreachable
// from a plain `node scripts/…` run, and `check:obligations` is such a run.
// Copying the classifier into the script would be a second copy of a rule, and
// the two would eventually disagree about what a role is: the app's facet would
// say one thing and the document's prose another, about the same register.
// Same reasoning as `statementProseParse.js` and `triggerTypeOf`.
//
// ⛔ WHY THIS FIELD IS THE HARDEST-WON ONE IN THE REGISTER. Round 12 added it
// because *"Responsible: Site staff"* stood on eight rows whose statutory duty
// is the Responsible Person's — the register asserting that a statutory duty
// had been transferred to a cleaner. Who bears a duty in law follows from the
// INSTRUMENT, so a catalogue can hold it; who performs the work is a fact about
// this building's arrangements and cannot be derived.

export const DUTY_HOLDER_ROLES = [
  'responsible_person', 'principal_accountable_person', 'accountable_person',
  'shared_ap_rp', 'employer_or_controller', 'asbestos_duty_holder',
  'none_own_control', 'none_contract', 'none_code',
];

/**
 * Derive the short role from the stored sentence. Ordered: the more specific
 * tests come first, because "Principal accountable person" contains
 * "accountable person" and "Shared:" mentions both roles.
 *
 * @param {Object} entry
 * @returns {string} a DUTY_HOLDER_ROLES value, or 'other' if nothing matches
 */
export function dutyHolderRole(entry) {
  const t = String(entry?.statutoryDutyHolder ?? '').toLowerCase();
  if (!t)                                 return 'none_own_control';
  if (t.startsWith('shared'))             return 'shared_ap_rp';
  if (t.startsWith('none'))               return t.includes('agreement') ? 'none_contract'
                                               : t.includes('code')      ? 'none_code'
                                               : 'none_own_control';
  if (t.startsWith('principal accountable person')) return 'principal_accountable_person';
  if (t.startsWith('accountable person'))  return 'accountable_person';
  if (t.startsWith('responsible person'))  return 'responsible_person';
  if (t.includes('control of asbestos'))   return 'asbestos_duty_holder';
  if (t.includes('employer'))              return 'employer_or_controller';
  return 'other';
}

/**
 * ⛔ Guard for the derivation above. Returns the entries it could not classify;
 * empty means the facet still covers the whole register.
 *
 * ⚠ This is the failure mode of every infer-a-category-from-prose scheme, and
 * this project has already been bitten by one — the `ventilation_stack`
 * withdrawal, where a component's KIND was inferred from a label describing
 * what it SERVES. Rewording a duty holder must not silently drop a row out of
 * its facet, or out of a count the statement quotes.
 *
 * @param {Object[]} entries
 * @returns {Object[]}
 */
export function unclassifiedDutyHolders(entries) {
  return entries.filter(e => dutyHolderRole(e) === 'other');
}

/**
 * How many entries fall to each role.
 * @param {Object[]} entries
 * @returns {Record<string, number>}
 */
export function dutyHolderTally(entries) {
  /** @type {Record<string, number>} */
  const tally = Object.fromEntries(DUTY_HOLDER_ROLES.map(r => [r, 0]));
  for (const e of entries) {
    const role = dutyHolderRole(e);
    tally[role] = (tally[role] ?? 0) + 1;
  }
  return tally;
}
