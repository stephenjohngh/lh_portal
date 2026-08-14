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
import {
  coerceRecordFields, templateFor, migrateRecordFields,
} from '../utils/datasetTemplates.js';
import { planPackCopy } from '../utils/packCopy.js';
import { buildSnapshot, buildManifest } from '../utils/snapshot.js';
import { generateToken, hashToken, tokenPrefix } from '../utils/publicationToken.js';
import { hashPassphrase } from '../utils/publicationPassphrase.js';

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
    datasets:     [],   // the pack's structured lists (chronology etc.)
    // EVERY record in the pack, not just the open table's. The broken-reference
    // check has to see rows in tables the author has not opened, and P3's
    // publish walk will need the same.
    records:      [],
    // Publications of the open pack. Loaded on demand — most editing sessions
    // never publish, and the list is the one place a live external link is
    // visible, so it should not be lying around unrequested.
    publications: [],
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

  /**
   * Read a pack's whole contents, without opening it.
   *
   * Deliberately not taken from `state`: duplicating happens from the pack
   * list, where the source pack is not the open one and the store holds another
   * pack's docs — or none.
   */
  async function readPackContents(packId) {
    const [docs, datasets, files] = await Promise.all([
      api.get('dossier_docs', {
        filters: { pack_id: packId }, orderBy: 'order_index', ascending: true,
      }),
      api.get('dossier_datasets', {
        filters: { pack_id: packId }, orderBy: 'created_at', ascending: true,
      }),
      listDocuments({ entity_type: 'dossier_pack', entity_id: packId })
        .catch(() => []),
    ]);

    const records = datasets.length
      ? await api.getAllIn('dossier_records', 'dataset_id', datasets.map(d => d.id))
      : [];

    return { docs, datasets, records, files };
  }

  /**
   * Duplicate a pack — the template workflow.
   *
   * The copy is INDEPENDENT: its own pages, its own tables, its own files. Not
   * one row of it points at the pack it came from, which is what makes a
   * template safe to reuse and what utils/packCopy.js exists to guarantee.
   *
   * Two things are deliberately left behind. Revisions: the copy starts with no
   * history rather than importing another author's edit trail. Publications: a
   * link is issued to a named person for a particular pack, and duplicating one
   * would be issuing it again to someone who was never told.
   *
   * ⚠ There is no transaction across these calls, and DELETE on packs and docs
   * is admin-only at RLS — so a non-admin cannot clear up a duplicate that
   * fails halfway. Hence the catch: the partial pack is archived and renamed so
   * it is out of the list and obviously not finished, rather than left looking
   * like a real pack the author might edit.
   *
   * @param {object} source - the pack row being copied
   * @param {{ title: string, includeRecords?: boolean, includeFiles?: boolean }} options
   * @param {string} userId
   */
  async function duplicatePack(source, options, userId) {
    const { title, includeRecords = false, includeFiles = false } = options ?? {};
    const sourceId = source.id;

    const contents = await readPackContents(sourceId);

    const pack = await createPack({
      title, description: source.description ?? null,
    }, userId);

    try {
      // ── Files first: the slow, failure-prone part, and the map every page
      //    rewrite depends on. Skipped entirely when the shelf is empty.
      /** @type {Map<string, { id: string, provider_file_id?: string }>} */
      let fileMap = new Map();
      let skippedFiles = [];

      if (includeFiles && contents.files.length) {
        const { postJson } = await import('$lib/utils/request');
        const result = await postJson('/api/dossier/copy-files', {
          sourcePackId: sourceId, targetPackId: pack.id,
        });
        fileMap = new Map(Object.entries(result?.map ?? {}));
        skippedFiles = result?.skipped ?? [];
      }

      const plan = planPackCopy(contents, {
        packId: pack.id, includeRecords, files: fileMap,
      });

      // One insert statement per table. Referential integrity is checked at the
      // end of the statement, so the pages' self-referencing parent_doc_id
      // resolves even though the parents are in the same batch.
      if (plan.docs.length) {
        await api.createMany('dossier_docs', plan.docs.map(d => ({
          ...d, created_by: userId, ...touch(userId),
        })), false);
      }
      if (plan.datasets.length) {
        await api.createMany('dossier_datasets', plan.datasets.map(d => ({
          ...d, created_by: userId, ...touch(userId),
        })), false);
      }
      if (plan.records.length) {
        await api.createMany('dossier_records', plan.records.map(r => ({
          ...r, created_by: userId, ...touch(userId),
        })), false);
      }

      // dossier_links is derived, and each page rebuilds its own rows the next
      // time it is saved — but backlinks read the table, so seeding it now is
      // the difference between a copy whose backlink panels work and one whose
      // panels are empty until every page has been opened and edited.
      const linkRows = plan.docs.flatMap(doc =>
        extractLinks(doc.blocks).map(link => ({
          ...link, pack_id: pack.id, from_doc_id: doc.id, created_by: userId,
        })));
      if (linkRows.length) {
        await api.createMany('dossier_links', linkRows, false)
          .catch(err => logger('⚠ link index not seeded (rebuilds on save)', err));
      }

      logAudit('create', 'dossier_pack', pack.id, pack.title, {
        appId: 'dossier', eventCategory: 'dossier', severity: 'info',
        afterData: {
          duplicated_from: sourceId, pages: plan.docs.length,
          tables: plan.datasets.length, entries: plan.records.length,
          files: fileMap.size,
        },
      });
      logger('📋 pack duplicated', sourceId, '→', pack.id);

      return { pack, plan, skippedFiles };
    } catch (err) {
      await setArchived(pack.id, true, userId).catch(() => {});
      await api.update('dossier_packs', pack.id,
        { title: `${title} — incomplete copy`, ...touch(userId) }, false).catch(() => {});
      update(s => ({
        ...s,
        packs: s.packs.map(p => p.id === pack.id
          ? { ...p, title: `${title} — incomplete copy` } : p),
      }));
      throw new Error(
        `The copy could not be completed: ${errMessage(err)}. The part that was ` +
        'created has been archived — an admin can delete it.');
    }
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

  // ── Datasets ─────────────────────────────────────────────────────────────
  // A dataset belongs to the pack, like the file shelf — one chronology,
  // referenced from wherever it is useful.

  async function loadDatasets(packId) {
    if (!packId) { update(s => ({ ...s, datasets: [] })); return []; }
    try {
      const datasets = await api.get('dossier_datasets', {
        filters: { pack_id: packId }, orderBy: 'created_at', ascending: true,
      });
      // Load every table's rows up front. A pack's tables are small, and the
      // broken-reference check cannot report on a table nobody has opened.
      const loaded = datasets.length
        ? await api.getAllIn('dossier_records', 'dataset_id', datasets.map(d => d.id))
        : [];

      // Carry values written under a superseded key onto the current one, ONCE,
      // here — so the editor, the renderer and the publish snapshot all see the
      // same shape and none of them has to know the old names. A row is only
      // rewritten in the database when the author next touches it.
      const keyOf = new Map(datasets.map(d => [d.id, d.key]));
      const records = loaded.map((r) => {
        const fields = migrateRecordFields(keyOf.get(r.dataset_id), r.fields ?? {});
        return fields === r.fields ? r : { ...r, fields };
      });

      update(s => ({ ...s, datasets, records }));
      return datasets;
    } catch (err) {
      // Non-fatal: a pack is still editable without its tables.
      logger('⚠ could not load datasets', err);
      update(s => ({ ...s, datasets: [] }));
      return [];
    }
  }

  async function createDataset(packId, key, userId) {
    const template = templateFor(key);
    if (!template) throw new Error(`Unknown dataset type: ${key}`);

    const dataset = await api.create('dossier_datasets', {
      pack_id: packId, key, title: template.title,
      created_by: userId, ...touch(userId),
    }, true);

    update(s => ({ ...s, datasets: [...s.datasets, dataset] }));
    logAudit('create', 'dossier_dataset', dataset.id, dataset.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'info',
      afterData: { pack_id: packId, key },
    });
    return dataset;
  }

  async function deleteDataset(id, title) {
    await api.delete('dossier_datasets', id);
    update(s => ({
      ...s,
      datasets: s.datasets.filter(d => d.id !== id),
      records: s.records.filter(r => r.dataset_id !== id),
    }));
    logAudit('delete', 'dossier_dataset', id, title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
    });
  }

  async function createRecord(dataset, fields, userId) {
    // Position is per-table, so count only this dataset's rows.
    const siblings = getState().records.filter(r => r.dataset_id === dataset.id);
    const position = siblings.length
      ? Math.max(...siblings.map(r => r.position ?? 0)) + 1
      : 0;

    const record = await api.create('dossier_records', {
      dataset_id: dataset.id,
      // Coerced against the template, so a stray key or a bad date never lands.
      fields: coerceRecordFields(dataset.key, fields),
      position,
      created_by: userId, ...touch(userId),
    }, true);

    update(s => ({ ...s, records: [...s.records, record] }));
    return record;
  }

  /**
   * Add several rows at once — one insert, not one per row.
   *
   * Positions continue from the end of the table in the order given, so a
   * pasted thread keeps its sequence for same-day messages that the date sort
   * cannot separate.
   *
   * @param {object} dataset
   * @param {{ fields: object, document_id?: string, doc_id?: string }[]} rows
   * @param {string} userId
   */
  async function createRecords(dataset, rows, userId) {
    if (!rows?.length) return [];

    const siblings = getState().records.filter(r => r.dataset_id === dataset.id);
    const base = siblings.length
      ? Math.max(...siblings.map(r => r.position ?? 0)) + 1
      : 0;

    const records = await api.createMany('dossier_records', rows.map((row, i) => ({
      dataset_id: dataset.id,
      fields: coerceRecordFields(dataset.key, row?.fields),
      // A row built from a shelf file points at that file, so the index entry
      // opens the document it describes.
      document_id: row?.document_id ?? null,
      doc_id: row?.doc_id ?? null,
      position: base + i,
      created_by: userId, ...touch(userId),
    })), true);

    update(s => ({ ...s, records: [...s.records, ...records] }));
    logAudit('create', 'dossier_record', dataset.id,
      `${records.length} entries in ${dataset.title}`, {
        appId: 'dossier', eventCategory: 'dossier', severity: 'info',
        afterData: { dataset_id: dataset.id, count: records.length },
      });
    return records;
  }

  async function updateRecord(dataset, id, patch, userId) {
    const body = { ...touch(userId) };
    if (patch.fields) body.fields = coerceRecordFields(dataset.key, patch.fields);
    if ('document_id' in patch) body.document_id = patch.document_id;
    if ('doc_id' in patch) body.doc_id = patch.doc_id;

    const record = await api.update('dossier_records', id, body, true);
    update(s => ({ ...s, records: s.records.map(r => r.id === id ? { ...r, ...record } : r) }));
    return record;
  }

  async function deleteRecord(id) {
    await api.delete('dossier_records', id);
    update(s => ({ ...s, records: s.records.filter(r => r.id !== id) }));
  }

  // ── Publications (P3) ────────────────────────────────────────────────────
  // The EXTERNAL boundary. Note what these methods do NOT do: none of them
  // reads a publication by token, and none is reachable without a session.
  // The recipient's path is a separate set of service-role endpoints that
  // share no code with this store — that separation is the guarantee.

  /**
   * The next version number for a pack, read from the DATABASE.
   *
   * Deliberately not derived from `state.publications`: that list is only
   * loaded when the author expands the Links section, which is collapsed by
   * default. Trusting it meant the second-ever publish of a pack computed
   * version 1 again and died on the unique constraint — after the files had
   * already been read and pinned.
   */
  async function nextPublicationVersion(packId) {
    const rows = await api.get('dossier_publications', {
      select: 'version', filters: { pack_id: packId },
      orderBy: 'version', ascending: false, limit: 1,
    });
    return (rows?.[0]?.version ?? 0) + 1;
  }

  /** Postgres unique-violation, however the client surfaces it. */
  function isVersionConflict(err) {
    const text = `${err?.code ?? ''} ${err?.message ?? ''}`;
    return text.includes('23505') || /duplicate key|already exists/i.test(text);
  }

  async function loadPublications(packId) {
    if (!packId) { update(s => ({ ...s, publications: [] })); return []; }
    const publications = await api.get('dossier_publications', {
      filters: { pack_id: packId }, orderBy: 'version', ascending: false,
    });
    update(s => ({ ...s, publications }));
    return publications;
  }

  /**
   * Freeze the pack and issue a link.
   *
   * Returns `{ publication, token }`. The TOKEN IS RETURNED ONCE AND NEVER
   * AGAIN — only its SHA-256 reaches the database. The caller must show it to
   * the author immediately; there is no recovery path but Regenerate.
   *
   * The caller passes the SNAPSHOT IT REVIEWED. This method deliberately does
   * not rebuild one: reading live store state here would mean the row persisted
   * is a different object from the list the author approved, and any store
   * mutation during the (multi-second) file pass would silently change what
   * goes out. For the one dialog whose purpose is to be authoritative about
   * what leaves the building, that invariant has to be structural.
   *
   * @param {object} input
   * @param {object} input.pack
   * @param {object} input.snapshot - the reviewed snapshot, built by the caller
   * @param {'snapshot'|'latest'} [input.mode]
   * @param {string} [input.title]
   * @param {string} [input.recipientLabel]
   * @param {string|null} [input.expiresAt]
   * @param {Record<string,string|null>} [input.checksums] - document_id → sha-256
   * @param {string} [input.passphrase] - optional second factor; hashed here
   * @param {string} userId
   */
  async function createPublication({
    pack, snapshot, mode = 'snapshot', title, recipientLabel = '',
    expiresAt = null, checksums = {}, passphrase = '', showContents = false,
  }, userId) {
    if (!snapshot) throw new Error('createPublication requires the reviewed snapshot.');
    const manifest = buildManifest(snapshot, checksums, { showContents });

    const token = generateToken();
    // Hashed in the author's browser, so the plaintext never travels except
    // when a recipient is actually answering it.
    const secret = passphrase ? await hashPassphrase(passphrase) : null;
    const tokenHash = await hashToken(token);

    const row = (version) => ({
      pack_id:         pack.id,
      version,
      title:           title || pack.title,
      recipient_label: recipientLabel || null,
      mode,
      token_hash:      tokenHash,
      token_prefix:    tokenPrefix(token),
      passphrase_hash: secret?.hash ?? null,
      passphrase_salt: secret?.salt ?? null,
      // 'latest' follows the live pack, so freezing a copy would be a lie about
      // what the recipient is seeing.
      snapshot:        mode === 'snapshot' ? snapshot : null,
      manifest,
      expires_at:      expiresAt,
      created_by:      userId, ...touch(userId),
    });

    // The unique (pack_id, version) constraint is the real guard against two
    // tabs racing. Re-read and retry once rather than surfacing a Postgres
    // error to an author whose files have already been pinned.
    let publication;
    try {
      publication = await api.create('dossier_publications',
        row(await nextPublicationVersion(pack.id)), true);
    } catch (err) {
      if (!isVersionConflict(err)) throw err;
      publication = await api.create('dossier_publications',
        row(await nextPublicationVersion(pack.id)), true);
    }
    const version = publication.version;

    update(s => ({ ...s, publications: [publication, ...s.publications] }));
    logAudit('create', 'dossier_publication', publication.id,
      `${publication.title} v${version}`, {
        appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
        afterData: {
          pack_id: pack.id, version, mode,
          expires_at: expiresAt, recipient_label: recipientLabel || null,
          // What was exposed, so the audit trail answers "what did that link
          // give them?" long after the pack has moved on.
          doc_count: manifest.doc_count, file_count: manifest.files.length,
          passphrase_protected: Boolean(secret),
        },
      });
    logger('🔗 publication issued', publication.id, 'v' + version);
    return { publication, token };
  }

  /** Kill a link. Deliberately not a delete — the record that it was issued survives. */
  async function revokePublication(id, userId) {
    const publication = await api.update('dossier_publications', id, {
      revoked_at: new Date().toISOString(), revoked_by: userId, ...touch(userId),
    }, true);

    update(s => ({
      ...s, publications: s.publications.map(p => p.id === id ? publication : p),
    }));
    logAudit('revoke', 'dossier_publication', id, publication.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
    });
    return publication;
  }

  /**
   * Remove a publication entirely — admin-only at RLS.
   *
   * Revoke is the everyday action and keeps the record that a link was issued.
   * This is the other one: it discards that record, and with it the pinned
   * copies of the files, which is the only thing that stops published storage
   * growing without bound.
   *
   * The pinned copies go first. If the row were deleted first, the ids of the
   * copies would go with it and the bytes would be orphaned in Drive with
   * nothing left pointing at them.
   */
  async function deletePublication(publication) {
    const pinned = (publication?.manifest?.files ?? [])
      .map(f => f.pinned_file_id).filter(Boolean);

    if (pinned.length) {
      const { del } = await import('$lib/utils/request');
      // Storage cleanup is best-effort, as it is everywhere else in the portal:
      // a copy that cannot be removed must not block the delete.
      await Promise.allSettled(pinned.map(id => del(`/api/media/file/${id}`)));
    }

    await api.delete('dossier_publications', publication.id);
    update(s => ({
      ...s, publications: s.publications.filter(p => p.id !== publication.id),
    }));
    logAudit('delete', 'dossier_publication', publication.id, publication.title, {
      appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
      afterData: { version: publication.version, pinned_removed: pinned.length },
    });
  }

  /**
   * Issue a new token for an existing publication, breaking the old link.
   *
   * The recovery path for a link the author lost, and the fast response to one
   * that reached the wrong inbox. The snapshot is untouched: the recipient who
   * gets the new link sees exactly what the old one showed.
   */
  async function regeneratePublicationToken(id, userId) {
    const token = generateToken();
    const publication = await api.update('dossier_publications', id, {
      token_hash: await hashToken(token), token_prefix: tokenPrefix(token),
      ...touch(userId),
    }, true);

    update(s => ({
      ...s, publications: s.publications.map(p => p.id === id ? publication : p),
    }));
    logAudit('update', 'dossier_publication', id,
      `${publication.title} — link regenerated`, {
        appId: 'dossier', eventCategory: 'dossier', severity: 'warning',
        afterData: { token_prefix: publication.token_prefix },
      });
    return { publication, token };
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
    update(s => ({
      ...s, activePackId: null, docs: [], files: [],
      datasets: [], records: [], publications: [],
    }));
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
    readPackContents, duplicatePack,
    loadDatasets, createDataset, deleteDataset,
    createRecord, createRecords, updateRecord, deleteRecord,
    loadDocs, closePack, loadPackFiles, createDoc, renameDoc, deleteDoc, applyMove, saveDocBlocks,
    saveVersion, loadRevisions, restoreRevision, loadBacklinks,
    loadPublications, createPublication, revokePublication, deletePublication,
    regeneratePublicationToken,
  };
}

export const dossierStore = createDossierStore();
