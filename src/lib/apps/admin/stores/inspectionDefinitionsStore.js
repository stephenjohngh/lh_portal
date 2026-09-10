// src/lib/apps/admin/stores/inspectionDefinitionsStore.js
// CRUD store for statutory_obligations — used by Admin > Inspections tab.
//
// Definitions are portal config (like component_types): admins create/edit them
// here; the mobile Inspection app and the Building Assets "Inspections" tab READ
// them directly (api.get) and derive due/overdue via computeInspectionSchedule.
// Writes are admin-only at RLS (migration 153).

import { writable }  from 'svelte/store';
import { api }       from '$lib/utils/api';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit }  from '$lib/utils/auditLogger';
import { EVIDENCE_ROUTES } from '$lib/utils/obligationEvidence.js';
import { TEMPLATE_KEYS, templateEntry, templateToObligation } from '$lib/utils/statutoryTemplate.js';

const logger = getLogger('InspectionDefinitions');

/** portal_settings key holding the template entries this building has no such system for. */
const TEMPLATE_DISMISSED_KEY = 'statutory_template_not_applicable';

/** Numeric field from a form: '' / null / undefined / NaN all mean "not set". */
function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @typedef {import('$lib/database.types').Tables<'statutory_obligations'>} InspectionDefinition
 * @typedef {{ definitions: InspectionDefinition[], dismissedKeys: string[], loading: boolean, error: string|null }} State
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
  return row;
}

function createInspectionDefinitionsStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    definitions: [], dismissedKeys: [], loading: false, error: null,
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
    } catch (err) {
      update(s => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  async function create(data) {
    const uid = await userId();
    const def = await api.create('statutory_obligations', toRow(data, uid, { isCreate: true }));
    update(s => ({ ...s, definitions: [...s.definitions, def].sort(byOrderThenName) }));
    logAudit('create', 'inspection_definition', def.id, def.name, {
      appId: 'admin', eventCategory: 'admin', severity: 'info',
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
      appId: 'admin', eventCategory: 'admin', severity: 'info',
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
      appId: 'admin', eventCategory: 'admin', severity: 'warning',
    });
    logger('Deleted definition:', id);
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
    const wanted = TEMPLATE_KEYS.filter(k => keys?.includes(k));   // template order, de-duplicated
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
          appId: 'admin', eventCategory: 'admin', severity: 'info',
          afterData: { template_key: key, frequency_days: def.frequency_days, evidenced_by: def.evidenced_by },
        });
      } catch (err) {
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
      appId: 'admin', eventCategory: 'admin', severity: 'info',
      afterData: { template_key: key ?? null },
    });
    logger(key ? `Linked ${id} to template entry ${key}` : `Unlinked ${id} from the template`);
    return updated;
  }

  /**
   * Template entries this building says it does not have — a block with no
   * lift should not carry a permanent LOLER gap, because a report that is
   * always red stops being read.
   *
   * Kept in `portal_settings` (the withdrawn-specifications precedent in
   * worksSchedulesStore): it is one fact about the building, true for everyone
   * who looks, and it costs no migration. Never fatal — without it every entry
   * is simply still asked about.
   */
  async function loadTemplateDismissals() {
    try {
      const rows = await api.get('portal_settings', {
        select: 'key, value', filters: { key: TEMPLATE_DISMISSED_KEY },
      });
      const value = rows[0]?.value;
      const dismissedKeys = Array.isArray(value) ? value.filter(k => TEMPLATE_KEYS.includes(k)) : [];
      update(s => ({ ...s, dismissedKeys }));
      return dismissedKeys;
    } catch (err) {
      logger('⚠ Could not read template dismissals:', err.message);
      return [];
    }
  }

  /**
   * @param {string} key
   * @param {boolean} dismissed
   * @param {string} [reason] free text — why this building has no such system
   */
  async function setTemplateDismissed(key, dismissed, reason = '') {
    const uid = await userId();
    const current = _dismissed;
    const next = dismissed
      ? [...new Set([...current, key])]
      : current.filter(k => k !== key);

    await api.upsert('portal_settings',
      { key: TEMPLATE_DISMISSED_KEY, value: next, updated_by: uid },
      { onConflict: 'key' });

    update(s => ({ ...s, dismissedKeys: next }));
    // Warning, not info: declaring a statutory obligation inapplicable is a
    // compliance decision someone may later have to justify.
    logAudit('update', 'portal_setting', TEMPLATE_DISMISSED_KEY, 'Statutory template — not applicable', {
      appId: 'admin', eventCategory: 'admin', severity: 'warning',
      afterData: { template_key: key, not_applicable: dismissed, reason: reason || null },
    });
    logger(dismissed ? `Template entry ${key} marked not applicable` : `Template entry ${key} reinstated`);
    return next;
  }

  // Read the current cached name for a definition (for audit before delete).
  let _snapshot = [];
  let _dismissed = [];
  subscribe(s => { _snapshot = s.definitions; _dismissed = s.dismissedKeys; });
  function getName(id) { return _snapshot.find(d => d.id === id)?.name ?? null; }

  return {
    subscribe, load, create, save, remove,
    applyTemplate, linkToTemplate, loadTemplateDismissals, setTemplateDismissed,
  };
}

export const inspectionDefinitionsStore = createInspectionDefinitionsStore();
