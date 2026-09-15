// src/lib/utils/statutoryTemplate.js
//
// M4 · the statutory PPM template — logic over the periodic activity register
// in statutoryRegisterData.js. Pure, no I/O — Type-1 testable.
// (docs/requirements/registers/Maintenance_Review.md §M4.)
//
// ── What this answers ──────────────────────────────────────────────────────
// For every recurring check identified for a higher-risk residential building:
//   · WHERE DOES IT COME FROM — legislation, a standard, a contract, or our own
//     decision (`basis`), and whether the INTERVAL comes from that source or is
//     established practice (`intervalBasis`);
//   · HOW IS IT DEALT WITH HERE — which sub-app (`handledBy`), and whether the
//     obligation library can schedule it at all (`evidencedBy`);
//   · IS IT ACTUALLY COVERED — decided only by an obligation carrying this
//     entry's `template_key`, never by matching names.
//
// The register is deliberately WIDER than the obligation library. Several
// entries are owned by another app's own cycle (Golden Thread review dates, the
// MOR clocks) and some have no home in the portal at all. Saying so plainly is
// the point: a register that quietly omitted them would look complete while the
// building was missing statutory duties.

import { REGISTER } from './statutoryRegisterData.js';

/** @typedef {typeof REGISTER[number]} TemplateEntry */

export const STATUTORY_TEMPLATE = REGISTER;
export const TEMPLATE_KEYS = REGISTER.map(e => e.key);

const BY_KEY = new Map(REGISTER.map(e => [e.key, e]));

/** @param {string} key */
export function templateEntry(key) {
  return BY_KEY.get(key) ?? null;
}

// ── Where a requirement comes from ─────────────────────────────────────────
// Four kinds, ordered by how little discretion there is about doing it. The
// distinction is load-bearing: a British Standard is not an Act, an insurer's
// condition is binding without being law, and something we chose ourselves is
// still worth doing but is ours to change. Collapsing any of these would have
// the tool telling users something false about their own obligations.

export const BASIS = ['statute', 'standard', 'contract', 'management'];

export const BASIS_LABEL = {
  statute:    'Legislation',
  standard:   'Standard / code',
  contract:   'Contract or scheme',
  management: 'Management decision',
};

export const BASIS_DESCRIPTION = {
  statute:    'An Act or statutory instrument imposes this duty. Not doing it is unlawful.',
  standard:   'A British Standard or approved code sets the method and the interval. It is the accepted standard of care — departing from it needs a documented reason.',
  contract:   'An insurer, certification scheme, manufacturer or maintenance contract requires it. Binding, but by agreement rather than by law.',
  management: 'We chose to do this. Nothing external requires it — it is the operational discipline that makes the safety case defensible, and it is ours to change.',
};

/** Least discretion first — the display order and the sort key. */
export const BASIS_RANK = { statute: 0, standard: 1, contract: 2, management: 3 };

// ── The groups the register is organised into ──────────────────────────────
export const GROUPS = ['fire_safety', 'other_statutory', 'bsa_cycle', 'building_specific', 'governance'];

export const GROUP_LABEL = {
  fire_safety:     'Statutory fire safety',
  other_statutory: 'Other statutory checks',
  bsa_cycle:       'Building Safety Act cycles',
  // Renamed 2026-09-14: 'This building's own cycles' invited exactly the
  // mistake the register data header forbids — writing the current position
  // into a general catalogue. These rows switch ON when a condition holds and
  // OFF when it stops, by recorded decision.
  building_specific: 'Conditional and interim measures',
  governance:      'Governance and review',
};

// ── How it is dealt with in this system ────────────────────────────────────
export const HANDLED_BY_LABEL = {
  inspection:      'Inspection',
  maintenance:     'Maintenance',
  golden_thread:   'Golden Thread',
  mor:             'MOR',
  complaints:      'Complaints',
  management:      'Management',
  building_assets: 'Building Assets',
  planner:         'Planner',
  info:            'Info',
  admin:           'Admin',
  none:            'Nothing yet',
};

/**
 * Can the obligation library schedule this entry? False where another app owns
 * its own cycle — creating an obligation would put a second, competing due date
 * on something already tracked properly elsewhere.
 * @param {TemplateEntry|null} entry
 */
export function isSchedulable(entry) {
  return Boolean(entry?.evidencedBy);
}

/** Recurs on a clock, rather than firing on an event. */
export function isRecurring(entry) {
  return Number.isFinite(entry?.frequencyDays) && entry.frequencyDays > 0;
}

/** Nothing in the portal deals with this today. */
export function isUnhomed(entry) {
  return (entry?.handledBy ?? 'none') === 'none';
}

/**
 * Has this requirement been withdrawn — repealed, superseded, or the standard
 * withdrawn — as at a given date?
 *
 * Date-aware on purpose. A report of last year's position must still treat a
 * requirement repealed this March as having been LIVE last year, or it would
 * retrospectively excuse work that was genuinely missed at the time.
 *
 * @param {TemplateEntry|null} entry
 * @param {string} [asOf] YYYY-MM-DD; defaults to today
 */
export function isSuperseded(entry, asOf) {
  const on = entry?.supersededOn;
  if (!on) return false;
  return on <= (asOf ?? new Date().toISOString().slice(0, 10));
}

/** One line describing the withdrawal, for the row that still shows it. */
export function supersededNote(entry) {
  if (!entry?.supersededOn) return '';
  const successor = entry.supersededBy ? templateEntry(entry.supersededBy) : null;
  return [
    `No longer required from ${entry.supersededOn}`,
    entry.supersededNote || null,
    successor ? `Replaced by: ${successor.name}` : null,
  ].filter(Boolean).join(' · ');
}

/**
 * What actually makes this obligation fall due.
 *
 * Added 2026-09-13 on an external reviewer's point: `intervalBasis` says where
 * a frequency came FROM, but nothing said what *starts* the obligation, and
 * there are four different mechanisms hiding behind one "Interval" column:
 *
 *   calendar  — a clock. Weekly, monthly, five-yearly.
 *   event     — something happens. Works begin, the walls change, a report is
 *               revised, an occurrence is identified.
 *   risk      — a judgement. Condition, deterioration, or a previous finding
 *               says look again, and how often is ours to justify.
 *   direction — someone external tells us to, and until they do there is
 *               nothing to schedule. The regulator directing a BAC application
 *               is the clear case, and it is NOT a five-year clock.
 *
 * **Why this is derived rather than a field on all eighty entries:** the answer
 * is already implicit in `trigger` and `frequencyDays`, and a hand-tagged
 * duplicate of a fact we already hold is a fact that can disagree with itself.
 * An entry may still set `triggerType` explicitly where the derivation would be
 * wrong — PAT is a calendar in practice but a risk judgement in law, and the
 * BAC has a nominal five years that is really a direction.
 *
 * @param {TemplateEntry|null} entry
 * @returns {'calendar'|'event'|'risk'|'direction'}
 */
export function triggerTypeOf(entry) {
  if (!entry) return 'event';
  if (entry.triggerType) return entry.triggerType;
  if (entry.trigger) {
    return /direct|instruct|when the regulator|on request/i.test(entry.trigger)
      ? 'direction'
      : 'event';
  }
  return entry.frequencyDays ? 'calendar' : 'event';
}

/** Display labels for the four trigger types. */
export const TRIGGER_TYPE_LABEL = {
  calendar:  'Calendar',
  event:     'Event',
  risk:      'Risk or condition',
  direction: 'On direction',
};

/**
 * Short note on where the interval comes from — shown next to the frequency so
 * a conventional interval is never read as a legal one.
 * @param {TemplateEntry|null} entry
 */
export function intervalNote(entry) {
  if (!entry) return '';
  if (!isRecurring(entry)) return entry.trigger ? `Triggered by: ${entry.trigger}` : '';
  return entry.intervalBasis === 'stated'
    ? 'Interval set by the reference above.'
    : 'Interval is established practice; the reference sets the duty, not the frequency.';
}

/**
 * Form data for creating an obligation from a register entry — the same shape
 * `inspectionDefinitionsStore.create` takes, so the template writes exactly
 * what the editor would have written by hand.
 *
 * `scope` is deliberately left EMPTY. Scope is the one thing the register
 * cannot know: which types, systems or floors an obligation covers is a fact
 * about this building. An empty scope matches everything, which is the safe
 * direction to be wrong in — visible and over-broad rather than silently
 * covering nothing.
 *
 * @param {TemplateEntry|null} entry
 * @param {{ presentationOrder?: number }} [opts]
 */
export function templateToObligation(entry, opts = {}) {
  if (!entry || !isSchedulable(entry) || isSuperseded(entry)) return null;
  return {
    name:                    entry.name,
    description:             entry.description,
    active:                  true,
    mode:                    'standard',
    scope:                   {},
    checklist_mode:          'type_driven',
    checklist_attr_ids:      [],
    pass_fail_rule:          'manual',
    frequency_days:          entry.frequencyDays,
    presentation_order:      opts.presentationOrder ?? 0,
    evidenced_by:            entry.evidencedBy,
    statutory_ref:           entry.statutoryRef,
    max_interval_days:       entry.maxIntervalDays,
    responsible_party:       entry.responsibleParty,
    competency_required:     entry.competencyRequired,
    evidence_required:       entry.evidenceRequired,
    retention_period_months: entry.retentionPeriodMonths,
    template_key:            entry.key,
  };
}

/**
 * Coverage of the register by the obligations actually held.
 *
 * Coverage is decided ONLY by `template_key`, never by matching names or
 * references — see migration 207's header for why a heuristic is the wrong tool
 * here. An obligation that duplicates an entry but carries no key is offered as
 * a SUGGESTION (see `suggestMatches`) for a person to confirm.
 *
 * An INACTIVE obligation covers nothing: switching an obligation off is exactly
 * the state this report exists to surface.
 *
 * Entries the obligation library cannot schedule are never counted as gaps —
 * they are reported separately, by the app that deals with them, so the
 * percentage means "of the things this library is responsible for".
 *
 * @param {Array<{template_key?: string|null, active?: boolean}>} obligations
 * @param {{ dismissedKeys?: string[] }} [opts] keys marked not applicable to this building
 */
export function templateCoverage(obligations, opts = {}) {
  const dismissed = new Set(opts.dismissedKeys ?? []);
  const byKey = new Map();
  for (const o of obligations ?? []) {
    const key = o?.template_key;
    if (!key || !BY_KEY.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(o);
  }

  const covered = [];
  const missing = [];
  const notApplicable = [];
  const elsewhere = [];      // another app owns its cycle
  const unhomed = [];        // nothing in the portal deals with it
  const superseded = [];     // withdrawn — kept, but no longer counted

  for (const entry of REGISTER) {
    const linked = byKey.get(entry.key) ?? [];
    const active = linked.filter(o => o.active !== false);

    // A withdrawn requirement is neither covered nor a gap. It stays visible,
    // with its date and successor, because the evidence gathered under it is
    // still real and still has to make sense to whoever reads it later.
    if (isSuperseded(entry, opts.asOf)) {
      superseded.push({ entry, obligations: linked });
      continue;
    }

    if (!isSchedulable(entry)) {
      if (dismissed.has(entry.key)) notApplicable.push({ entry, obligations: linked });
      else if (isUnhomed(entry))    unhomed.push({ entry });
      else                          elsewhere.push({ entry });
      continue;
    }

    if (active.length > 0) {
      covered.push({ entry, obligations: linked, activeCount: active.length });
    } else if (dismissed.has(entry.key)) {
      notApplicable.push({ entry, obligations: linked });
    } else {
      // Linked but all inactive still reads as a gap — deliberately.
      missing.push({ entry, obligations: linked, inactiveOnly: linked.length > 0 });
    }
  }

  const applicableCount = covered.length + missing.length;
  return {
    covered,
    missing,
    notApplicable,
    elsewhere,
    unhomed,
    superseded,
    coveredCount: covered.length,
    applicableCount,
    // The percentage is over what this library is responsible for AND what the
    // building says applies to it, so marking a lift-less building's LOLER
    // entry not applicable moves it towards 100% rather than leaving a
    // permanent shortfall nobody can ever clear.
    percent: applicableCount === 0 ? 100 : Math.round((covered.length / applicableCount) * 100),
  };
}

/** Every entry, grouped for display: group -> entries, basis-ranked within. */
export function registerByGroup() {
  const out = new Map();
  for (const g of GROUPS) {
    const entries = REGISTER
      .filter(e => e.group === g)
      .sort((a, b) => (BASIS_RANK[a.basis] - BASIS_RANK[b.basis]) || a.name.localeCompare(b.name));
    if (entries.length > 0) out.set(g, entries);
  }
  return out;
}

/** How many entries sit under each basis — the "where does this all come from" summary. */
export function basisTally(entries = REGISTER) {
  const tally = Object.fromEntries(BASIS.map(b => [b, 0]));
  for (const e of entries) if (e.basis in tally) tally[e.basis] += 1;
  return tally;
}

// ── Suggestion matching ────────────────────────────────────────────────────

/** Normalise a reference for loose comparison: case, punctuation and spacing. */
function normaliseRef(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The leading standard or instrument name, e.g. 'bs 5839 1' from a fuller ref. */
function refHead(s) {
  const n = normaliseRef(s);
  const m = n.match(/^bs(?: en)?(?: iso)?(?: \d+)+/);
  return m ? m[0] : n.split(/\s+/).slice(0, 4).join(' ');
}

// Words that say how a thing is done rather than what it is. Dropping them is
// what lets an existing "Fire Doors" match "Fire door checks — communal doors":
// substring matching does not, because of the plural and the inserted verb.
const NAME_NOISE = new Set([
  'check', 'checks', 'checking', 'test', 'tests', 'testing', 'service',
  'servicing', 'inspection', 'inspections', 'review', 'monitoring',
  'annual', 'monthly', 'weekly', 'quarterly', 'periodic', 'routine', 'basic',
  'full', 'duration', 'function', 'and', 'the', 'of', 'for', 'system', 'systems',
]);

/**
 * UK housing vocabulary for the same thing — NOT a general thesaurus, and it
 * should stay this short. The regulation says "flat entrance door"; the
 * building's own seeded definition is called "Apartment Doors", and that is the
 * single most important door check there is, so failing to offer the link would
 * invite a duplicate for exactly the obligation you least want two of.
 */
const SYNONYM = new Map([
  ['flat', 'dwelling'], ['apartment', 'dwelling'], ['dwelling', 'dwelling'],
]);

/** Significant, singularised words of a name. */
function nameTokens(s) {
  return new Set(
    normaliseRef(s)
      .split(/\s+/)
      .filter(Boolean)
      .map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))   // doors -> door
      .filter(w => w.length > 1 && !NAME_NOISE.has(w)),
  );
}

/**
 * Two words naming the same thing. Equality, a shared synonym, or one a prefix
 * of the other with at least four characters — so "sign" agrees with "signage".
 * The four-character floor and the all-tokens-must-agree rule below are what
 * stop this being a licence to match anything to anything.
 */
function tokensAgree(a, b) {
  if (a === b) return true;
  if (SYNONYM.has(a) && SYNONYM.get(a) === SYNONYM.get(b)) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short);
}

/**
 * Does the obligation's name describe this entry? True when every significant
 * word of the obligation's name appears in the entry's — "Fire Doors" describes
 * "Fire door checks — communal doors", but "Riser cupboard doors" does not.
 *
 * Deliberately one-directional: a SHORTER, vaguer existing name matching a
 * fuller template name is the realistic case. Going the other way would match
 * almost everything to almost everything.
 */
function nameDescribes(obligationName, entryName) {
  const o = nameTokens(obligationName);
  const e = nameTokens(entryName);
  if (o.size === 0 || e.size === 0) return false;
  for (const w of o) if (![...e].some(x => tokensAgree(w, x))) return false;
  return true;
}

const SUGGESTION_RANK = {
  'Same statutory reference': 0,
  'Same standard and evidence route': 1,
  'Similar name': 2,
};

/**
 * Unlinked obligations that LOOK like they satisfy a register entry, so a
 * person can confirm the link rather than creating a duplicate.
 *
 * Suggestions never count as coverage. They are ranked, not decided: an exact
 * reference match outranks a shared standard, which outranks a name match.
 * Only schedulable entries are offered — linking an obligation to something the
 * library does not schedule would be meaningless.
 *
 * @param {Array<{id?: string, name?: string, statutory_ref?: string|null, template_key?: string|null, evidenced_by?: string|null}>} obligations
 * @returns {Map<string, Array<{obligation: object, reason: string}>>} entry key -> candidates
 */
export function suggestMatches(obligations) {
  const out = new Map();
  const unlinked = (obligations ?? []).filter(o => !o?.template_key);
  if (unlinked.length === 0) return out;

  for (const entry of REGISTER) {
    if (!isSchedulable(entry) || isSuperseded(entry)) continue;
    const entryRef  = normaliseRef(entry.statutoryRef);
    const entryHead = refHead(entry.statutoryRef);
    const candidates = [];

    for (const o of unlinked) {
      const oRef   = normaliseRef(o.statutory_ref);
      const oRoute = o.evidenced_by ?? 'inspection';
      let reason = null;

      if (oRef && oRef === entryRef) {
        reason = 'Same statutory reference';
      } else if (oRef && entryHead && refHead(o.statutory_ref) === entryHead
                 && oRoute === entry.evidencedBy) {
        // Several entries share a standard (BS 5839-1 covers both the weekly
        // test and the service), so the evidence route has to agree too.
        reason = 'Same standard and evidence route';
      } else if (oRoute === entry.evidencedBy && nameDescribes(o.name, entry.name)) {
        // The route must agree here too. Without it an inspection-route
        // "Emergency Lighting" is offered against the annual full-duration
        // test, a contractor job it can never discharge — an inviting, wrong
        // answer in a compliance tool.
        reason = 'Similar name';
      }

      if (reason) candidates.push({ obligation: o, reason });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => SUGGESTION_RANK[a.reason] - SUGGESTION_RANK[b.reason]);
      out.set(entry.key, candidates);
    }
  }
  return out;
}
