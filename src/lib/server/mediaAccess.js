// src/lib/server/mediaAccess.js
// Who may VIEW a stored file through /api/media/file/:id, and who may DELETE
// one through DELETE /api/media/file (security review, 2026-09-27).
//
// ── Viewing ──────────────────────────────────────────────────────────────────
// The proxy serves <img src> and plain links, which cannot carry the bearer
// token the rest of the API uses (it lives in localStorage). It used to be
// unauthenticated on the grounds that a file id is unguessable — and it would
// fetch ANY id the Drive credential could read, including files that are not
// the portal's, and an id once seen worked for ever. Now:
//
//   1. a MEDIA SESSION COOKIE, set by POST /api/auth/media-session from a
//      verified bearer token: HttpOnly (a script cannot read it), path-scoped
//      to /api/media, HMAC-signed, 12 hours, renewed with every token refresh.
//      It carries only the user id and an expiry; the profile is re-read on
//      every request, so deleting a user stops their files at once;
//   2. the id must be one the PORTAL knows — a document_library,
//      media_attachments or maintenance_documents row names it;
//   3. a parking licence (document_library, entity_type parking_agreement)
//      needs the Parking grant, as the table itself does (migration 227).
//
// ── Deleting ─────────────────────────────────────────────────────────────────
// Any logged-in account could permanently delete any storage file by URL. Now
// a file may be deleted only when:
//   · no document_library row names it — library documents are deleted from
//     the library (DELETE /api/documents/:id), by an administrator;
//   · at least one media_attachments / maintenance_documents row names it;
//   · the caller is an admin, or created EVERY row that names it — so inserting
//     a row pointing at someone else's photo does not make it yours to delete.
//
// ⚠ Pure decisions over plain data, so they are tested without a database;
// the two loaders take the client as an argument for the same reason.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

export const MEDIA_COOKIE          = 'lh_media';
export const MEDIA_COOKIE_PATH     = '/api/media';
export const MEDIA_SESSION_SECONDS = 12 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key() {
  // A key of its own, derived from the service-role secret with a label, so it
  // is never interchangeable with the upload-URL signature (urlSignature.js).
  return createHash('sha256')
    .update('lh-portal:media-session:' + (env.SUPABASE_SERVICE_ROLE_KEY ?? ''))
    .digest();
}

const sign = (payload) => createHmac('sha256', key()).update(payload).digest('hex');

/**
 * The cookie value for a user: `<uuid>.<expiry seconds>.<hmac>`.
 * @param {string} userId
 * @param {number} [nowMs]
 */
export function mediaSessionValue(userId, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + MEDIA_SESSION_SECONDS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * The user id a cookie value vouches for, or null if it is missing, malformed,
 * expired or not ours.
 * @param {string|null|undefined} value
 * @param {number} [nowMs]
 * @returns {string|null}
 */
export function readMediaSession(value, nowMs = Date.now()) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [userId, expText, sig] = parts;
  if (!UUID.test(userId) || !/^\d{1,12}$/.test(expText) || !/^[0-9a-f]{64}$/.test(sig)) return null;
  if (Number(expText) * 1000 <= nowMs) return null;
  const expected = Buffer.from(sign(`${userId}.${expText}`), 'hex');
  const supplied = Buffer.from(sig, 'hex');
  return timingSafeEqual(expected, supplied) ? userId : null;
}

/** Escape LIKE's wildcards so a file id matches only itself. */
function likeContaining(ref) {
  return `%${String(ref).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * @typedef {{
 *   library:     Array<{ id: string, entity_type: string|null, filename?: string|null, display_name?: string|null, mime_type?: string|null }>,
 *   media:       Array<{ id: string, created_by: string|null, filename?: string|null, mime_type?: string|null }>,
 *   maintenance: Array<{ id: string, uploaded_by: string|null, filename?: string|null, mime_type?: string|null }>,
 * }} FileRefs
 */

/**
 * Every portal record that names a stored file. ⛔ Throws on any query error,
 * so a caller fails CLOSED — a lookup that could not run is not "no rows".
 * @param {any} db  a SERVICE-ROLE client
 * @param {string} ref  a provider file id (Drive/OneDrive) or storage path
 * @returns {Promise<FileRefs>}
 */
export async function findFileReferences(db, ref) {
  const pattern = likeContaining(ref);
  const [library, media, maintenance] = await Promise.all([
    db.from('document_library').select('id, entity_type, filename, display_name, mime_type').eq('provider_file_id', ref),
    db.from('media_attachments').select('id, created_by, filename, mime_type').ilike('storage_url', pattern),
    db.from('maintenance_documents').select('id, uploaded_by, filename, mime_type').ilike('storage_path', pattern),
  ]);
  for (const r of [library, media, maintenance]) if (r.error) throw new Error(r.error.message);
  return { library: library.data ?? [], media: media.data ?? [], maintenance: maintenance.data ?? [] };
}

/**
 * The viewer behind a media session, or null if they no longer exist.
 * @param {any} db  a SERVICE-ROLE client
 * @param {string} userId
 * @returns {Promise<{ userId: string, isAdmin: boolean, grants: Set<string> } | null>}
 */
export async function loadViewer(db, userId) {
  const [profile, grants] = await Promise.all([
    db.from('profiles').select('id, is_admin').eq('id', userId).maybeSingle(),
    db.from('app_permissions').select('app_id').eq('user_id', userId),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (grants.error)  throw new Error(grants.error.message);
  if (!profile.data) return null;
  return {
    userId,
    isAdmin: profile.data.is_admin === true,
    grants:  new Set((grants.data ?? []).map((g) => g.app_id)),
  };
}

/**
 * May this viewer see this file?
 * @param {FileRefs} refs
 * @param {{ isAdmin: boolean, grants: Set<string> }} viewer
 * @returns {boolean}
 */
export function canViewFile(refs, viewer) {
  const known = refs.library.length + refs.media.length + refs.maintenance.length > 0;
  if (!known) return false;
  const parking = refs.library.some((r) => r.entity_type === 'parking_agreement');
  if (parking && !viewer.isAdmin && !viewer.grants.has('parking')) return false;
  return true;
}

/**
 * May this caller permanently delete this file? `reason` is shown to them.
 * @param {FileRefs} refs
 * @param {{ userId: string, isAdmin: boolean }} caller
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canDeleteFile(refs, caller) {
  if (refs.library.length > 0) {
    return { ok: false, reason: 'This is a library document. Delete it from the document list.' };
  }
  const owners = [
    ...refs.media.map((r) => r.created_by),
    ...refs.maintenance.map((r) => r.uploaded_by),
  ];
  if (owners.length === 0) {
    return { ok: false, reason: 'No attachment in the portal names this file, so it cannot be deleted here.' };
  }
  if (caller.isAdmin) return { ok: true };
  if (owners.every((o) => o === caller.userId)) return { ok: true };
  return { ok: false, reason: 'Only an administrator, or whoever added it, can delete this file.' };
}

/**
 * The name and type to serve a file under — the portal's own record, not the
 * storage provider's, which is only what the uploader's browser said.
 * @param {FileRefs} refs
 * @returns {{ filename: string|null, mime: string|null }}
 */
export function describeFile(refs) {
  const lib = refs.library[0];
  if (lib) return { filename: lib.filename ?? lib.display_name ?? null, mime: lib.mime_type ?? null };
  const row = refs.media[0] ?? refs.maintenance[0];
  return { filename: row?.filename ?? null, mime: row?.mime_type ?? null };
}
