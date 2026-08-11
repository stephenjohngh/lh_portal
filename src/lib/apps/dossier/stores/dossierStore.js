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

import { writable, get } from 'svelte/store';
import { api }          from '$lib/utils/api';
import { logAudit }     from '$lib/utils/auditLogger';
import { getLogger }    from '$lib/utils/logger';
import { listDocuments } from '$lib/utils/documentApi';
import { uniqueSlug }   from '../utils/slug.js';
import { nextOrderIndex } from '../utils/docTree.js';
import { extractLinks, diffLinks, linkSignature, groupBacklinks } from '../utils/docLinks.js';
import { findBrokenReferences } from '../utils/brokenRefs.js';

const logger = getLogger('dossierStore');

/**
 * Revision policy (plan §2). Both are PRODUCT rules and deliberately live here
 * rather than in SQL, so they can be tuned without a migration.
 */
export const REVISION_CAP = 20;
/** Autosaves inside this window reuse the last snapshot instead of making a new one. */
export const REVISION_INTERVAL_MS = 5 * 60 * 1000;

/**
 * When each doc last had a revision written, in memory only. A page reload
 * simply means the next save snapshots again — harmless, and much cheaper than
 * querying the revision table on every autosave.
 * @type {Map<string, number>}
 */
const lastRevisionAt = new Map();

/**
 * The reference signature last written to dossier_links per doc. Lets an
 * autosave that only changed prose skip the reconcile query entirely.
 * @type {Map<string, string>}
 */
const lastLinkSignature = new Map();

/** Most-recently-touched first; a pack that has never been edited falls back to its creation time. */
function sortPacks(packs) {
  return [...packs].sort((a, b) =>
    new Date(b.updated_at ?? b.created_at).getTime() -
    new Date(a.updated_at ?? a.created_at).getTime()
  );
}

/** A caught value is `unknown`; narrow it to a message without asserting a type. */
function errMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Stamp the audit columns carried on every write (portal convention). */
function touch(userId) {
  return { updated_by: userId, updated_at: new Date().toISOString() };
}

/**
 * Typing the state is what stops TypeScript inferring `never[]` for the empty
 * arrays and then rejecting every real row assigned to them — the pattern
 * CLAUDE.md prescribes for portal stores. It also propagates Row types to
 * consumers.
 *
 * @typedef {import('$lib/database.types').Tables<'dossier_packs'>} Pack
 * @typedef {import('$lib/database.types').Tables<'dossier_docs'>} Doc
 * @typedef {import('$lib/database.types').Tables<'dossier_doc_revisions'>} DocRevision
 * @typedef {import('$lib/database.types').Tables<'document_library'>} LibraryFile
 * @typedef {{
 *   packs: Pack[], loading: boolean, error: string|null,
 *   activePackId: string|null, docs: Doc[], loadingDocs: boolean,
 *   files: LibraryFile[]
 * }} DossierState
 */

function createDossierStore() {
  const store = writable(/** @type {DossierState} */ ({
    packs:        [],
    loading:      false,
    error:        null,
    // Docs for the pack currently open in the workspace.
    activePackId: null,
    docs:         [],
    loadingDocs:  false,
    files:        [],   // document_library rows on this pack's shelf
  }));

  const { subscribe, update } = store;
  /** Read current state — needed to snapshot a doc's OUTGOING content on save. */
  const getState = () => get(store);

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
      update(s => ({ ...s, error: errMessage(err), loading: false }));
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

  // ── Pack files (the shelf) ───────────────────────────────────────────────
  // AttachedDocuments keeps its own copy for the panel it renders; this list
  // exists so the asset picker — and, at step 5, the broken-reference panel —
  // can see the shelf without reaching into that component.

  async function loadPackFiles(packId) {
    if (!packId) { update(s => ({ ...s, files: [] })); return []; }
    try {
      const files = await listDocuments({
        entity_type: 'dossier_pack', entity_id: packId,
      });
      update(s => ({ ...s, files }));
      return files;
    } catch (err) {
      // Non-fatal: a pack is still perfectly editable without its shelf.
      logger('⚠ could not load pack files', err);
      update(s => ({ ...s, files: [] }));
      return [];
    }
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
      update(s => ({ ...s, error: errMessage(err), loadingDocs: false }));
      throw err;
    }
  }

  function closePack() {
    update(s => ({ ...s, activePackId: null, docs: [], files: [] }));
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

  /**
   * Persist a doc's block content. Called on an autosave debounce, so it is
   * deliberately quiet: no audit entry per keystroke-batch (the revision
   * history is the record of what changed).
   *
   * Snapshots the OUTGOING content first, at most once per REVISION_INTERVAL_MS
   * (or always, when the caller supplies a summary via saveVersion). A revision
   * therefore holds a PRIOR state you can return to; the live row is the
   * current state.
   *
   * @param {{ summary?: string, force?: boolean }} [opts]
   */
  async function saveDocBlocks(id, blocks, userId, opts = {}) {
    const state = getState();
    const previous = state.docs.find(d => d.id === id) ?? null;

    const last = lastRevisionAt.get(id);
    const due  = last === undefined || (Date.now() - last) > REVISION_INTERVAL_MS;
    if (previous && (opts.force || opts.summary || due)) {
      await snapshot(previous, userId, opts.summary ?? null);
    }

    const doc = await api.update('dossier_docs', id, { blocks, ...touch(userId) }, true);
    update(s => ({ ...s, docs: s.docs.map(d => d.id === id ? { ...d, ...doc } : d) }));

    // Derived index, updated after the content it describes is safely stored.
    await reconcileLinks({ ...doc, blocks, pack_id: doc.pack_id ?? previous?.pack_id }, userId);
    return doc;
  }

  /** Write one revision of a doc's current content, then prune to the cap. */
  async function snapshot(doc, userId, summary) {
    await api.create('dossier_doc_revisions', {
      doc_id:     doc.id,
      title:      doc.title,
      blocks:     doc.blocks ?? { type: 'doc', content: [] },
      summary,
      created_by: userId,
    });
    lastRevisionAt.set(doc.id, Date.now());
    await pruneRevisions(doc.id);
  }

  /**
   * Keep only the newest REVISION_CAP revisions. Deleting is permitted by
   * migration 173; UPDATE is still denied, so a snapshot can be pruned but
   * never rewritten.
   */
  async function pruneRevisions(docId) {
    try {
      const rows = await api.get('dossier_doc_revisions', {
        select: 'id', filters: { doc_id: docId },
        orderBy: 'created_at', ascending: false,
      });
      for (const row of rows.slice(REVISION_CAP)) {
        await api.delete('dossier_doc_revisions', row.id);
      }
    } catch (err) {
      // Pruning is housekeeping — never fail a save because of it.
      logger('⚠ could not prune revisions', err);
    }
  }

  /** Explicit "save a version" with an author-written summary. */
  async function saveVersion(id, blocks, userId, summary) {
    return saveDocBlocks(id, blocks, userId, { summary, force: true });
  }

  /** Newest first. Not held in store state — the history modal is transient. */
  async function loadRevisions(docId) {
    return api.get('dossier_doc_revisions', {
      select: 'id, doc_id, title, summary, created_at, created_by, blocks',
      filters: { doc_id: docId },
      orderBy: 'created_at', ascending: false,
    });
  }

  /**
   * Put a doc back to an earlier snapshot. The current content is snapshotted
   * first, so a restore is itself undoable.
   */
  async function restoreRevision(docId, revision, userId) {
    const doc = await saveDocBlocks(docId, revision.blocks, userId, {
      force: true,
      summary: `Restored the version from ${new Date(revision.created_at).toISOString()}`,
    });
    logAudit('restore', 'dossier_doc', docId, doc.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info',
      afterData: { restored_revision_id: revision.id },
    });
    return doc;
  }

  // ── Link graph ───────────────────────────────────────────────────────────

  /**
   * Bring dossier_links into line with what a page now references.
   *
   * Called on every save, so it is built to do NOTHING most of the time: the
   * extracted signature is compared against the last one reconciled for this
   * doc, and an unchanged set returns before touching the database at all.
   * Only when the signature moves does it fetch and diff.
   */
  async function reconcileLinks(doc, userId) {
    if (!doc?.id) return;
    const extracted = extractLinks(doc.blocks);
    const signature = linkSignature(extracted);
    if (lastLinkSignature.get(doc.id) === signature) return;

    try {
      const existing = await api.get('dossier_links', {
        select: 'id, from_block_id, target_kind, target_doc_id, target_document_id',
        filters: { from_doc_id: doc.id },
      });
      const { toInsert, toDeleteIds } = diffLinks(existing, extracted);

      if (toDeleteIds.length) {
        for (const id of toDeleteIds) await api.delete('dossier_links', id);
      }
      if (toInsert.length) {
        await api.createMany('dossier_links', toInsert.map(link => ({
          ...link,
          pack_id:     doc.pack_id,
          from_doc_id: doc.id,
          created_by:  userId,
        })));
      }
      lastLinkSignature.set(doc.id, signature);
    } catch (err) {
      // The graph is derived and rebuildable; a failure here must never cost
      // the author their content. Drop the cached signature so the next save
      // retries rather than assuming the write landed.
      lastLinkSignature.delete(doc.id);
      logger('⚠ could not reconcile links', err);
    }
  }

  /**
   * Every reference in the pack that no longer resolves. Computed from the
   * link graph against the pages and shelf currently in state, so it reflects
   * a deletion the moment it happens.
   */
  async function loadBrokenReferences(packId) {
    const links = await api.get('dossier_links', {
      select: 'from_doc_id, from_block_id, target_kind, target_doc_id, target_doc_ref, target_document_id',
      filters: { pack_id: packId },
    });
    const { docs, files } = getState();
    return findBrokenReferences(links, docs, files);
  }

  /** Pages that reference this one, one entry each. */
  async function loadBacklinks(docId) {
    const rows = await api.get('dossier_links', {
      select: 'from_doc_id, from_block_id, from_doc:dossier_docs!from_doc_id(title, slug)',
      filters: { target_doc_id: docId },
    });
    return groupBacklinks(rows);
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
    loadDocs, closePack, loadPackFiles, createDoc, renameDoc, deleteDoc, applyMove, saveDocBlocks,
    saveVersion, loadRevisions, restoreRevision, loadBacklinks, loadBrokenReferences,
  };
}

export const dossierStore = createDossierStore();
