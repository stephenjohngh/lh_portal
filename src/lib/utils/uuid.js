// src/lib/utils/uuid.js
//
// A single place to mint UUIDs. The Inspection offline walk generates client-side
// ids for walk_sessions / component_inspections / media_attachments BEFORE they
// reach the server, so a locally-recorded row and its eventual server row share
// one id — there is nothing to remap when the offline queue syncs, and foreign
// keys (walk_session_id, entity_id) are valid the instant the row is written
// locally. `api.create` accepts a supplied `id`, so this works online too, giving
// one code path either way.

/**
 * RFC-4122 v4 UUID. Uses the platform `crypto.randomUUID()` where available
 * (all target browsers + Node ≥ 19), with a crypto-backed fallback otherwise.
 * @returns {string}
 */
export function newUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: build a v4 from random bytes (still cryptographically random when
  // getRandomValues exists; Math.random only as a last resort under old runtimes).
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
