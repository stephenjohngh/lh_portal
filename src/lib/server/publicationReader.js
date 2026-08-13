// src/lib/server/publicationReader.js
// The ONLY server-side path from a publication token to content.
//
// ── Why this module exists at all ────────────────────────────────────────────
// The external guarantee ("this link reaches their pack and nothing else") is
// structural, not a promise: the recipient's request has no session, no anon
// key, and no query of its own. It arrives here with a token and leaves with a
// pack, and the code in between can express nothing else.
//
// That only holds if there is exactly one such path. So:
//
//   * NOTHING here imports from src/lib/apps/dossier/stores — those are the
//     authoring side and are RLS-scoped to a logged-in owner. Reusing one
//     "for convenience" is precisely how this guarantee would be lost.
//   * Every query below is filtered by an id taken from the publication row
//     itself, never from anything the caller supplied.
//   * Failure is closed and indistinguishable — see readerRefusal().
//
// It runs with the SERVICE ROLE, which bypasses RLS. That is deliberate and is
// why the two rules above are not stylistic.

import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { hashToken, isWellFormedToken } from '$lib/apps/dossier/utils/publicationToken.js';
import { isServable, READER_REFUSAL }   from '$lib/apps/dossier/utils/publicationState.js';
import { buildSnapshot, buildManifest } from '$lib/apps/dossier/utils/snapshot.js';

let _svc = null;
function svc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  return _svc;
}

/**
 * The one refusal. Every failure — malformed token, no such token, revoked,
 * expired — produces this identical value.
 *
 * A caller probing links must not be able to tell them apart: "revoked" and
 * "not found" differ only in whether a pack exists, which is exactly the fact
 * an unguessable link is meant to hide. Callers must not add a more helpful
 * message for any individual case.
 */
export function readerRefusal() {
  return { ok: false, message: READER_REFUSAL };
}

/**
 * Look up a publication by its token and decide whether to serve it.
 *
 * @param {string} token - straight from the URL, untrusted
 * @param {Date|number} [now]
 * @returns {Promise<{ ok: true, publication: object } | { ok: false, message: string }>}
 */
export async function findServablePublication(token, now = Date.now()) {
  // Shape first, so a malformed path segment costs a regex rather than a query.
  if (!isWellFormedToken(token)) return readerRefusal();

  const { data, error } = await svc()
    .from('dossier_publications')
    // Explicit column list, not '*': token_hash and passphrase_hash have no
    // business travelling further into the request than this module.
    .select('id, pack_id, version, title, mode, snapshot, manifest, '
      + 'passphrase_hash, passphrase_salt, expires_at, revoked_at, created_at')
    .eq('token_hash', await hashToken(token))
    .maybeSingle();

  if (error || !data) return readerRefusal();
  // isServable fails closed on a missing row, and this is the call site that
  // matters — a token nobody issued.
  if (!isServable(data, now)) return readerRefusal();

  return { ok: true, publication: data };
}

/**
 * The content a publication serves.
 *
 * 'snapshot' — the frozen jsonb, returned as stored. Nothing is queried at all,
 *              which is the strongest form of the isolation guarantee: there is
 *              no live table in the request path.
 *
 * 'latest'   — rebuilt from the pack. Still isolated, because every filter is
 *              `publication.pack_id`, read from the row the token resolved to.
 *              The caller cannot influence which pack is read.
 *
 * @param {object} publication - as returned by findServablePublication
 * @returns {Promise<object|null>} a snapshot-shaped object
 */
export async function readPublicationContent(publication) {
  if (publication?.mode !== 'latest') return publication?.snapshot ?? null;

  const packId = publication.pack_id;      // from the row, never from the caller
  const db = svc();

  const [{ data: pack }, { data: docs }, { data: datasets }] = await Promise.all([
    db.from('dossier_packs').select('id, title, description').eq('id', packId).maybeSingle(),
    db.from('dossier_docs')
      .select('id, slug, title, parent_id, order_index, blocks')
      .eq('pack_id', packId).order('order_index', { ascending: true }),
    db.from('dossier_datasets').select('id, key, title').eq('pack_id', packId),
  ]);

  if (!pack) return null;

  const datasetIds = (datasets ?? []).map(d => d.id);
  const { data: records } = datasetIds.length
    ? await db.from('dossier_records')
        .select('id, dataset_id, fields, position, document_id, doc_id')
        .in('dataset_id', datasetIds)
    : { data: [] };

  const { data: files } = await db.from('document_library')
    .select('id, filename, display_name, description, mime_type, file_size, provider_file_id')
    .eq('entity_type', 'dossier_pack').eq('entity_id', packId);

  return buildSnapshot({
    pack,
    docs:     docs ?? [],
    datasets: datasets ?? [],
    records:  records ?? [],
    files:    files ?? [],
  });
}

/**
 * The manifest to check an asset request against.
 *
 * 'snapshot' — the one stored at publish time. It describes exactly the frozen
 *              content, which is the whole point.
 *
 * 'latest'   — rebuilt from current content. A follow-latest link promises the
 *              recipient the current pack, so a file added since publication
 *              must be reachable; checking against the publish-time manifest
 *              would serve a page whose own images 404.
 *
 * Either way the manifest stays an ALLOW-LIST derived from what the content
 * references — never "every file on the shelf".
 *
 * @param {object} publication
 * @returns {Promise<object>}
 */
export async function resolveManifest(publication) {
  if (publication?.mode !== 'latest') return publication?.manifest ?? { files: [] };

  const content = await readPublicationContent(publication);
  if (!content) return { files: [] };
  // No checksums: a follow-latest link makes no immutability promise, so there
  // is no baseline to compare against and inventing one would be misleading.
  return buildManifest(content);
}

/**
 * Remove every storage id before content leaves for a recipient.
 *
 * ── Why this is not optional ─────────────────────────────────────────────────
 * `/api/media/file/:id` is unauthenticated, on the stated grounds that a
 * provider file id is unguessable and a caller would need authenticated DB
 * access to learn one. Handing the recipient a snapshot containing
 * `provider_file_id` destroys that premise outright: they could fetch every
 * file in the pack directly, for ever — including after the link was revoked
 * or expired.
 *
 * Revocation would then mean nothing, and revocation is most of the point of
 * the phase. So the ids do not travel. A recipient's page addresses files by
 * `document_id` through their own token-scoped endpoint, which resolves the
 * storage id from the manifest server-side and re-checks the publication each
 * time.
 *
 * Note this strips the cached copy on each asset BLOCK as well as the shelf
 * list — the block attrs carry their own, and stripping only the obvious one
 * would leave the hole open.
 *
 * @param {object|null} content - a snapshot-shaped object
 */
export function stripStorageIds(content) {
  if (!content) return content;

  const scrubNode = (node) => {
    if (!node || typeof node !== 'object') return node;
    const next = node.type === 'asset' && node.attrs
      ? { ...node, attrs: { ...node.attrs, provider_file_id: '' } }
      : node;
    if (!Array.isArray(next.content)) return next;
    return { ...next, content: next.content.map(scrubNode) };
  };

  return {
    ...content,
    docs: (content.docs ?? []).map(doc => ({ ...doc, blocks: scrubNode(doc.blocks) })),
    files: (content.files ?? []).map(({ provider_file_id, ...rest }) => rest),
  };
}

/**
 * What the reader page is allowed to know about the publication itself.
 *
 * Deliberately narrow. The recipient needs the title and whether it expires;
 * they have no business knowing the pack id, the version history, who issued
 * it, or that a manifest exists.
 */
export function publicPublicationFields(publication) {
  return {
    title:      publication.title,
    mode:       publication.mode,
    expires_at: publication.expires_at ?? null,
    issued_at:  publication.created_at ?? null,
  };
}
