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
//   }
//
// ⭐ The due windows are handed to dueWindows.js (setDueWindows) as they load,
// so every app reads them through dueSoonDays(). The main shell WAITS for this
// load before it opens an app; a screen that may open without waiting (the
// phone Inspection app) reads `windows` from here so it recalculates when they
// arrive.

import { writable }  from 'svelte/store';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { setDueWindows, cleanDueWindows, activeDueWindows } from '$lib/utils/dueWindows.js';
import { currentUserId } from '$lib/utils/currentUser.js';

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
 * }} PortalSettingsState
 */

function createPortalSettingsStore() {
  const { subscribe, set, update } = writable(/** @type {PortalSettingsState} */ ({
    loaded: false, ids: null, order: null, dueWindows: {}, windows: activeDueWindows(),
  }));

  /**
   * Load topbar_apps and app_order from the DB.
   * Safe to call multiple times (subsequent calls re-fetch and update).
   */
  async function load() {
    try {
      const { data, error } = await supabase
        .from('portal_settings')
        .select('key, value')
        .in('key', [TOPBAR_KEY, ORDER_KEY, DUE_KEY]);

      if (error) throw error;

      const rows  = data ?? [];
      const ids   = /** @type {string[] | null} */ (rows.find(r => r.key === TOPBAR_KEY)?.value ?? null);
      const order = /** @type {string[] | null} */ (rows.find(r => r.key === ORDER_KEY)?.value  ?? null);
      const dueWindows = setDueWindows(rows.find(r => r.key === DUE_KEY)?.value ?? null);

      set({ loaded: true, ids, order, dueWindows, windows: activeDueWindows() });
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

  return { subscribe, load, save, saveOrder, saveDueWindows };
}

export const portalSettings = createPortalSettingsStore();
