// parking/stores/sightingStore.js
// Unauthorised parking (migration 245, 2026-10-17): a car seen in the car park
// or on the side road that Car check found not allowed there, recorded with a
// note, a photo, and the date and time. A SIGHTING, not an offence — the car
// may yet prove to be a visitor who was allowed.
//
// ⛔ Nothing personal reaches the audit log (the Parking rule): an entry names
// the sighting by its id and place, never the registration or the note.
// ⛔ Deleting one deletes its photo FILE first, and keeps the row if that
// fails (CLAUDE.md, stored files): a photo with nothing naming it cannot be
// found again.
// ⭐ Recording works with no signal (2026-10-17): the record and its photo go
// into Parking's offline queue (parkingQueue.js) and are sent when there is a
// signal — at once, when there is one. The date and time are the phone's, when
// Save was pressed. Only where the phone has no offline storage (some private
// browsing) is it sent directly, and then it needs a signal.

import { writable, get } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { uploadMedia } from '#lib/utils/mediaUpload.js';
import { listAttachments, addAttachments, purgeAttachments } from '#lib/utils/mediaAttachments.js';
import { DOC_FOLDERS } from '#lib/utils/documentUtils.js';
import { requireUserId } from '#lib/utils/currentUser.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { errMessage } from '#lib/utils/errors.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { normaliseReg } from '../utils/agreementModel.js';
import { SIGHTING_PLACES, validateSighting } from '../utils/sightingModel.js';
import { isIdbAvailable } from '#lib/utils/idb.js';
import { queueSighting, queueAudit, onSynced, SIGHTING_ENTITY as QUEUED_ENTITY } from './parkingQueue.js';

const AUDIT = { appId: 'parking', eventCategory: 'parking' };
export const SIGHTING_ENTITY = QUEUED_ENTITY;

/**
 * @typedef {{ id: string, registration: string, place: string, seen_at: string,
 *             notes: string|null, created_by: string|null, photos: string[] } & Record<string, any>} Sighting
 * @typedef {{ sightings: Sighting[], loading: boolean, loaded?: boolean, error: string|null }} State
 */

/** Rows with their photos merged on. @param {any[]} rows */
async function withPhotos(rows) {
  if (!rows.length) return rows;
  const media = await listAttachments(SIGHTING_ENTITY, rows.map((r) => r.id));
  /** @type {Map<string, string[]>} */
  const byId = new Map();
  for (const m of media) {
    if (!byId.has(m.entity_id)) byId.set(m.entity_id, []);
    /** @type {string[]} */ (byId.get(m.entity_id)).push(m.storage_url);
  }
  return rows.map((r) => ({ ...r, photos: byId.get(r.id) ?? [] }));
}

function createSightingStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({ sightings: [], loading: false, error: null }));
  const state = () => get({ subscribe });

  const load = storeLoader(update,
    async () => withPhotos(await api.getAll('parking_sightings', { orderBy: 'seen_at', ascending: false })),
    (sightings) => ({ sightings }),
    { what: 'the unauthorised parking records' });

  async function ensureLoaded() {
    if (state().loaded) return;
    await load();
  }

  /**
   * Record a sighting. It goes into the offline queue with its photo and is
   * sent as soon as there is a signal; the answer is at once either way.
   * @param {{ registration: string, place: string, notes?: string, photo?: Blob|null }} input
   * @returns {Promise<{ sighting: Sighting, queued: boolean, photoError: string }>}
   */
  async function record({ registration, place, notes = '', photo = null }) {
    const problem = validateSighting({ registration, place });
    if (problem) throw new Error(problem);
    const userId = await requireUserId();
    const row = {
      id: crypto.randomUUID(),
      registration: normaliseReg(registration),
      place,
      notes: notes.trim() || null,
      seen_at: new Date().toISOString(),
      created_by: userId,
    };
    const filename = `sighting_${row.seen_at.slice(0, 16).replace(/[-:T]/g, '')}_${row.id.slice(0, 8)}.jpg`;
    const folderPath = [DOC_FOLDERS.PARKING_SIGHTINGS];
    if (isIdbAvailable()) {
      await queueSighting(row, photo ? { blob: photo, filename, folderPath } : null);
      // Its audit line waits in the same queue: a plain one is lost with no signal.
      await queueAudit({ eventType: 'create', targetType: 'parking_sighting', targetId: row.id,
        targetName: `Unauthorised parking recorded — ${SIGHTING_PLACES[place]}`, ...AUDIT,
        afterData: { recordedAt: row.seen_at } });
      return { sighting: /** @type {Sighting} */ ({ ...row, photos: [] }), queued: true, photoError: '' };
    }
    // No offline storage on this phone: send it now.
    const saved = await api.create('parking_sightings', row, true);
    logAudit('create', 'parking_sighting', saved.id, `Unauthorised parking recorded — ${SIGHTING_PLACES[place]}`, AUDIT);
    let photoError = '';
    /** @type {string[]} */
    const photos = [];
    if (photo) {
      try {
        const up = await uploadMedia(photo, { filename, folderPath });
        await addAttachments(SIGHTING_ENTITY, saved.id, [{ url: up.url, provider: up.provider, sizeBytes: up.sizeBytes }], userId);
        photos.push(up.url);
      } catch (/** @type {any} */ err) {
        photoError = errMessage(err, 'The photo could not be saved.');
      }
    }
    const sighting = /** @type {Sighting} */ ({ ...saved, photos });
    update((s) => ({ ...s, sightings: [sighting, ...s.sightings] }));
    return { sighting, queued: false, photoError };
  }

  /** Admin: delete a sighting recorded in error — its photo file first. @param {string} id */
  async function remove(id) {
    const s = state().sightings.find((x) => x.id === id);
    await purgeAttachments(SIGHTING_ENTITY, [id]);
    await api.delete('parking_sightings', id);
    update((st) => ({ ...st, sightings: st.sightings.filter((x) => x.id !== id) }));
    logAudit('delete', 'parking_sighting', id,
      `Unauthorised parking record deleted — ${s ? SIGHTING_PLACES[s.place] ?? s.place : ''}`, { ...AUDIT, severity: 'warning' });
  }

  // A queued sighting has reached the server: read the list again, so it shows
  // with its photo. (Only once the list has been read at all.)
  onSynced((op) => {
    if (op.type === 'sighting' && state().loaded) load().catch(() => { /* shown from state.error */ });
  });

  return { subscribe, load, ensureLoaded, record, remove };
}

export const sightingStore = createSightingStore();
