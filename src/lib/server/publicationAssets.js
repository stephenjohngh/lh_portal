// src/lib/server/publicationAssets.js
// Pinning a publication's files, and detecting when they have drifted.
//
// ── The problem this solves (merge doc §6.1) ─────────────────────────────────
// Both source specs promised immutable publications AND insisted assets are
// "referenced, never copied". Those cannot both hold: the files live in Google
// Drive, where one can be edited, replaced or deleted after publication. A
// frozen snapshot whose evidence changes underneath it is not frozen.
//
// Decision #5 settled it: **pin bytes for snapshot publications, detect drift
// for follow-latest ones.**
//
//   * PIN — copy the bytes into a publication-owned folder at publish time.
//     The recipient is then served a copy nothing in the app points at, so
//     editing the original cannot alter what was sent. This is a deliberate
//     exception to "never duplicate", scoped to published packs only.
//   * DETECT — a follow-latest link makes no immutability promise, so there is
//     nothing to pin. Its baseline checksums let the AUTHOR ask "has anything
//     changed since I sent this?" and get a real answer.

// Note on baselines: document_library.file_checksum is populated at upload, but
// it records the bytes as they ARRIVED. The files live in a Drive that can be
// edited from outside the portal, so a publication measures its own — what it
// needs is a record of what it actually sent.

import { storageProvider }      from './storage/index.js';
import { friendlyStorageError } from './storage/storageErrors.js';

/**
 * Bounds. A pack's shelf is normally a handful of files, but publishing must
 * not become a way to stream half of Drive through a serverless function.
 * Anything past a bound comes back unpinned with a null checksum, which the
 * manifest already represents honestly and the author is shown.
 */
export const MAX_FILES = 40;
export const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

/** Where pinned copies live. Kept out of the shelf so nothing lists them. */
export const PIN_PATH = ['Dossier Packs', '_published'];

export async function sha256Hex(buffer) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Read each file once: checksum it, and optionally pin a copy.
 *
 * One pass on purpose. Checksumming and pinning both need the whole file, and
 * doing them separately would double the bytes pulled through the function for
 * no benefit.
 *
 * Never throws for one bad file — a publication with a known gap, shown to the
 * author, beats a publish that will not go out. Failures come back as
 * `{ checksum: null, pinned_file_id: null }`.
 *
 * @param {{ providerFileId: string, filename?: string, mimeType?: string }[]} files
 * @param {{ pin?: boolean }} [opts]
 * @returns {Promise<Record<string, { checksum: string|null, pinned_file_id: string|null }>>}
 *          keyed by providerFileId
 */
export async function prepareAssets(files = [], { pin = false } = {}) {
  /** @type {Record<string, { checksum: string|null, pinned_file_id: string|null }>} */
  const out = {};
  const empty = { checksum: null, pinned_file_id: null };

  let budget = MAX_TOTAL_BYTES;
  let pinFolder = null;

  for (const file of files.slice(0, MAX_FILES)) {
    const id = String(file?.providerFileId ?? '');
    // The same id guard the media proxy applies.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) { out[id] = { ...empty }; continue; }

    let data;
    try {
      ({ data } = await storageProvider.getFileStream(id));
    } catch (err) {
      console.error('[PublicationAssets] read failed for', id, '—',
        friendlyStorageError(err));
      out[id] = { ...empty };
      continue;
    }

    if (data.length > budget) { out[id] = { ...empty }; continue; }
    budget -= data.length;

    const checksum = await sha256Hex(data);
    let pinnedFileId = null;

    if (pin) {
      try {
        pinFolder ??= await storageProvider.ensurePath(PIN_PATH);
        const uploaded = await storageProvider.uploadFile(
          data,
          `${id}-${checksum.slice(0, 12)}-${file.filename ?? 'file'}`,
          file.mimeType || 'application/octet-stream',
          pinFolder);
        pinnedFileId = uploaded?.fileId ?? null;
      } catch (err) {
        // An unpinned file still serves — from the original, which is exactly
        // the drift risk pinning exists to remove. So it is recorded as a gap
        // rather than passed over.
        console.error('[PublicationAssets] pin failed for', id, '—',
          friendlyStorageError(err));
      }
    }

    out[id] = { checksum, pinned_file_id: pinnedFileId };
  }

  // Anything past MAX_FILES is reported explicitly rather than omitted, so the
  // caller can tell "not done" from "never asked for".
  for (const file of files.slice(MAX_FILES)) {
    out[String(file?.providerFileId ?? '')] = { ...empty };
  }

  return out;
}

/**
 * Compare a publication's manifest against the files as they are now.
 *
 * Only meaningful for entries that HAVE a baseline. An entry with no checksum
 * is reported as `unknown` rather than quietly counted as unchanged — the
 * difference between "I checked and it is fine" and "I could not check" is the
 * whole value of the answer.
 *
 * @param {object} manifest
 * @returns {Promise<{ checked: number, changed: object[], unknown: object[],
 *                     missing: object[], pinned: number }>}
 */
export async function verifyManifest(manifest) {
  const entries = manifest?.files ?? [];
  const changed = [];
  const unknown = [];
  const missing = [];
  let checked = 0;
  let pinned = 0;

  for (const entry of entries) {
    if (entry.pinned_file_id) pinned++;

    if (!entry.checksum) { unknown.push(entry); continue; }

    // Always verify the ORIGINAL, not the pinned copy. The question the author
    // is asking is "has the source document changed since I sent this?" — and
    // checking the pinned copy would answer a question nobody asked, always
    // with "no".
    const id = String(entry.provider_file_id ?? '');
    if (!/^[A-Za-z0-9_-]+$/.test(id)) { unknown.push(entry); continue; }

    try {
      const { data } = await storageProvider.getFileStream(id);
      checked++;
      if (await sha256Hex(data) !== entry.checksum) changed.push(entry);
    } catch {
      missing.push(entry);
    }
  }

  return { checked, changed, unknown, missing, pinned };
}

/**
 * One line an author can act on.
 *
 * The wording distinguishes pinned from unpinned deliberately: for a pinned
 * publication a changed source is INFORMATION (the recipient still has what
 * was sent), while for a follow-latest one it is a WARNING (the recipient's
 * view has moved).
 */
export function describeVerification(result, mode = 'snapshot') {
  if (!result) return '';
  const { changed = [], unknown = [], missing = [], checked = 0, pinned = 0 } = result;

  if (!checked && !unknown.length && !missing.length) return 'Nothing to check.';

  const parts = [];
  if (changed.length) {
    parts.push(mode === 'snapshot' && pinned
      ? `${changed.length} source file${changed.length === 1 ? ' has' : 's have'} changed since publication — the recipient still sees the version you sent`
      : `${changed.length} file${changed.length === 1 ? ' has' : 's have'} changed since publication`);
  }
  if (missing.length) parts.push(`${missing.length} could not be read`);
  if (unknown.length) parts.push(`${unknown.length} had no baseline to compare`);

  if (!parts.length) return `All ${checked} files are unchanged since publication.`;
  return parts.join(' · ');
}
