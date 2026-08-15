// src/lib/server/packArchiveBuilder.js
// Assembling a published pack's offline archive.
//
// Lives here rather than in the route because a SvelteKit endpoint may export
// only HTTP verbs, and because the bounds below are the interesting part.
//
// ── What goes in ─────────────────────────────────────────────────────────────
// README.txt, the pages as markdown, each table as CSV (utils/packArchive.js),
// and the FILES the pack refers to. The files are what make it an archive
// rather than an export — the evidence is the part that stops being reachable
// when a link expires.
//
// ── The allow-list is the same one the file endpoint uses ────────────────────
// Only files in the publication's manifest are included, and the storage id
// always comes from the manifest entry, never from anything a caller supplies.
// Pinned copies win, for the same reason they win when serving a single file:
// they are the bytes as they were at publication, and shipping the current
// version instead would quietly undo the immutability the author was promised.

import { Buffer }               from 'node:buffer';
import { buildZip }             from './zip.js';
import { storageProvider }      from './storage/index.js';
import { friendlyStorageError } from './storage/storageErrors.js';
import { buildArchiveText, safeName, uniqueName } from '$lib/apps/dossier/utils/packArchive.js';
import { getLogger }            from '$lib/utils/logger';

const logger = getLogger('PackArchive');

/**
 * Bounds.
 *
 * ⚠ The ceiling here is the platform, not taste. The zip is built in memory and
 * returned as one response body, and a Netlify Function's buffered response is
 * capped around 6 MB — so a large pack does not merely get slow, it fails. The
 * limit below is deliberately under that, and a pack past it is refused with a
 * message saying so rather than sent as a download that breaks on arrival.
 * (The Northflank target is a long-lived node server with no such cap; if this
 * ever needs to grow, that is the deployment where it can.)
 */
export const MAX_ARCHIVE_BYTES = 4 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 40;

/**
 * Build the archive for one publication.
 *
 * Never throws for a single unreadable file: a recipient with an archive that
 * names its gaps is better off than one with no archive. Whatever is left out
 * is listed in the README, so the omission is on the record rather than
 * silently absent.
 *
 * @param {object} input
 * @param {object} input.content   the snapshot (already storage-id stripped for
 *                                 the reader; this gets the unstripped one)
 * @param {object} input.manifest  the publication's file allow-list
 * @param {string} input.notice    the confidentiality notice, verbatim
 * @returns {Promise<{ ok: true, zip: Buffer, filename: string }
 *                 | { ok: false, message: string }>}
 */
export async function buildPackArchive({ content, manifest, notice = '' }) {
  const entries = manifest?.files ?? [];
  /** @type {Map<string, string>} */
  const fileNames = new Map();
  /** @type {{ name: string, data: Buffer }[]} */
  const fileEntries = [];
  const omitted = [];
  const taken = new Set();

  let budget = MAX_ARCHIVE_BYTES;

  for (const entry of entries.slice(0, MAX_ARCHIVE_FILES)) {
    // Gate 3 of the file endpoint, applied here too: the id is the manifest's.
    const storageId = String(entry.pinned_file_id || entry.provider_file_id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(storageId)) continue;

    const label = entry.filename || entry.display_name || 'file';

    if ((Number(entry.file_size) || 0) > budget) {
      omitted.push(`${label} — too large to fit in this archive`);
      continue;
    }

    let data;
    try {
      ({ data } = await storageProvider.getFileStream(storageId));
    } catch (err) {
      logger('⚠ archive could not read', storageId, '—', friendlyStorageError(err));
      omitted.push(`${label} — could not be read`);
      continue;
    }

    if (data.length > budget) {
      omitted.push(`${label} — too large to fit in this archive`);
      continue;
    }
    budget -= data.length;

    const name = uniqueName(safeName(label), taken);
    fileNames.set(entry.document_id, name);
    fileEntries.push({ name: `files/${name}`, data });
  }

  for (const entry of entries.slice(MAX_ARCHIVE_FILES)) {
    omitted.push(`${entry.filename || 'a file'} — past the ${MAX_ARCHIVE_FILES}-file limit`);
  }

  const textEntries = buildArchiveText({ content, fileNames, notice, omitted });

  const date = new Date();
  const zip = buildZip([
    ...textEntries.map(e => ({ name: e.name, data: Buffer.from(e.text, 'utf8'), date })),
    ...fileEntries.map(e => ({ ...e, date })),
  ]);

  if (zip.length > MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      message: 'This pack is too large to download as a single archive. '
        + 'The files can still be downloaded individually from the pages that refer to them.',
    };
  }

  return {
    ok: true,
    zip,
    filename: `${safeName(content?.pack?.title, 'pack')}.zip`,
  };
}
