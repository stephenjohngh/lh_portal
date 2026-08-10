// src/lib/apps/dossier/stores/dossierStore.js
// State for the Dossier app — authored briefing Packs.
//
// P0 scope: Pack CRUD only. Docs, blocks and revisions land in the next steps
// of the P0 plan (docs/requirements/Dossier_P0_Build_Plan.md §5).
//
// Note on `created_by`: the RLS INSERT policy on dossier_packs pins created_by
// to auth.uid(), so a pack cannot be created already owned by somebody else.
// Every create MUST pass the current user id or the insert is rejected — this is
// the internal owner-scoping boundary, not a convention we can skip.

import { writable }     from 'svelte/store';
import { api }          from '$lib/utils/api';
import { logAudit }     from '$lib/utils/auditLogger';
import { getLogger }    from '$lib/utils/logger';
import { uniqueSlug }   from '../utils/slug.js';
import { nextOrderIndex } from '../utils/docTree.js';

const logger = getLogger('dossierStore');

/** Most-recently-touched first; a pack that has never been edited falls back to its creation time. */
function sortPacks(packs) {
  return [...packs].sort((a, b) =>
    new Date(b.updated_at ?? b.created_at).getTime() -
    new Date(a.updated_at ?? a.created_at).getTime()
  );
}

/** Stamp the audit columns carried on every write (portal convention). */
function touch(userId) {
  return { updated_by: userId, updated_at: new Date().toISOString() };
}

function createDossierStore() {
  const { subscribe, update } = writable({
    packs:        [],
    loading:      false,
    error:        null,
    // Docs for the pack currently open in the workspace.
    activePackId: null,
    docs:         [],
    loadingDocs:  false,
  });

  // ── Packs ────────────────────────────────────────────────────────────────

  async function loadPacks() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      // RLS scopes this to packs the caller owns (admins see all), so no filter
      // is needed here — and adding one would be a false sense of security.
      const packs = await api.get('dossier_packs', {
        orderBy: 'created_at', ascending: false,
      });
      update(s => ({ ...s, packs: sortPacks(packs), loading: false }));
      return packs;
    } catch (err) {
      update(s => ({ ...s, error: err.message, loading: false }));
      throw err;
    }
  }

  async function createPack(data, userId) {
    const pack = await api.create('dossier_packs', {
      title:       data.title,
      description: data.description ?? null,
      status:      'active',
      created_by:  userId,
      ...touch(userId),
    }, true);

    update(s => ({ ...s, packs: sortPacks([pack, ...s.packs]) }));
    logAudit('create', 'dossier_pack', pack.id, pack.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info',
      afterData: { title: pack.title, description: pack.description },
    });
    return pack;
  }

  async function updatePack(id, data, userId) {
    const pack = await api.update('dossier_packs', id, {
      title:       data.title,
      description: data.description ?? null,
      ...touch(userId),
    }, true);

    update(s => ({ ...s, packs: sortPacks(s.packs.map(p => p.id === id ? pack : p)) }));
    logAudit('update', 'dossier_pack', id, pack.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info',
      afterData: { title: pack.title, description: pack.description },
    });
    return pack;
  }

  /** Archive / restore. Archiving is the owner's soft-delete — hard delete is admin-only (RLS). */
  async function setArchived(id, archived, userId) {
    const pack = await api.update('dossier_packs', id, {
      status: archived ? 'archived' : 'active',
      ...touch(userId),
    }, true);

    update(s => ({ ...s, packs: sortPacks(s.packs.map(p => p.id === id ? pack : p)) }));
    logAudit(archived ? 'archive' : 'restore', 'dossier_pack', id, pack.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info',
      afterData: { status: pack.status },
    });
    return pack;
  }

  /**
   * Hard delete. Admin-only at RLS; cascades to the pack's docs and their
   * revisions. Once publishing exists (P3) this must also refuse to delete a
   * pack with a live publication — deleting one would break a recipient's link.
   */
  async function deletePack(id, title) {
    await api.delete('dossier_packs', id);
    update(s => ({ ...s, packs: s.packs.filter(p => p.id !== id) }));
    logAudit('delete', 'dossier_pack', id, title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
    });
    logger('🗑 pack deleted', id);
  }

  // ── Docs ─────────────────────────────────────────────────────────────────

  /** Load the doc tree for a pack. Rows stay flat in state — buildTree() nests at render. */
  async function loadDocs(packId) {
    update(s => ({ ...s, activePackId: packId, loadingDocs: true, error: null }));
    try {
      const docs = await api.get('dossier_docs', {
        filters: { pack_id: packId },
        orderBy: 'order_index', ascending: true,
      });
      update(s => ({ ...s, docs, loadingDocs: false }));
      return docs;
    } catch (err) {
      update(s => ({ ...s, error: err.message, loadingDocs: false }));
      throw err;
    }
  }

  function closePack() {
    update(s => ({ ...s, activePackId: null, docs: [] }));
  }

  /**
   * Create a doc. The slug is derived here, once, from the titles already in
   * the pack — and is never recomputed on rename (see utils/slug.js).
   */
  async function createDoc({ packId, parentId = null, title }, userId, currentDocs = []) {
    const doc = await api.create('dossier_docs', {
      pack_id:       packId,
      parent_doc_id: parentId,
      title,
      slug:          uniqueSlug(title, currentDocs.map(d => d.slug)),
      order_index:   nextOrderIndex(currentDocs, parentId),
      created_by:    userId,
      ...touch(userId),
    }, true);

    update(s => ({ ...s, docs: [...s.docs, doc] }));
    logAudit('create', 'dossier_doc', doc.id, doc.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info',
      afterData: { pack_id: packId, parent_doc_id: parentId, slug: doc.slug },
    });
    return doc;
  }

  /** Rename only — the slug deliberately stays put so published links keep working. */
  async function renameDoc(id, title, userId) {
    const doc = await api.update('dossier_docs', id, { title, ...touch(userId) }, true);
    update(s => ({ ...s, docs: s.docs.map(d => d.id === id ? { ...d, ...doc } : d) }));
    logAudit('update', 'dossier_doc', id, title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info', afterData: { title },
    });
    return doc;
  }

  /** Admin-only at RLS. Cascades to the whole subtree and its revisions. */
  async function deleteDoc(id, title, removedIds = []) {
    await api.delete('dossier_docs', id);
    const gone = new Set([id, ...removedIds]);
    update(s => ({ ...s, docs: s.docs.filter(d => !gone.has(d.id)) }));
    logAudit('delete', 'dossier_doc', id, title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
    });
    logger('🗑 doc deleted', id);
  }

  /**
   * Persist a plan from docTree.planMove(). Takes the plan rather than raw
   * coordinates so the cycle and depth guards cannot be bypassed by a caller.
   * @param {{ ok: boolean, patches?: object[] }} plan
   */
  async function applyMove(plan, userId) {
    if (!plan?.ok || !plan.patches?.length) return;
    for (const patch of plan.patches) {
      const { id, ...fields } = patch;
      await api.update('dossier_docs', id, { ...fields, ...touch(userId) });
    }
    // Reflect the patches locally rather than refetching — the plan is already
    // the authoritative description of what changed.
    const byId = new Map(plan.patches.map(p => [p.id, p]));
    update(s => ({
      ...s,
      docs: s.docs.map(d => byId.has(d.id) ? { ...d, ...byId.get(d.id) } : d),
    }));
  }

  return {
    subscribe,
    loadPacks, createPack, updatePack, setArchived, deletePack,
    loadDocs, closePack, createDoc, renameDoc, deleteDoc, applyMove,
  };
}

export const dossierStore = createDossierStore();
