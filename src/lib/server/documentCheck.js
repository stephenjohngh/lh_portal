// src/lib/server/documentCheck.js
// Does each document_library row still stand for something? (2026-09-27)
//
// document_library is an INDEX: a row records where a file is and what it is
// attached to. It holds no foreign key to either, so a row can outlive both —
// its file deleted from Drive, or the record it was attached to deleted — and
// nothing lists it any differently. Admin → Document Demo showed two such rows
// on prod as if they were ordinary documents. This asks, per row:
//
//   owner — does the record it is attached to still exist?
//           'present' · 'missing' · 'loose' (attached to nothing, by design)
//           · 'unknown' (an entity type this portal does not recognise)
//   file  — is the file still in storage?
//           'present' · 'in_bin' · 'missing' · 'outside_folder'
//           · 'unchecked' (this storage cannot be checked) · 'error'
//
// ⛔ IT CHANGES NOTHING. It reports; a person decides, and deletes from the
// list if they choose. Nothing in the portal deletes on a timetable or on its
// own judgement (user, 2026-09-27).
// ⚠ It cannot find the opposite case — a file in Drive with no row — because
// it starts from the rows. Document Demo's help text says so.

import { ENTITY_PARENT_TABLE } from './documentAccess.js';

const OWNER_CHUNK = 100;       // ids per .in() — keeps the request URL short
const FILE_CONCURRENCY = 5;    // storage lookups in flight at once

/**
 * Whether each row's owning record still exists.
 * @param {any} db  a service-role Supabase client
 * @param {Array<{ id: string, entity_type?: string|null, entity_id?: string|null }>} docs
 * @returns {Promise<Map<string, 'present'|'missing'|'loose'|'unknown'>>}
 */
export async function checkOwners(db, docs) {
  /** @type {Map<string, 'present'|'missing'|'loose'|'unknown'>} */
  const out = new Map();
  /** @type {Map<string, Set<string>>} entity_type → the entity ids asked about */
  const wanted = new Map();

  for (const d of docs) {
    if (!d.entity_type) { out.set(d.id, 'loose'); continue; }
    if (!ENTITY_PARENT_TABLE[d.entity_type] || !d.entity_id) { out.set(d.id, 'unknown'); continue; }
    let set = wanted.get(d.entity_type);
    if (!set) { set = new Set(); wanted.set(d.entity_type, set); }
    set.add(d.entity_id);
  }

  /** @type {Map<string, Set<string>>} entity_type → the entity ids that exist */
  const found = new Map();
  for (const [type, idSet] of wanted) {
    const ids = [...idSet];
    const seen = new Set();
    for (let i = 0; i < ids.length; i += OWNER_CHUNK) {
      const { data, error } = await db.from(ENTITY_PARENT_TABLE[type])
        .select('id').in('id', ids.slice(i, i + OWNER_CHUNK));
      // ⛔ A failed lookup must not read as "deleted" — that is the one answer
      // that invites someone to delete the document.
      if (error) throw new Error(`Could not check ${ENTITY_PARENT_TABLE[type]}: ${error.message}`);
      for (const r of data ?? []) seen.add(r.id);
    }
    found.set(type, seen);
  }

  for (const d of docs) {
    if (out.has(d.id)) continue;
    const seen = found.get(d.entity_type ?? '');
    out.set(d.id, seen && d.entity_id && seen.has(d.entity_id) ? 'present' : 'missing');
  }
  return out;
}

/**
 * Whether each row's file is still in storage.
 * @param {Array<{ id: string, provider?: string|null, provider_file_id?: string|null }>} docs
 * @param {(doc: object) => any} providerFor  the provider that holds a row's file
 * @returns {Promise<Map<string, { status: string, detail?: string }>>}
 */
export async function checkFiles(docs, providerFor) {
  /** @type {Map<string, { status: string, detail?: string }>} */
  const out = new Map();

  async function one(d) {
    if (!d.provider_file_id) {
      out.set(d.id, { status: 'missing', detail: 'No file is recorded for this document.' });
      return;
    }
    let provider;
    try { provider = providerFor(d); }
    catch (/** @type {any} */ err) {
      out.set(d.id, { status: 'unchecked', detail: err?.message ?? String(err) });
      return;
    }
    if (typeof provider?.fileStatus !== 'function') {
      out.set(d.id, { status: 'unchecked', detail: 'This storage cannot be checked.' });
      return;
    }
    try {
      out.set(d.id, { status: await provider.fileStatus(d.provider_file_id) });
    } catch (/** @type {any} */ err) {
      out.set(d.id, { status: 'error', detail: err?.message ?? String(err) });
    }
  }

  const queue = [...docs];
  const workers = Array.from({ length: Math.min(FILE_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await one(queue.shift());
  });
  await Promise.all(workers);
  return out;
}

/**
 * Both checks, keyed by document id.
 * @param {any} db
 * @param {object[]} docs  document_library rows (id, entity_type, entity_id, provider, provider_file_id)
 * @param {(doc: object) => any} providerFor
 * @returns {Promise<Record<string, { owner: string, file: string, fileDetail?: string }>>}
 */
export async function checkDocuments(db, docs, providerFor) {
  const [owners, files] = await Promise.all([checkOwners(db, docs), checkFiles(docs, providerFor)]);
  /** @type {Record<string, { owner: string, file: string, fileDetail?: string }>} */
  const results = {};
  for (const d of docs) {
    const f = files.get(d.id) ?? { status: 'error', detail: 'Not checked.' };
    results[d.id] = {
      owner: owners.get(d.id) ?? 'unknown',
      file:  f.status,
      ...(f.detail ? { fileDetail: f.detail } : {}),
    };
  }
  return results;
}
