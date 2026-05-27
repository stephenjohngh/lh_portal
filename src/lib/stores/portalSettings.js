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
//   }

import { writable }  from 'svelte/store';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger     = getLogger('portalSettings');
const TOPBAR_KEY = 'topbar_apps';
const ORDER_KEY  = 'app_order';

function createPortalSettingsStore() {
  const { subscribe, set, update } = writable({ loaded: false, ids: null, order: null });

  /**
   * Load topbar_apps and app_order from the DB.
   * Safe to call multiple times (subsequent calls re-fetch and update).
   */
  async function load() {
    try {
      const { data, error } = await supabase
        .from('portal_settings')
        .select('key, value')
        .in('key', [TOPBAR_KEY, ORDER_KEY]);

      if (error) throw error;

      const rows  = data ?? [];
      const ids   = rows.find(r => r.key === TOPBAR_KEY)?.value ?? null;
      const order = rows.find(r => r.key === ORDER_KEY)?.value  ?? null;

      set({ loaded: true, ids, order });
      logger('✅ Loaded portal settings — topbar:', ids ?? 'all', '— order:', order ?? 'default');
    } catch (err) {
      logger('⚠ Failed to load portal settings (non-fatal):', err.message);
      // Treat failure as "show all, default order" rather than blocking the app
      set({ loaded: true, ids: null, order: null });
    }
  }

  /**
   * Persist a new topbar app list and update the store immediately.
   * @param {string[]} appIds  — ordered list of app IDs to show in the top bar
   */
  async function save(appIds) {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

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
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

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

  return { subscribe, load, save, saveOrder };
}

export const portalSettings = createPortalSettingsStore();
