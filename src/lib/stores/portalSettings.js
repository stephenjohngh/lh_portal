// src/lib/stores/portalSettings.js
// Global store for portal-wide configuration loaded from the portal_settings table.
// Shared between +page.svelte (reads config) and the admin PortalSettingsPanel
// (writes it) so changes reflect in the navbar and home grid immediately without
// a page refresh.
//
// Store value shape:
//   {
//     loaded:  boolean        — false until first DB fetch completes
//     ids:     string[] | null — topbar_apps: which apps appear in the nav bar
//                               null = no row saved yet → show all
//     order:   string[] | null — app_order: display order for home grid + nav
//                               null = no row saved yet → use AVAILABLE_APPS order
//     dueWindows: object      — due_soon_days: the "due soon" windows an admin
//                               changed from the shipped default ({} = none)
//     windows:    object      — every window in force (defaults + those changes)
//     building:   object|null — the facilities row: { id, name, short_name, address }
//     organisation: object    — the business and letter signatory ({} = none set)
//     policies:   object      — the policy numbers an admin changed ({} = none)
//     policiesInForce: object — every policy in force (defaults + those changes)
//     wording:    object      — the texts an admin changed ({} = none)
//     wordingInForce: object  — every text in force (defaults + those changes)
//     documentCategories: object — the category changes ({labels, added, retired})
//     aiEnabled:  boolean     — Management's AI suggestions on (default) or off
//   }
//
// ⭐ The building and the business are admin settings, not code
// (#lib/utils/identity.js): read here so every screen and export names them
// from one place.
//
// ⭐ The due windows are handed to dueWindows.js (setDueWindows) as they load,
// so every app reads them through dueSoonDays(). The main shell WAITS for this
// load before it opens an app; a screen that may open without waiting (the
// phone Inspection app) reads `windows` from here so it recalculates when they
// arrive.

import { writable }  from 'svelte/store';
import { supabase }  from '#lib/supabaseClient.js';
import { getLogger } from '#lib/utils/logger.js';
import { setDueWindows, cleanDueWindows, activeDueWindows } from '#lib/utils/dueWindows.js';
import { currentUserId } from '#lib/utils/currentUser.js';
import { ORGANISATION_KEY, cleanOrganisation } from '#lib/utils/identity.js';
import { POLICIES_KEY, setPolicies, cleanPolicies, validatePolicies, activePolicies } from '#lib/utils/policies.js';
import { WORDING_KEY, setWording, cleanWording, validateWording, activeWording } from '#lib/utils/wording.js';
import {
  DOCUMENT_CATEGORIES_KEY, setDocumentCategories, cleanDocumentCategories, validateDocumentCategories,
} from '#lib/utils/documentCategories.js';
import { AI_ENABLED_KEY, aiEnabledFrom } from '#lib/utils/aiSwitch.js';

const logger     = getLogger('portalSettings');
const TOPBAR_KEY = 'topbar_apps';
const ORDER_KEY  = 'app_order';
const DUE_KEY    = 'due_soon_days';

/**
 * @typedef {{
 *   loaded: boolean,
 *   ids: string[] | null,
 *   order: string[] | null,
 *   dueWindows: Record<string, number>,
 *   windows: Record<string, number>,
 *   building: { id: string, name: string, short_name: string, address: string|null } | null,
 *   organisation: Record<string, string>,
 *   policies: Record<string, number>,
 *   policiesInForce: Record<string, number>,
 *   wording: Record<string, string>,
 *   wordingInForce: Record<string, string>,
 *   documentCategories: import('#lib/utils/documentCategories.js').CategoryChanges,
 *   aiEnabled: boolean,
 * }} PortalSettingsState
 */

function createPortalSettingsStore() {
  const { subscribe, set, update } = writable(/** @type {PortalSettingsState} */ ({
    loaded: false, ids: null, order: null, dueWindows: {}, windows: activeDueWindows(),
    building: null, organisation: {}, policies: {}, policiesInForce: activePolicies(),
    wording: {}, wordingInForce: activeWording(),
    documentCategories: { labels: {}, added: [], retired: [] },
    aiEnabled: true,
  }));

  /**
   * Load topbar_apps and app_order from the DB.
   * Safe to call multiple times (subsequent calls re-fetch and update).
   */
  async function load() {
    try {
      const [{ data, error }, facility] = await Promise.all([
        supabase
          .from('portal_settings')
          .select('key, value')
          .in('key', [TOPBAR_KEY, ORDER_KEY, DUE_KEY, ORGANISATION_KEY, POLICIES_KEY,
                     WORDING_KEY, DOCUMENT_CATEGORIES_KEY, AI_ENABLED_KEY]),
        supabase
          .from('facilities')
          .select('id, name, short_name, address')
          .order('created_at').limit(1).maybeSingle(),
      ]);

      if (error) throw error;
      if (facility.error) throw facility.error;

      const rows  = data ?? [];
      const ids   = /** @type {string[] | null} */ (rows.find(r => r.key === TOPBAR_KEY)?.value ?? null);
      const order = /** @type {string[] | null} */ (rows.find(r => r.key === ORDER_KEY)?.value  ?? null);
      const dueWindows = setDueWindows(rows.find(r => r.key === DUE_KEY)?.value ?? null);
      const organisation = cleanOrganisation(rows.find(r => r.key === ORGANISATION_KEY)?.value);
      const policies = setPolicies(rows.find(r => r.key === POLICIES_KEY)?.value ?? null);
      const wording = setWording(rows.find(r => r.key === WORDING_KEY)?.value ?? null);
      const documentCategories = setDocumentCategories(rows.find(r => r.key === DOCUMENT_CATEGORIES_KEY)?.value ?? null);

      set({ loaded: true, ids, order, dueWindows, windows: activeDueWindows(),
            building: facility.data ?? null, organisation,
            policies, policiesInForce: activePolicies(),
            wording, wordingInForce: activeWording(), documentCategories,
            aiEnabled: aiEnabledFrom(rows.find(r => r.key === AI_ENABLED_KEY)?.value) });
      logger('✅ Loaded portal settings — topbar:', ids ?? 'all', '— order:', order ?? 'default');
    } catch (/** @type {any} */ err) {
      logger('⚠ Failed to load portal settings (non-fatal):', err.message);
      // Treat failure as "show all, default order" rather than blocking the app.
      // The due windows stay as they are: defaults on a first load, and an
      // admin's settings already read are not thrown away by a failed re-read.
      update(s => ({ ...s, loaded: true, ids: null, order: null }));
    }
  }

  /**
   * Persist a new topbar app list and update the store immediately.
   * @param {string[]} appIds  — ordered list of app IDs to show in the top bar
   */
  async function save(appIds) {
    const userId = await currentUserId();

    const { error } = await supabase
      .from('portal_settings')
      .upsert(
        { key: TOPBAR_KEY, value: appIds, updated_by: userId },
        { onConflict: 'key' }
      );

    if (error) throw new Error(error.message);

    update(s => ({ ...s, ids: appIds }));
    logger('✅ Saved topbar config:', appIds);
  }

  /**
   * Persist a new app display order and update the store immediately.
   * @param {string[]} appIds  — all app IDs in the desired display order
   */
  async function saveOrder(appIds) {
    const userId = await currentUserId();

    const { error } = await supabase
      .from('portal_settings')
      .upsert(
        { key: ORDER_KEY, value: appIds, updated_by: userId },
        { onConflict: 'key' }
      );

    if (error) throw new Error(error.message);

    update(s => ({ ...s, order: appIds }));
    logger('✅ Saved app order:', appIds);
  }

  /**
   * Save the "due soon" windows and put them in force at once. Only windows
   * that differ from the shipped default are stored, so a window set back to
   * its default follows the default again (dueWindows.js).
   * @param {Record<string, number>} windows  `{ key: days }`
   * @returns {Promise<Record<string, number>>} what was stored
   */
  async function saveDueWindows(windows) {
    const userId = await currentUserId();
    const changed = cleanDueWindows(windows);

    const { error } = await supabase
      .from('portal_settings')
      .upsert(
        { key: DUE_KEY, value: changed, updated_by: userId },
        { onConflict: 'key' }
      );

    if (error) throw new Error(error.message);

    setDueWindows(changed);
    update(s => ({ ...s, dueWindows: changed, windows: activeDueWindows() }));
    logger('✅ Saved due windows:', changed);
    return changed;
  }

  /**
   * Save the building's details (the one facilities row).
   * @param {{ name: string, short_name: string, address: string|null }} fields
   */
  async function saveBuilding(fields) {
    const userId = await currentUserId();
    let current = null;
    update(s => { current = s.building; return s; });
    if (!current?.id) throw new Error('There is no building record to update.');
    const row = {
      name:       String(fields.name ?? '').trim(),
      short_name: String(fields.short_name ?? '').trim(),
      address:    String(fields.address ?? '').trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (!row.name || !row.short_name) throw new Error('The building needs a name and a short name.');
    const { data, error } = await supabase
      .from('facilities').update(row).eq('id', current.id)
      .select('id, name, short_name, address').single();
    if (error) throw new Error(error.message);
    update(s => ({ ...s, building: data }));
    logger('✅ Saved the building details');
    return data;
  }

  /**
   * Save the business and letter details. Only filled-in fields are stored, so
   * a cleared field reads as unset again.
   * @param {Record<string, string>} fields
   */
  async function saveOrganisation(fields) {
    const userId = await currentUserId();
    const organisation = cleanOrganisation(fields);
    const { error } = await supabase
      .from('portal_settings')
      .upsert({ key: ORGANISATION_KEY, value: organisation, updated_by: userId }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    update(s => ({ ...s, organisation }));
    logger('✅ Saved the business details');
    return organisation;
  }

  /**
   * Save the policy numbers and put them in force at once. Only values that
   * differ from the shipped default are stored, so one put back to its
   * default follows the default again. Refuses a set that breaks a bound or
   * an order (validatePolicies), naming the first problem.
   * @param {Record<string, unknown>} values  `{ key: number }`
   */
  async function savePolicies(values) {
    const problems = validatePolicies(values);
    const first = Object.values(problems)[0];
    if (first) throw new Error(first);
    const userId = await currentUserId();
    const changed = cleanPolicies(values);
    const { error } = await supabase
      .from('portal_settings')
      .upsert({ key: POLICIES_KEY, value: changed, updated_by: userId }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    const policies = setPolicies(changed);
    update(s => ({ ...s, policies, policiesInForce: activePolicies() }));
    logger('✅ Saved the policies:', changed);
    return policies;
  }

  /**
   * Save the wording and put it in force at once. Only texts that differ from
   * the shipped default are stored. Refuses a text with a {token} it does not
   * understand (validateWording), naming the first problem.
   * @param {Record<string, unknown>} values  `{ key: text }`
   */
  async function saveWording(values) {
    const first = Object.values(validateWording(values))[0];
    if (first) throw new Error(first);
    const userId = await currentUserId();
    const changed = cleanWording(values);
    const { error } = await supabase
      .from('portal_settings')
      .upsert({ key: WORDING_KEY, value: changed, updated_by: userId }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    const wording = setWording(changed);
    update(s => ({ ...s, wording, wordingInForce: activeWording() }));
    logger('✅ Saved the wording:', Object.keys(changed));
    return wording;
  }

  /**
   * Save the document category changes (renamed, added, retired) and put them
   * in force at once. Refuses two categories with one name.
   * @param {unknown} changes  `{ labels, added, retired }`
   */
  async function saveDocumentCategories(changes) {
    const first = validateDocumentCategories(changes)[0];
    if (first) throw new Error(first);
    const userId = await currentUserId();
    const clean = cleanDocumentCategories(changes);
    const { error } = await supabase
      .from('portal_settings')
      .upsert({ key: DOCUMENT_CATEGORIES_KEY, value: clean, updated_by: userId }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    const documentCategories = setDocumentCategories(clean);
    update(s => ({ ...s, documentCategories }));
    logger('✅ Saved the document categories');
    return documentCategories;
  }

  /**
   * Switch Management's AI suggestions on or off for everyone.
   * @param {boolean} on
   */
  async function saveAiEnabled(on) {
    const userId = await currentUserId();
    const value = on === true;
    const { error } = await supabase
      .from('portal_settings')
      .upsert({ key: AI_ENABLED_KEY, value, updated_by: userId }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    update(s => ({ ...s, aiEnabled: value }));
    logger('✅ AI suggestions', value ? 'on' : 'off');
    return value;
  }

  return { subscribe, load, save, saveOrder, saveDueWindows, saveBuilding, saveOrganisation, savePolicies,
           saveWording, saveDocumentCategories, saveAiEnabled };
}

export const portalSettings = createPortalSettingsStore();
