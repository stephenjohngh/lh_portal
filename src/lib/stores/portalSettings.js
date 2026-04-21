// src/lib/stores/portalSettings.js
// Global store for portal-wide configuration loaded from the portal_settings table.
// Shared between +page.svelte (reads topbar config) and the admin PortalSettingsPanel
// (writes it) so changes reflect in the navbar immediately without a page refresh.
//
// Store value shape: { loaded: boolean, ids: string[] | null }
//   loaded = false   — initial state, not yet fetched from DB
//   ids = null       — loaded, no row saved yet; callers should treat as "show all"
//   ids = string[]   — loaded, explicit list of app IDs for the top bar

import { writable }  from 'svelte/store';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';

const logger = getLogger('portalSettings');
const TOPBAR_KEY = 'topbar_apps';

function createPortalSettingsStore() {
  const { subscribe, set } = writable({ loaded: false, ids: null });

  /**
   * Load the topbar_apps setting from the DB.
   * Safe to call multiple times (subsequent calls re-fetch and update).
   */
  async function load() {
    try {
      const { data, error } = await supabase
        .from('portal_settings')
        .select('value')
        .eq('key', TOPBAR_KEY)
        .maybeSingle();

      if (error) throw error;

      const ids = data?.value ?? null;   // null = no row = show all
      set({ loaded: true, ids });
      logger('✅ Loaded topbar config:', ids ?? 'all apps');
    } catch (err) {
      logger('⚠ Failed to load portal settings (non-fatal):', err.message);
      // Treat failure as "show all" rather than blocking the app
      set({ loaded: true, ids: null });
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

    set({ loaded: true, ids: appIds });
    logger('✅ Saved topbar config:', appIds);
  }

  return { subscribe, load, save };
}

export const portalSettings = createPortalSettingsStore();
