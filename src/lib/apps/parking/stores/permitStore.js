// parking/stores/permitStore.js
// Parking permits for the side road (migration 236): the permits issued, and
// the one template they are printed from.
//
// ⛔ The permit NUMBER is given by the database on insert (a trigger), never
// chosen here: two people issuing at once must not print the same number.
// ⛔ Nothing personal reaches the audit log (the Parking rule): an entry names
// the permit by its number, never the registration or the company.
// The template's two images are document_library files attached to the
// template row; the row records which one is the background and which the
// fixed bottom image.

import { writable, get } from 'svelte/store';
import { api } from '#lib/utils/api.js';
import { uploadDocument, deleteDocument, getDocumentUrl } from '#lib/utils/documentApi.js';
import { DOC_FOLDERS } from '#lib/utils/documentUtils.js';
import { requireUserId } from '#lib/utils/currentUser.js';
import { logAudit } from '#lib/utils/auditLogger.js';
import { getLogger } from '#lib/utils/logger.js';
import { storeLoader } from '#lib/utils/storeLoad.js';
import { validatePermit, permitRow, permitNumberLabel, hhmm } from '../utils/permitModel.js';

const logger = getLogger('ParkingPermits');
const AUDIT = { appId: 'parking', eventCategory: 'parking' };
export const TEMPLATE_IMAGES = Object.freeze({
  background: { column: 'background_document_id', label: 'Background (top two-thirds)' },
  footer:     { column: 'footer_document_id',     label: 'Fixed image (bottom third)' },
});

/**
 * @typedef {import('#lib/database.types.ts').Tables<'parking_permits'> & Record<string, any>} Permit
 * @typedef {import('#lib/database.types.ts').Tables<'parking_permit_templates'> & Record<string, any>} Template
 * @typedef {{ template: Template|null, permits: Permit[],
 *             imageUrls: { background: string|null, footer: string|null },
 *             loading: boolean, loaded?: boolean, error: string|null }} State
 */

async function imageUrls(template) {
  const url = (id) => (id ? getDocumentUrl(id) : Promise.resolve(null));
  const [background, footer] = await Promise.all([
    url(template?.background_document_id), url(template?.footer_document_id),
  ]);
  return { background, footer };
}

function createPermitStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    template: null, permits: [], imageUrls: { background: null, footer: null }, loading: false, error: null,
  }));
  const state = () => get({ subscribe });

  const load = storeLoader(update,
    async () => {
      const [templates, permits] = await Promise.all([
        api.get('parking_permit_templates', { orderBy: 'created_at', ascending: true, limit: 1 }),
        api.getAll('parking_permits', { orderBy: 'permit_number', ascending: false }),
      ]);
      const template = templates[0] ?? null;
      return { template, permits, imageUrls: await imageUrls(template) };
    },
    (r) => r,
    { what: 'the parking permits', log: logger });

  /** Issue a permit. Resolves to the saved row, carrying the number the database gave it. */
  async function issue(fields) {
    const problem = validatePermit(fields);
    if (problem) throw new Error(problem);
    const saved = await api.create('parking_permits', { ...permitRow(fields), created_by: await requireUserId() });
    update((s) => ({ ...s, permits: [saved, ...s.permits] }));
    logAudit('create', 'parking_permit', saved.id, `Permit ${permitNumberLabel(saved.permit_number)}`, AUDIT);
    return saved;
  }

  /** Delete a permit issued in error (admin). Its number is not reused. */
  async function remove(permit) {
    const { id, permit_number } = permit;
    await api.delete('parking_permits', id);
    update((s) => ({ ...s, permits: s.permits.filter((p) => p.id !== id) }));
    logAudit('delete', 'parking_permit', id, `Permit ${permitNumberLabel(permit_number)}`, { ...AUDIT, severity: 'warning' });
  }

  /** Save the template's words and first number (admin). */
  async function saveTemplate(fields) {
    const template = state().template;
    if (!template) throw new Error('There is no permit template to save.');
    const first = Number(fields.first_number);
    if (!Number.isInteger(first) || first < 1) throw new Error('The first permit number must be a whole number of 1 or more.');
    const from = hhmm(fields.default_from_time), to = hhmm(fields.default_to_time);
    if (!from || !to) throw new Error('Enter the usual start and end times.');
    const blank = (v) => (String(v ?? '').trim() || null);
    const saved = await api.update('parking_permit_templates', template.id, {
      title: blank(fields.title) ?? 'Parking Permit',
      location: blank(fields.location),
      conditions: blank(fields.conditions),
      first_number: first,
      default_from_time: from,
      default_to_time: to,
      updated_by: await requireUserId(),
      updated_at: new Date().toISOString(),
    });
    update((s) => ({ ...s, template: saved }));
    logAudit('update', 'parking_permit_template', saved.id, 'Permit template', { ...AUDIT, beforeData: template, afterData: saved });
    return saved;
  }

  /**
   * Put a new image in one of the two places (admin). The new file is uploaded
   * and in use BEFORE the old one is deleted, so a failure leaves a working
   * template. Resolves to a warning string when the old file could not go.
   * @param {'background'|'footer'} which
   * @param {File} file
   */
  async function setImage(which, file) {
    const template = state().template;
    if (!template) throw new Error('There is no permit template.');
    if (!/^image\/(png|jpeg)$/.test(file?.type ?? '')) throw new Error('Choose a PNG or JPEG image.');
    const { column, label } = TEMPLATE_IMAGES[which];
    const oldId = template[column];

    const doc = await uploadDocument(file, {
      entity_type: 'parking_permit_template', entity_id: template.id,
      folder_path: DOC_FOLDERS.PARKING_PERMITS, display_name: file.name, description: `Permit template — ${label}`,
    });
    const saved = await api.update('parking_permit_templates', template.id, {
      [column]: doc.id, updated_by: await requireUserId(), updated_at: new Date().toISOString(),
    });
    const urls = await imageUrls(saved);
    update((s) => ({ ...s, template: saved, imageUrls: urls }));
    logAudit('update', 'parking_permit_template', saved.id, `Permit template — ${label}`, AUDIT);

    if (!oldId) return null;
    try { await deleteDocument(oldId); return null; }
    catch (/** @type {any} */ err) {
      logger('⚠ the replaced image could not be deleted:', err);
      return `The new image is in use. The old one could not be deleted (${err.message}); remove it from Admin → Document Demo.`;
    }
  }

  /** Stop using an image (admin): the template forgets it first, then the file is deleted. */
  async function clearImage(which) {
    const template = state().template;
    if (!template) return null;
    const { column, label } = TEMPLATE_IMAGES[which];
    const oldId = template[column];
    if (!oldId) return null;
    const saved = await api.update('parking_permit_templates', template.id, {
      [column]: null, updated_by: await requireUserId(), updated_at: new Date().toISOString(),
    });
    update((s) => ({ ...s, template: saved, imageUrls: { ...s.imageUrls, [which]: null } }));
    logAudit('update', 'parking_permit_template', saved.id, `Permit template — ${label} removed`, AUDIT);
    try { await deleteDocument(oldId); return null; }
    catch (/** @type {any} */ err) {
      logger('⚠ the removed image could not be deleted:', err);
      return `The image is no longer used, but its file could not be deleted (${err.message}); remove it from Admin → Document Demo.`;
    }
  }

  /** Read the permits unless they already have been — the Registration Lookup needs them before the tab is opened. */
  async function ensureLoaded() {
    if (state().loaded) return;
    await load();
  }

  return { subscribe, load, ensureLoaded, issue, remove, saveTemplate, setImage, clearImage };
}

export const permitStore = createPermitStore();
