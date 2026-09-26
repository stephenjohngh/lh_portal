// src/lib/apps/parking/stores/parkingStore.js
// Parking, phase 0: the bay register. docs/requirements/unbuilt/Parking_App_Design.md.
//
// Reads the DRAWN bays through Building Assets' public.js (they are that app's
// records) and floors and plans directly (shared reference data, which any app
// may read). Owns and writes only `parking_bays`.

import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { auth } from '$lib/stores/auth';
import { logAudit } from '$lib/utils/auditLogger';
import { getLogger } from '$lib/utils/logger';
import { listParkingBaySpaces } from '$lib/apps/building_assets/public.js';
import { mergeBays, bayFactsRow, validateBayFacts } from '../utils/bayModel.js';

const logger = getLogger('Parking');
const AUDIT = { appId: 'parking', eventCategory: 'parking' };

/**
 * @typedef {{
 *   bays: Array<Record<string, any>>,
 *   floors: Array<Record<string, any>>,
 *   plans: Array<Record<string, any>>,
 *   loading: boolean, error: string|null
 * }} State
 */

function createParkingStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    bays: [], floors: [], plans: [], loading: false, error: null,
  }));

  // Kept so a save can re-merge without re-reading every table.
  let spaces = [];
  let rows = [];

  function remerge() {
    update(s => ({ ...s, bays: mergeBays(spaces, rows, s.floors, s.plans) }));
  }

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [bs, pb, floors, plans] = await Promise.all([
        listParkingBaySpaces(),
        api.get('parking_bays'),
        api.get('floors', { orderBy: 'level_order', ascending: true }),
        api.get('plans', { select: 'id, name, floor_id, image_url, image_aspect_ratio, scale_ref' }),
      ]);
      spaces = bs; rows = pb;
      update(s => ({ ...s, floors, plans, loading: false,
        bays: mergeBays(spaces, rows, floors, plans) }));
    } catch (/** @type {any} */ err) {
      logger('load failed:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  /**
   * Save a bay's parking facts. The first save creates the row, keyed on the
   * drawn space; later saves update it.
   * @param {string} spaceId
   * @param {Record<string, any>} facts
   */
  async function saveBay(spaceId, facts) {
    const problem = validateBayFacts(facts);
    if (problem) throw new Error(problem);
    const userId = get(auth).user?.id;
    if (!userId) throw new Error('Not authenticated');

    const before = rows.find(r => r.space_id === spaceId) ?? null;
    const row = {
      ...bayFactsRow(facts),
      space_id: spaceId,
      updated_by: userId,
      updated_at: new Date().toISOString(),
      ...(before ? {} : { created_by: userId }),
    };
    const saved = await api.upsert('parking_bays', row, { onConflict: 'space_id' });
    rows = before ? rows.map(r => r.space_id === spaceId ? saved : r) : [...rows, saved];
    remerge();

    const ref = get({ subscribe }).bays.find(b => b.space_id === spaceId)?.ref ?? spaceId;
    logAudit(before ? 'update' : 'create', 'parking_bay', saved.id, ref,
      { ...AUDIT, beforeData: before ?? undefined, afterData: saved });
    return saved;
  }

  return { subscribe, load, saveBay };
}

export const parkingStore = createParkingStore();
