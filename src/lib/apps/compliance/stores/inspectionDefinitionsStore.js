// src/lib/apps/compliance/stores/inspectionDefinitionsStore.js
// CRUD store for statutory_obligations — used by Compliance > Planned obligations.
//
// Definitions are portal config (like component_types): admins create/edit them
// here; the mobile Inspection app, Compliance → Inspection walks and Maintenance
// READ them (Maintenance through compliance/public.js) and derive due/overdue
// via computeInspectionSchedule / obligationSchedule.
// Writes are admin-only at RLS (migration 153).

import { writable }  from 'svelte/store';
import { api }       from '$lib/utils/api';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit }  from '$lib/utils/auditLogger';
import { EVIDENCE_ROUTES } from '$lib/utils/obligationEvidence.js';
import { activeRegister, templateEntry, templateToObligation } from '$lib/utils/statutoryTemplate.js';
import { excludedKeys, isRecordableReason } from '$lib/utils/statutoryExclusions.js';

const logger = getLogger('InspectionDefinitions');

/** Numeric field from a form: '' / null / undefined / NaN all mean "not set". */
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {import('$lib/database.types').Tables<'statutory_obligations'>} InspectionDefinition
 * @typedef {{ definitions: InspectionDefinition[], exclusions: object[], dismissedKeys: string[], loading: boolean, error: string|null }} State
 */

function byOrderThenName(a, b) {
  if (a.presentation_order !== b.presentation_order) return a.presentation_order - b.presentation_order;
  return (a.name ?? '').localeCompare(b.name ?? '');
}

// Build the persisted row from form data. `mode` gates which extra fields carry
// meaning, but we always store defensible defaults so a mode switch is clean.
function toRow(data, uid, { isCreate }) {
  const mode = data.mode === 'rotating' ? 'rotating' : 'standard';
  const row = {
    name:               (data.name ?? '').trim(),
    description:        data.description?.trim() || null,
    active:             data.active ?? true,
    mode,
    scope:              data.scope ?? {},
    checklist_mode:     data.checklist_mode === 'explicit' ? 'explicit' : 'type_driven',
    checklist_attr_ids: Array.isArray(data.checklist_attr_ids) ? data.checklist_attr_ids : [],
    pass_fail_rule:     data.pass_fail_rule === 'all_checks_pass' ? 'all_checks_pass' : 'manual',
    frequency_days:     data.frequency_days == null || data.frequency_days === '' ? null : Number(data.frequency_days),
    // Rotating-only; harmless defaults when standard.
    link_source:        data.link_source === 'self_only' ? 'self_only' : 'component_links',
    link_type_filter:   data.link_type_filter?.trim() || null,
    presentation_order: data.presentation_order ?? 0,
    // Which occurrence stack discharges this (migration 203). Anything
    // unrecognised falls back to 'inspection' — the pre-203 behaviour.
    evidenced_by:       EVIDENCE_ROUTES.includes(data.evidenced_by) ? data.evidenced_by : 'inspection',
    // G3 statutory reference + test type (migration 167). These were collected
    // by the editor modal and dispatched in `data` but never written here, so
    // typing a reference appeared to save and silently vanished — and the
    // Building Assets inspections report, which prints `statutory_ref`
    // per definition, has had nothing to print since G3 shipped.
    statutory_ref:  data.statutory_ref?.trim() || null,
    test_type:      data.test_type?.trim()     || null,
    // EXT-10.R1 statutory detail. All optional; null rather than '' so an
    // untouched field reads as "not recorded" and not as "recorded as blank".
    max_interval_days:       numOrNull(data.max_interval_days),
    responsible_party:       data.responsible_party?.trim()   || null,
    competency_required:     data.competency_required?.trim() || null,
    evidence_required:       data.evidence_required?.trim()   || null,
    retention_period_months: numOrNull(data.retention_period_months),
    updated_by:         uid,
  };
  if (isCreate) row.created_by = uid;
  // Only written when the caller actually supplies it. The edit modal has no
  // template field, so folding a `?? null` in here would silently unlink an
  // obligation from the statutory template every time someone edited it —
  // turning a covered entry back into a gap for no reason the user can see.
  if (data.template_key !== undefined) row.template_key = data.template_key;
  // Same guard, same reason (migration 209): an obligation NOT linked to a
  // register entry carries its own basis, and a caller that does not mention
  // it — the Component Types quick-add, say — must not blank it.
  if (data.basis !== undefined) row.basis = data.basis || null;
  if (data.interval_basis !== undefined) row.interval_basis = data.interval_basis || null;
  return row;
}

function createInspectionDefinitionsStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    definitions: [], exclusions: [], dismissedKeys: [], loading: false, error: null,
  }));

  async function userId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  }

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const definitions = await api.get('statutory_obligations', { orderBy: 'presentation_order' });
      definitions.sort(byOrderThenName);
      update(s => ({ ...s, definitions, loading: false }));
      logger('Loaded', definitions.length, 'inspection definitions');
    } catch (/** @type {any} */ err) {
      update(s => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  async function create(data) {
    const uid = await userId();
    const def = await api.create('statutory_obligations', toRow(data, uid, { isCreate: true }));
    update(s => ({ ...s, definitions: [...s.definitions, def].sort(byOrderThenName) }));
    logAudit('create', 'inspection_definition', def.id, def.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'info',
      afterData: { mode: def.mode, frequency_days: def.frequency_days },
    });
    logger('Created definition:', def.id, def.name);
    return def;
  }

  async function save(id, data) {
    const uid = await userId();
    const updated = await api.update('statutory_obligations', id, toRow(data, uid, { isCreate: false }));
    update(s => ({
      ...s,
      definitions: s.definitions.map(d => d.id === id ? { ...d, ...updated } : d).sort(byOrderThenName),
    }));
    logAudit('update', 'inspection_definition', id, updated.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'info',
      afterData: { mode: updated.mode, frequency_days: updated.frequency_days, active: updated.active },
    });
    logger('Saved definition:', id, updated.name);
    return updated;
  }

  async function remove(id) {
    const name = getName(id);
    await api.delete('statutory_obligations', id);
    update(s => ({ ...s, definitions: s.definitions.filter(d => d.id !== id) }));
    logAudit('delete', 'inspection_definition', id, name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'warning',
    });
    logger('Deleted definition:', id);
  }

  // ── The end of a requirement's life ────────────────────────────────────
  // Repealed, superseded, or the standard withdrawn. A FLAG, never a delete:
  // walk sessions and maintenance jobs carried out under it are still evidence,
  // and `maintenance_jobs.obligation_id` is ON DELETE SET NULL, so deleting the
  // obligation would orphan that history and erase proof of real work.

  /**
   * Retire an obligation because it is no longer required.
   *
   * ⚠ Also sets `active = false`, deliberately. Retiring must stop it being
   * offered for NEW work — the mobile walk list and the job scheduler both
   * filter on `active` — while the compliance report still shows it as
   * *Retired* rather than as a gap, because `statusOf` tests retirement before
   * it tests activity.
   *
   * @param {string} id
   * @param {{ retiredOn?: string, reason: string }} opts
   */
  async function retire(id, { retiredOn, reason } = {}) {
    if (!isRecordableReason(reason)) {
      throw new Error('A reason is required — say what withdrew this requirement.');
    }
    const uid = await userId();
    const on = retiredOn || new Date().toISOString().slice(0, 10);
    const updated = await api.update('statutory_obligations', id, {
      retired_on: on,
      retired_reason: reason.trim(),
      retired_by: uid,
      active: false,
      updated_by: uid,
    });
    update(s => ({
      ...s,
      definitions: s.definitions.map(d => d.id === id ? { ...d, ...updated } : d).sort(byOrderThenName),
    }));
    // Warning, not info: a statutory check stopping is something someone may
    // later have to justify, exactly like an exclusion.
    logAudit('update', 'inspection_definition', id, updated.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'warning',
      afterData: { retired_on: on, retired_reason: reason.trim() },
    });
    logger('Retired obligation', id, 'from', on);
    return updated;
  }

  /** Bring a retired obligation back — the requirement returned, or it was a mistake. */
  async function unretire(id, reason) {
    if (!isRecordableReason(reason)) {
      throw new Error('A reason is required — say why it applies again.');
    }
    const uid = await userId();
    const updated = await api.update('statutory_obligations', id, {
      retired_on: null, retired_reason: null, retired_by: null,
      active: true, updated_by: uid,
    });
    update(s => ({
      ...s,
      definitions: s.definitions.map(d => d.id === id ? { ...d, ...updated } : d).sort(byOrderThenName),
    }));
    logAudit('update', 'inspection_definition', id, updated.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'info',
      afterData: { retired_on: null, reason: reason.trim() },
    });
    logger('Un-retired obligation', id);
    return updated;
  }

  // ── M4 · the statutory template ────────────────────────────────────────
  // See src/lib/utils/statutoryTemplate.js. Applying an entry creates an
  // ordinary obligation carrying `template_key`; nothing about it is special
  // afterwards, so it can be edited, rescoped or deleted like any other.

  /**
   * Create obligations from template entries, in template order.
   *
   * Applied one at a time rather than as a `createMany`: a template entry that
   * fails (a name collision, say) should not take the other nineteen with it.
   * The caller gets back what was created and what failed, so a partial apply
   * can be reported honestly rather than as a blanket error.
   * @param {string[]} keys
   */
  async function applyTemplate(keys) {
    const uid = await userId();
    // ⛔ The register IN FORCE, not the shipped key list. Filtering on the seed's
    // keys meant a compliance obligation added here (tutorial §16) could never
    // be applied: it was dropped before the loop, so the call "succeeded" with
    // nothing created and nothing failed — a button that silently did nothing.
    const wanted = activeRegister().map(e => e.key)
      .filter(k => keys?.includes(k));                              // register order, de-duplicated
    // Keep applied entries below anything already ordered by hand.
    const base = _snapshot.reduce((m, d) => Math.max(m, d.presentation_order ?? 0), 0);

    const created = [];
    const failed = [];
    for (const [i, key] of wanted.entries()) {
      const entry = templateEntry(key);
      if (!entry) continue;
      try {
        const data = templateToObligation(entry, { presentationOrder: base + i + 1 });
        const def = await api.create('statutory_obligations', toRow(data, uid, { isCreate: true }));
        created.push(def);
        logAudit('create', 'inspection_definition', def.id, def.name, {
          appId: 'compliance', eventCategory: 'compliance', severity: 'info',
          afterData: { template_key: key, frequency_days: def.frequency_days, evidenced_by: def.evidenced_by },
        });
      } catch (/** @type {any} */ err) {
        failed.push({ key, name: entry.name, message: err.message });
        logger('⚠ Could not apply template entry', key, err.message);
      }
    }

    if (created.length > 0) {
      update(s => ({ ...s, definitions: [...s.definitions, ...created].sort(byOrderThenName) }));
    }
    logger('Applied', created.length, 'of', wanted.length, 'template entries');
    return { created, failed };
  }

  /**
   * Record that an existing obligation satisfies a template entry (or, with
   * `key: null`, that it no longer does). This is the only way an obligation
   * written by hand comes to count as coverage — deliberately a human action,
   * because a guessed link would report a statutory gap as closed.
   * @param {string} id
   * @param {string|null} key
   */
  async function linkToTemplate(id, key) {
    const uid = await userId();
    const updated = await api.update('statutory_obligations', id, {
      template_key: key ?? null, updated_by: uid,
    });
    update(s => ({
      ...s,
      definitions: s.definitions.map(d => d.id === id ? { ...d, ...updated } : d).sort(byOrderThenName),
    }));
    logAudit('update', 'inspection_definition', id, updated.name, {
      appId: 'compliance', eventCategory: 'compliance', severity: 'info',
      afterData: { template_key: key ?? null },
    });
    logger(key ? `Linked ${id} to template entry ${key}` : `Unlinked ${id} from the template`);
    return updated;
  }

  /**
   * Every recorded decision that a register entry does or does not apply to
   * this building (migration 208). Append-only, so this reads the whole log and
   * `excludedKeys` reduces it to the current position.
   *
   * Never fatal: without it every entry is simply still asked about, which is
   * the safe direction — a register that silently hid entries because a read
   * failed would be worse than one that over-asks.
   */
  async function loadExclusions() {
    try {
      const exclusions = await api.get('statutory_exclusions', { orderBy: 'decided_at', ascending: false });
      update(s => ({ ...s, exclusions, dismissedKeys: excludedKeys(exclusions) }));
      return exclusions;
    } catch (/** @type {any} */ err) {
      logger('⚠ Could not read statutory exclusions:', err.message);
      return [];
    }
  }

  /**
   * Record a decision that an entry does not apply to this building, or that it
   * applies again. A COMPLIANCE DECISION, not a UI preference: someone may
   * later have to say who decided a statutory check did not apply, when, and
   * why, so the reason is mandatory here as well as at the database.
   *
   * Nothing is updated or deleted — a reversal is a new row, and the original
   * decision stays in the log.
   *
   * @param {string} templateKey
   * @param {'not_applicable'|'applicable'} decision
   * @param {string} reason        required, and must say something
   * @param {{ reviewDue?: string|null }} [opts]
   */
  async function recordExclusionDecision(templateKey, decision, reason, opts = {}) {
    // ⛔ Same fault as applyTemplate: checked against the shipped keys, so a
    // compliance obligation added here could not be recorded as not applicable.
    if (!templateEntry(templateKey)) {
      throw new Error(`Unknown register entry: ${templateKey}`);
    }
    if (!isRecordableReason(reason)) {
      throw new Error('A reason is required — this decision is a compliance record.');
    }
    const uid = await userId();
    const row = await api.create('statutory_exclusions', {
      template_key: templateKey,
      decision,
      reason:       reason.trim(),
      review_due:   opts.reviewDue || null,
      decided_by:   uid,
      created_by:   uid,
    });

    update(s => {
      const exclusions = [row, ...s.exclusions];
      return { ...s, exclusions, dismissedKeys: excludedKeys(exclusions) };
    });

    const entry = templateEntry(templateKey);
    // Warning, not info: declaring a legal requirement inapplicable is a
    // decision someone may later have to justify.
    logAudit('create', 'statutory_exclusion', row.id, entry?.name ?? templateKey, {
      appId: 'compliance', eventCategory: 'compliance',
      severity: decision === 'not_applicable' ? 'warning' : 'info',
      afterData: {
        template_key: templateKey, decision, reason: reason.trim(),
        basis: entry?.basis ?? null, review_due: opts.reviewDue || null,
      },
    });
    logger(`Recorded ${decision} for ${templateKey}`);
    return row;
  }

  // Read the current cached name for a definition (for audit before delete).
  let _snapshot = [];
  subscribe(s => { _snapshot = s.definitions; });
  function getName(id) { return _snapshot.find(d => d.id === id)?.name ?? null; }

  return {
    subscribe, load, create, save, remove,
    applyTemplate, linkToTemplate, loadExclusions, recordExclusionDecision,
    retire, unretire,
  };
}

export const inspectionDefinitionsStore = createInspectionDefinitionsStore();
