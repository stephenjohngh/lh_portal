// src/lib/apps/guides/stores/guidesStore.js
//
// The Guides app's state: the categories, the guides a person may read (RLS decides:
// a published guide for any signed-in user, everything for an admin) and, for an admin
// authoring, the draft steps and photos of one guide.
//
// ⛔ READERS SEE THE FROZEN VERSION (guide_versions.snapshot), never the draft steps
// (guide_steps is admin-only). Editing the draft never changes what anyone is reading
// until it is published (guide_publish() freezes a new version).
//
// ⛔ Photos are media_attachments (entity_type 'guide_step'). Deleting a step or a guide
// deletes its photo FILES first and keeps the record if any file cannot go (the portal's
// file rule). The audit log names a guide by id and title only.
//
// ⭐ The editor saves as you go (each field when you leave it) so a half-written guide
// on a phone is never lost. Every change to a photo also touches the guide, so
// "unpublished changes" is true.

import { writable } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { requireUserId } from '#lib/utils/currentUser.js';
import { compressImage } from '#lib/utils/imageCompression.js';
import { uploadMedia } from '#lib/utils/mediaUpload.js';
import { listAttachments, addAttachments, purgeAttachments, deleteStorageObjects } from '#lib/utils/mediaAttachments.js';
import { entityFolderPath, DOC_FOLDERS } from '#lib/utils/documentUtils.js';
import { DEFAULT_CATEGORIES, NEW_GUIDE_TITLE, NEW_STEP_TITLE } from '../utils/guideDefaults.js';
import { LIMITS } from '../utils/guideModel.js';

const AUDIT = { appId: 'guides', eventCategory: 'guides' };
const PHOTO_TYPE = 'guide_step';

/**
 * @typedef {import('#lib/database.types.ts').Tables<'guides'> & Record<string, any>} Guide
 * @typedef {import('#lib/database.types.ts').Tables<'guide_categories'> & Record<string, any>} Category
 * @typedef {import('#lib/database.types.ts').Tables<'guide_steps'> & Record<string, any>} Step
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

  /** Re-read the lists after a change (no spinner flash). */
  async function reload() {
    const [categories, guides] = await Promise.all([
      api.getAll('guide_categories', { orderBy: 'position', tiebreak: false }),
      api.getAll('guides', { orderBy: 'title' }),
    ]);
    update((s) => ({ ...s, categories, guides }));
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  /** Add the shipped categories — only when there are none (an admin's own list is never overwritten). */
  async function ensureDefaultCategories() {
    const have = await api.count('guide_categories');
    if (have > 0) return false;
    await api.createMany('guide_categories',
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, position: (i + 1) * 10 })), false);
    await reload();
    return true;
  }

  // ── Guides ──────────────────────────────────────────────────────────────────

  /** A new draft guide; the author names it straight away. @returns {Promise<Guide>} */
  async function createGuide({ title = NEW_GUIDE_TITLE, category_key = null } = {}) {
    const userId = await requireUserId();
    const g = await api.create('guides', { title, category_key, created_by: userId, updated_by: userId }, true);
    logAudit('create', 'guide', g.id, g.title, { ...AUDIT, severity: 'info' });
    await reload();
    return g;
  }

  /**
   * Save the guide's own fields (title, summary, category, tags, audience, staff_only,
   * you_need, minutes, review stamp). @param {string} id @param {Record<string, any>} patch
   */
  async function updateGuide(id, patch) {
    const userId = await requireUserId();
    const g = await api.update('guides', id, { ...patch, updated_by: userId }, true);
    logAudit('update', 'guide', id, g.title, { ...AUDIT, severity: 'info', afterData: { fields: Object.keys(patch) } });
    update((s) => ({ ...s, guides: s.guides.map((x) => (x.id === id ? g : x)) }));
    return g;
  }

  /** Retire a published guide: hidden from new use, kept for the history. */
  async function retireGuide(id) {
    const g = await updateGuide(id, { status: 'retired' });
    logAudit('retire', 'guide', id, g.title, { ...AUDIT, severity: 'info' });
    return g;
  }

  /**
   * Delete a guide that was NEVER published (the table refuses any other). Photo files
   * first; the guide is kept if any cannot go.
   */
  async function deleteGuide(id) {
    const guide = (await api.getById('guides', id, 'id, title, version'));
    if (!guide) return;
    if (guide.version > 0) throw new Error('A published guide cannot be deleted — retire it instead.');
    const steps = await api.getAll('guide_steps', { select: 'id', filters: { guide_id: id }, orderBy: 'position' });
    await purgeAttachments(PHOTO_TYPE, steps.map((s) => s.id));
    await api.delete('guides', id);
    logAudit('delete', 'guide', id, guide.title, { ...AUDIT, severity: 'warning', beforeData: { title: guide.title } });
    await reload();
  }

  /** Freeze the draft as the next version. @returns {Promise<number>} the new version number */
  async function publish(id) {
    const version = await api.rpc('guide_publish', { p_guide: id });
    const g = (await api.getById('guides', id));
    logAudit('publish', 'guide', id, g?.title ?? id, { ...AUDIT, severity: 'info', afterData: { version } });
    await reload();
    return /** @type {number} */ (version);
  }

  // ── Steps and photos (an admin authoring) ───────────────────────────────────

  /** @param {string} guideId @returns {Promise<Step[]>} */
  const listSteps = (guideId) =>
    api.getAll('guide_steps', { filters: { guide_id: guideId }, orderBy: 'position', tiebreak: false });

  /** The photos on each step, by step id. @param {string[]} stepIds @returns {Promise<Record<string, any[]>>} */
  async function photosByStep(stepIds) {
    const rows = await listAttachments(PHOTO_TYPE, stepIds);
    /** @type {Record<string, any[]>} */
    const out = {};
    for (const id of stepIds) out[id] = [];
    for (const r of rows) (out[r.entity_id] ??= []).push(r);
    return out;
  }

  /** Add a step at the end. @param {string} guideId @param {{ kind?: string, title?: string }} [step] */
  async function addStep(guideId, { kind = 'step', title = NEW_STEP_TITLE } = {}) {
    const last = await api.get('guide_steps', {
      select: 'position', filters: { guide_id: guideId }, orderBy: 'position', ascending: false, limit: 1,
    });
    return api.create('guide_steps', { guide_id: guideId, position: (last[0]?.position ?? 0) + 1, kind, title }, true);
  }

  /** @param {string} stepId @param {{ kind?: string, title?: string, body?: string|null }} patch */
  const updateStep = (stepId, patch) => api.update('guide_steps', stepId, patch, true);

  /** Delete a step and its photo files (files first). */
  async function deleteStep(stepId) {
    await purgeAttachments(PHOTO_TYPE, [stepId]);
    await api.delete('guide_steps', stepId);
  }

  /** The order, as ids, saved in one atomic call. @param {string} guideId @param {string[]} ids */
  const reorderSteps = (guideId, ids) => api.rpc('guide_reorder_steps', { p_guide: guideId, p_ids: ids });

  /**
   * Add a photo to a step: compress on the device, upload, record. At most four.
   * @param {Guide} guide @param {string} stepId @param {Blob|File} file
   * @param {number} haveCount how many it already has (the limit is enforced here, then by the database on publish)
   */
  async function addPhoto(guide, stepId, file, haveCount) {
    if (haveCount >= LIMITS.photosPerStep) throw new Error(`A step can have at most ${LIMITS.photosPerStep} photos.`);
    const userId = await requireUserId();
    let blob = file;
    try { blob = await compressImage(file); } catch { /* a saving, not a need */ }
    const up = await uploadMedia(blob, {
      filename: `guide-${Date.now()}.jpg`,
      folderPath: entityFolderPath(DOC_FOLDERS.GUIDES, guide.title, guide.id).split('/'),
    });
    await addAttachments(PHOTO_TYPE, stepId, [{ url: up.url, provider: up.provider, sizeBytes: up.sizeBytes }], userId,
      { mimeType: up.mimeType ?? 'image/jpeg', provider: up.provider });
    await api.update('guides', guide.id, { updated_by: userId }, false);        // touches updated_at
  }

  /** Remove one photo: the file first, then its row; kept if the file cannot go. */
  async function removePhoto(guide, photo) {
    const r = await deleteStorageObjects([photo]);
    if (r.failed) throw new Error('That photo could not be deleted from storage, so it was kept. Try again.');
    await api.delete('media_attachments', photo.id);
    const userId = await requireUserId();
    await api.update('guides', guide.id, { updated_by: userId }, false);
  }

  /** Published versions of a guide, newest first (an admin sees them all). @param {string} guideId */
  const listVersions = (guideId) =>
    api.getAll('guide_versions', { select: 'id, version, published_at, published_by, snapshot', filters: { guide_id: guideId }, orderBy: 'version', ascending: false, tiebreak: false });

  /**
   * The frozen copy a reader sees, for the guide's latest published version.
   * @param {string} guideId @param {number} version @returns {Promise<any|null>}
   */
  async function readVersion(guideId, version) {
    const rows = await api.get('guide_versions', {
      select: 'version, snapshot, published_at', filters: { guide_id: guideId, version }, limit: 1,
    });
    return rows[0] ?? null;
  }

  return {
    subscribe, load, reload, ensureDefaultCategories,
    createGuide, updateGuide, retireGuide, deleteGuide, publish,
    listSteps, photosByStep, addStep, updateStep, deleteStep, reorderSteps, addPhoto, removePhoto,
    listVersions, readVersion,
  };
}

export const guidesStore = createGuidesStore();
