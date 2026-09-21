// src/lib/apps/compliance/stores/displayRegisterStore.js
// CRUD store for display_items — used by Compliance > Display Register.
// ⭐ Moved out of Admin with its tab (C3): the BSA s.82 display duty is a
// compliance obligation discharged on a wall, not portal administration.
//
// BSA 2022 s.82 controlled register of what must be physically displayed in
// the building (prescribed AP notice, latest BAC, any compliance notice in
// force). Admin-only both ways at RLS (migration 199) — nothing else reads
// this table yet, unlike statutory_obligations/component_types.

import { writable }  from 'svelte/store';
import { api }       from '$lib/utils/api';
import { supabase }  from '$lib/supabaseClient';
import { getLogger } from '$lib/utils/logger';
import { logAudit }  from '$lib/utils/auditLogger';

const logger = getLogger('DisplayRegister');

/**
 * @typedef {import('$lib/database.types').Tables<'display_items'>} DisplayItem
 * @typedef {{ items: DisplayItem[], loading: boolean, error: string|null }} State
 */

function byLocationThenTitle(a, b) {
  return (a.display_location ?? '').localeCompare(b.display_location ?? '')
    || (a.title ?? '').localeCompare(b.title ?? '');
}

export const SINGLETON_CATEGORIES = ['ap_notice', 'bac'];

function toRow(data, uid, { isCreate }) {
  const row = {
    title:                 (data.title ?? '').trim(),
    category:              data.category ?? 'other',
    current_version:       data.current_version?.trim() || null,
    approval_date:         data.approval_date || null,
    review_date:           data.review_date || null,
    display_location:      (data.display_location ?? '').trim() || null,
    accessible_format:     data.accessible_format?.trim() || null,
    responsible_person_id: data.responsible_person_id || null,
    inspection_frequency_days: data.inspection_frequency_days === '' || data.inspection_frequency_days == null
      ? null : Number(data.inspection_frequency_days),
    linked_gt_document_id: data.linked_gt_document_id || null,
    updated_by:            uid,
  };
  if (isCreate) row.created_by = uid;
  // Filling in a seeded not_set singleton (or any freshly-created item) with
  // real content means it's now on display — see migration 199's header.
  if (data.previousStatus === 'not_set') row.status = 'displayed';
  return row;
}

function createDisplayRegisterStore() {
  const { subscribe, update } = writable(/** @type {State} */ ({
    items: [], loading: false, error: null,
  }));

  async function userId() {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  }

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const items = await api.get('display_items', { orderBy: 'display_location' });
      items.sort(byLocationThenTitle);
      update(s => ({ ...s, items, loading: false }));
      logger('Loaded', items.length, 'display items');
    } catch (/** @type {any} */ err) {
      update(s => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  async function create(data) {
    const uid = await userId();
    const item = await api.create('display_items', toRow(data, uid, { isCreate: true }));
    update(s => ({ ...s, items: [...s.items, item].sort(byLocationThenTitle) }));
    logAudit('create', 'display_item', item.id, item.title, {
      appId: 'admin', eventCategory: 'admin', severity: 'info',
      afterData: { category: item.category, display_location: item.display_location },
    });
    logger('Created display item:', item.id, item.title);
    return item;
  }

  async function save(id, data) {
    const uid = await userId();
    const updated = await api.update('display_items', id, toRow(data, uid, { isCreate: false }));
    update(s => ({
      ...s,
      items: s.items.map(i => i.id === id ? { ...i, ...updated } : i).sort(byLocationThenTitle),
    }));
    logAudit('update', 'display_item', id, updated.title, {
      appId: 'admin', eventCategory: 'admin', severity: 'info',
      afterData: { status: updated.status, review_date: updated.review_date },
    });
    logger('Saved display item:', id, updated.title);
    return updated;
  }

  // Separate from save() — marking a display refreshed/damaged/etc is a
  // distinct, more frequent action (done on a physical check) than editing
  // the register entry itself, and always fire-and-forget audit like the rest.
  async function setStatus(id, status, { notes = null } = {}) {
    const uid = await userId();
    const patch = { status, status_notes: notes, status_since: new Date().toISOString(), updated_by: uid };
    if (status === 'displayed') {
      patch.last_refreshed_at = new Date().toISOString();
      patch.refreshed_by = uid;
    }
    const updated = await api.update('display_items', id, patch);
    update(s => ({
      ...s,
      items: s.items.map(i => i.id === id ? { ...i, ...updated } : i).sort(byLocationThenTitle),
    }));
    logAudit('update', 'display_item', id, updated.title, {
      appId: 'admin', eventCategory: 'admin', severity: status === 'displayed' ? 'info' : 'warning',
      afterData: { status },
    });
    logger('Set status:', id, status);
    return updated;
  }

  async function remove(id) {
    const existing = _snapshot.find(i => i.id === id);
    if (existing && SINGLETON_CATEGORIES.includes(existing.category)) {
      throw new Error(`${existing.category === 'ap_notice' ? 'The AP notice' : 'The BAC'} slot cannot be deleted — s.82 requires it. Clear its fields instead if it no longer applies.`);
    }
    const name = getTitle(id);
    await api.delete('display_items', id);
    update(s => ({ ...s, items: s.items.filter(i => i.id !== id) }));
    logAudit('delete', 'display_item', id, name, {
      appId: 'admin', eventCategory: 'admin', severity: 'warning',
    });
    logger('Deleted display item:', id);
  }

  let _snapshot = [];
  subscribe(s => { _snapshot = s.items; });
  function getTitle(id) { return _snapshot.find(i => i.id === id)?.title ?? null; }

  return { subscribe, load, create, save, setStatus, remove };
}

export const displayRegisterStore = createDisplayRegisterStore();
