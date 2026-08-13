// src/lib/apps/dossier/utils/snapshot.js
// Freezing a pack for publication — pure, Type-1 testable, no DB and no crypto.
//
// The snapshot is what the external reader renders. It must be SELF-CONTAINED:
// everything renderBlocksToHtml() needs is inside it, so the reader never has
// cause to reach for a live table. That property is not a nicety — it is the
// whole external-boundary guarantee expressed as a data shape, and it is what
// the tests in snapshot.test.js exist to hold.
//
// Deliberately excluded: revisions (history is internal), links (an index over
// the blocks, derivable and not needed to render), and anything about the
// author. A recipient gets the pack, not the workings.

/** Bumped only when the reader must be able to refuse an older shape. */
export const SNAPSHOT_FORMAT = 1;

/** Fields of a page the reader needs. `blocks` is the content itself. */
function snapshotDoc(doc) {
  return {
    id:          doc.id,
    slug:        doc.slug,
    title:       doc.title,
    parent_id:   doc.parent_id ?? null,
    order_index: doc.order_index ?? 0,
    blocks:      doc.blocks ?? null,
  };
}

/**
 * Fields of a shelf file the reader needs.
 *
 * `provider_file_id` is carried because the token-scoped asset endpoint
 * addresses storage by it — but note it is only ever read from the MANIFEST,
 * never from a URL the recipient supplies.
 */
function snapshotFile(file) {
  return {
    id:               file.id,
    filename:         file.filename ?? '',
    display_name:     file.display_name ?? '',
    description:      file.description ?? '',
    mime_type:        file.mime_type ?? '',
    file_size:        Number(file.file_size) || 0,
    provider_file_id: file.provider_file_id ?? '',
  };
}

/**
 * Build the frozen pack.
 *
 * @param {object} input
 * @param {object} input.pack
 * @param {object[]} input.docs
 * @param {object[]} input.datasets
 * @param {object[]} input.records
 * @param {object[]} input.files
 * @param {string} [input.generatedAt] - injected so tests are deterministic
 * @returns {object}
 */
export function buildSnapshot({
  pack, docs = [], datasets = [], records = [], files = [], generatedAt,
} = {}) {
  const datasetIds = new Set(datasets.map(d => d.id));

  return {
    format: SNAPSHOT_FORMAT,
    generated_at: generatedAt ?? new Date().toISOString(),
    pack: {
      id:          pack?.id ?? null,
      title:       pack?.title ?? 'Untitled pack',
      description: pack?.description ?? '',
    },
    // Sorted so two publications of an unchanged pack produce identical bytes —
    // which is what makes a snapshot diffable and a checksum meaningful.
    docs: [...docs]
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(snapshotDoc),
    datasets: datasets.map(d => ({ id: d.id, key: d.key, title: d.title })),
    // Records whose table did not make it in would render nowhere and would be
    // data leaving the portal for no reason.
    records: records
      .filter(r => datasetIds.has(r.dataset_id))
      .map(r => ({
        id:          r.id,
        dataset_id:  r.dataset_id,
        fields:      r.fields ?? {},
        position:    r.position ?? 0,
        document_id: r.document_id ?? null,
        doc_id:      r.doc_id ?? null,
      })),
    files: files.map(snapshotFile),
  };
}

/**
 * Every file id a snapshot's content actually refers to.
 *
 * Walks the blocks and the table rows rather than trusting the shelf, because
 * the manifest is an ALLOW-LIST for the asset endpoint: a shelf file nobody
 * referenced should not become reachable through a published link.
 *
 * @param {object} snapshot
 * @returns {Set<string>}
 */
export function referencedFileIds(snapshot) {
  const ids = new Set();

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'asset' && node.attrs?.document_id) ids.add(node.attrs.document_id);
    if (Array.isArray(node.content)) for (const child of node.content) walk(child);
  };

  for (const doc of snapshot?.docs ?? []) walk(doc.blocks);
  for (const record of snapshot?.records ?? []) {
    if (record.document_id) ids.add(record.document_id);
  }
  return ids;
}

/**
 * The manifest: exactly what a publication exposes.
 *
 * Read on every asset request. A file id absent from here is refused even with
 * a valid token, so a link cannot be walked outwards into the rest of the
 * shelf — the difference between "this link reaches their pack" and "this link
 * reaches the pack, and anything else the author happens to have uploaded".
 *
 * Checksums are supplied by the caller, which computes them from the bytes at
 * publish time. They are NOT read from document_library.file_checksum: that
 * column exists but the shared upload route does not populate it (only the
 * Golden Thread does, for its own flow), so relying on it would leave most
 * files with no baseline at all.
 *
 * `pinned_file_id`, where present, is a copy of the bytes taken at publish time
 * (P3 step 6). The asset endpoint prefers it, which is what makes a snapshot
 * publication genuinely immutable rather than merely labelled so.
 *
 * @param {object} snapshot
 * @param {Record<string, { checksum?: string|null, pinned_file_id?: string|null }>} [assets]
 *        keyed by document_id
 */
export function buildManifest(snapshot, assets = {}) {
  const referenced = referencedFileIds(snapshot);
  const byId = new Map((snapshot?.files ?? []).map(f => [f.id, f]));

  const files = [...referenced]
    .filter(id => byId.has(id))
    .sort()
    .map(id => {
      const file = byId.get(id);
      return {
        document_id:      id,
        provider_file_id: file.provider_file_id ?? '',
        filename:         file.display_name || file.filename || 'File',
        mime_type:        file.mime_type ?? '',
        file_size:        file.file_size ?? 0,
        checksum:         assets[id]?.checksum ?? null,
        pinned_file_id:   assets[id]?.pinned_file_id ?? null,
      };
    });

  return {
    format: SNAPSHOT_FORMAT,
    doc_count:     (snapshot?.docs ?? []).length,
    dataset_count: (snapshot?.datasets ?? []).length,
    record_count:  (snapshot?.records ?? []).length,
    files,
    // A referenced file that is no longer on the shelf. Recorded rather than
    // silently dropped: the author reviewing what they are about to send needs
    // to see that a page points at something the recipient will not receive.
    missing_file_ids: [...referenced].filter(id => !byId.has(id)).sort(),
  };
}

/**
 * Prepare a publication's files: checksum them, and pin a copy when the
 * publication is a frozen one.
 *
 * Called at PUBLISH, not when the review opens — pinning at review time would
 * leave an orphaned copy behind every time an author looked and thought better
 * of it, and a checksum is only meaningful measured at the moment the
 * publication is created.
 *
 * Keyed by `document_id` on the way out, because that is what the manifest
 * uses; the endpoint works in `provider_file_id`, which is what storage
 * understands. Never throws — a publication with a known gap, shown to the
 * author, beats one that will not go out.
 *
 * @param {object[]} files - the snapshot's file entries
 * @param {{ pin?: boolean }} [opts]
 * @returns {Promise<Record<string, { checksum: string|null, pinned_file_id: string|null }>>}
 */
export async function prepareAssets(files = [], { pin = false } = {}) {
  const usable = files.filter(f => f.provider_file_id);
  if (!usable.length) return {};

  try {
    const { postJson } = await import('$lib/utils/request');
    const body = await postJson('/api/dossier/publish-assets', {
      pin,
      files: usable.map(f => ({
        providerFileId: f.provider_file_id,
        filename: f.display_name || f.filename || 'file',
        mimeType: f.mime_type ?? '',
      })),
    }, 'Could not read the files');

    const out = {};
    for (const file of usable) {
      out[file.id] = body?.assets?.[file.provider_file_id]
        ?? { checksum: null, pinned_file_id: null };
    }
    return out;
  } catch {
    return {};
  }
}

/** Is this file id allowed through this publication's asset endpoint? */
export function manifestAllows(manifest, documentId) {
  if (!documentId) return false;
  return (manifest?.files ?? []).some(f => f.document_id === documentId);
}

/** The manifest entry for a file id, or null. */
export function manifestEntry(manifest, documentId) {
  return (manifest?.files ?? []).find(f => f.document_id === documentId) ?? null;
}

/**
 * The author's inclusion review (merge doc §6.2, decision #4).
 *
 * There is no redaction in v1 — the control is author diligence alone — so the
 * one thing the app owes the author is a complete, plainly-worded list of what
 * a link will expose, BEFORE it is issued. This builds it.
 *
 * @param {object} snapshot
 * @param {object} manifest
 */
export function describeInclusion(snapshot, manifest) {
  const docs = snapshot?.docs ?? [];
  const datasets = snapshot?.datasets ?? [];
  const records = snapshot?.records ?? [];
  const files = manifest?.files ?? [];

  const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  return {
    pages:  docs.map(d => ({ id: d.id, title: d.title })),
    tables: datasets.map(d => ({
      id: d.id, title: d.title,
      records: records.filter(r => r.dataset_id === d.id).length,
    })),
    files: files.map(f => ({
      document_id: f.document_id, filename: f.filename, size: f.file_size,
    })),
    missing: manifest?.missing_file_ids ?? [],
    summary: [
      count(docs.length, 'page'),
      count(datasets.length, 'table'),
      count(files.length, 'file'),
    ].join(' · '),
  };
}
