// src/lib/server/documentAccess.js
// May this caller list the documents attached to this thing?
//
// ── The hole this closes ─────────────────────────────────────────────────────
// `document_library` is shared infrastructure, and `listDocuments()` reads it
// with the SERVICE ROLE — so RLS does not apply. `GET /api/documents` checked
// only that the caller was signed in, which meant any authenticated portal user
// could ask for the attachments of any entity of any kind:
//
//     GET /api/documents?entity_type=dossier_pack&entity_id=<someone else's>
//
// and receive the filenames, descriptions and storage ids of another user's
// confidential shelf. Dossier is what made that urgent — packs are deliberately
// owner-scoped and hold client-confidential material — but the gap was never
// specific to it.
//
// ── The approach: ask the owning table, do not re-implement its rules ────────
// Every attachable entity already has a table with an RLS policy saying who may
// read it. So the check is: can the CALLER, with their own token, select the
// parent row? If yes, they may see what is attached to it. If no — or if the
// entity type is one we do not recognise — refuse.
//
// Re-implementing each app's permission logic here would mean two copies of
// every rule, drifting apart, with this one invisible to whoever changes the
// policy. Asking the database is the only version that cannot go stale.

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * entity_type → the table whose row `entity_id` names.
 *
 * Note `maintenance_document`: its entity_id is a maintenance JOB id, not a
 * document id. The name describes the attachment, not the parent — exactly the
 * sort of thing a hand-written mapping gets wrong, so it is spelled out.
 *
 * Anything absent from this map is refused. A new attachable entity therefore
 * fails closed until someone adds it deliberately, which is the right default
 * for a table holding every app's files.
 */
export const ENTITY_PARENT_TABLE = {
  dossier_pack:         'dossier_packs',
  info_note:            'info_notes',
  issue:                'issues',
  mor_case:             'mor_cases',
  gt_document:          'gt_documents',
  component_inspection: 'component_inspections',
  maintenance_document: 'maintenance_jobs',
};

/**
 * Columns a caller may edit through PATCH /api/documents/[id].
 *
 * An allow-list because the update spreads the patch straight into the row.
 * Without it an uploader could rewrite `entity_type` / `entity_id` — the very
 * columns authorisation is decided BY — and attach their file to somebody
 * else's pack; or overwrite `file_checksum` and destroy the baseline a
 * publication's drift detection depends on. Storage identity
 * (provider_file_id, filename, mime_type, file_size) is a fact about the bytes
 * and is not editable either.
 */
export const PATCHABLE_FIELDS = [
  'display_name', 'title', 'description', 'doc_type', 'category', 'tags',
  'document_date', 'expiry_date', 'reference_number', 'issuer',
];

/**
 * Keep only the editable columns.
 * @returns {{ patch: object, rejected: string[] }}
 */
export function sanitizeDocumentPatch(patch = {}) {
  const clean = {};
  const rejected = [];
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (PATCHABLE_FIELDS.includes(key)) clean[key] = value;
    else rejected.push(key);
  }
  return { patch: clean, rejected };
}

/** A client that speaks as the CALLER, so their RLS policies apply. */
function callerClient(token) {
  return createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

/** The caller's bearer token, or '' when there is none. */
export function bearerToken(request) {
  return request?.headers?.get?.('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

/**
 * Decide whether a document listing may proceed.
 *
 * @param {{ entity_type?: string, entity_id?: string }} query
 * @param {{ isAdmin: boolean, token: string }} caller
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function canListDocuments(query, { isAdmin, token }) {
  const entityType = query?.entity_type ?? '';
  const entityId   = query?.entity_id ?? '';

  // An unscoped listing is a browse of the whole library across every app.
  // Only the admin Documents tab does that, and only an admin should.
  if (!entityType || !entityId) {
    if (isAdmin) return { ok: true };
    return {
      ok: false, status: 403,
      message: 'Listing documents requires an entity_type and entity_id.',
    };
  }

  const table = ENTITY_PARENT_TABLE[entityType];
  if (!table) {
    // Fail closed on an unknown type — including for admins, because a typo
    // silently returning nothing is better than a new entity type being
    // reachable before anyone has decided who may see it.
    return { ok: false, status: 403, message: 'Not permitted.' };
  }

  // Admins can read every parent table anyway, so this is a shortcut, not an
  // exception: it saves a round trip and returns the same answer.
  if (isAdmin) return { ok: true };
  if (!token)  return { ok: false, status: 401, message: 'Unauthorized' };

  const { data, error } = await callerClient(token)
    .from(table).select('id').eq('id', entityId).maybeSingle();

  // RLS returning no row is indistinguishable from the row not existing, which
  // is the behaviour we want: the caller learns nothing either way.
  if (error || !data) return { ok: false, status: 403, message: 'Not permitted.' };
  return { ok: true };
}

/**
 * May this caller see ONE document's metadata?
 *
 * The same question as canListDocuments, asked of a row already fetched. It
 * exists because the by-id route is the other way to reach the same data —
 * and `select('*')` there returns `provider_file_id`, which is all anyone needs
 * to pull the bytes from the unauthenticated media proxy. Gating the list and
 * leaving this open would have closed the front door only.
 *
 * @param {{ entity_type?: string, entity_id?: string }} doc
 * @param {{ isAdmin: boolean, token: string }} caller
 */
export async function canAccessDocument(doc, caller) {
  return canListDocuments(
    { entity_type: doc?.entity_type, entity_id: doc?.entity_id }, caller);
}
