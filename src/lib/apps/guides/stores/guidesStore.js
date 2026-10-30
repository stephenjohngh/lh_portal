// src/lib/apps/guides/stores/guidesStore.js
//
// The Guides app's state: the categories, the guides a person may read (RLS decides:
// a published guide for any signed-in user, everything for an admin) and the frozen
// copy of one guide on demand. Authoring writes arrive with slice S1.
//
// ⛔ READERS SEE THE FROZEN VERSION (guide_versions.snapshot), never the draft steps
// (guide_steps is admin-only). A published guide's content is whatever the latest
// version holds, so editing the draft never changes what anyone is reading.
//
// ⛔ The audit log names a guide by id and title only.

import { writable } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { storeLoader } from '#lib/utils/storeLoad.js';

/**
 * @typedef {import('#lib/database.types.ts').Tables<'guides'> & Record<string, any>} Guide
 * @typedef {import('#lib/database.types.ts').Tables<'guide_categories'> & Record<string, any>} Category
 * @typedef {{ categories: Category[], guides: Guide[], loading: boolean, loaded?: boolean, error: string|null }} State
 */

function createGuidesStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    categories: [], guides: [], loading: false, error: null,
  }));

  const load = storeLoader(update,
    async () => {
      const [categories, guides] = await Promise.all([
        api.getAll('guide_categories', { orderBy: 'position', tiebreak: false }),
        api.getAll('guides', { orderBy: 'title' }),
      ]);
      return { categories, guides };
    },
    (data) => data,
    { what: 'the guides' });

  /**
   * The frozen copy a reader sees, for the guide's latest published version.
   * @param {string} guideId
   * @param {number} version
   * @returns {Promise<any|null>} the snapshot, or null if there is none
   */
  async function readVersion(guideId, version) {
    const rows = await api.get('guide_versions', {
      select: 'version, snapshot, published_at', filters: { guide_id: guideId, version }, limit: 1,
    });
    return rows[0] ?? null;
  }

  return { subscribe, load, readVersion };
}

export const guidesStore = createGuidesStore();
