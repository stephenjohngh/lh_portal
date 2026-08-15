// src/lib/server/packArchiveBuilder.js
// Assembling a pack's offline archive.
//
// Lives here rather than in the route because a SvelteKit endpoint may export
// only HTTP verbs, and because the bounds below are the interesting part.
//
// ── Whose feature this is ────────────────────────────────────────────────────
// The AUTHOR's. An author takes a copy of their own pack — pages, tables and
// the files behind them — that keeps working with no portal, no link and no
// browser. It is deliberately NOT reachable from a publication token: handing a
// recipient everything in one request is a different act from reading a pack,
// and the published reader offers printing and the individual files instead.
//
// ── What goes in ─────────────────────────────────────────────────────────────
// README.txt, the pages as markdown, each table as CSV (utils/packArchive.js),
// and the pack's shelf. The whole shelf, not only what a page happens to
// reference: a publication's manifest is an allow-list because it decides what
// an outsider may reach, whereas this is the author taking a copy of their own
// working material, where a file they uploaded and have not placed yet is
// exactly the thing they would be sorry to lose.

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

/** Where a pack's own files land inside the zip. */
export const FILES_FOLDER = 'files';

/**
 * Build the archive for one pack.
 *
 * Never throws for a single unreadable file: an archive that names its gaps is
 * better than no archive at all. Whatever is left out is listed in the README,
 * so the omission is on the record rather than silently absent.
 *
 * @param {object} input
 * @param {object} input.content   { pack, docs, datasets, records }
 * @param {{ document_id: string, provider_file_id: string, filename?: string,
 *           file_size?: number }[]} input.files
 * @param {string} input.notice    the confidentiality notice, verbatim
 * @returns {Promise<{ ok: true, zip: Buffer, filename: string }
 *                 | { ok: false, message: string }>}
 */
export async function buildPackArchive({ content, files: entries = [], notice = '' }) {
  /** @type {Map<string, string>} */
  const fileNames = new Map();
  /** @type {{ name: string, data: Buffer }[]} */
  const fileEntries = [];
  const omitted = [];
  const taken = new Set();

  let budget = MAX_ARCHIVE_BYTES;

  for (const entry of entries.slice(0, MAX_ARCHIVE_FILES)) {
    // The storage id comes from the row the server read, never from anything
    // the caller sent — the same discipline as the published file endpoint.
    const storageId = String(entry.provider_file_id || '');
    if (!/^[A-Za-z0-9_-]+$/.test(storageId)) continue;

    const label = entry.display_name || entry.filename || 'file';

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
    fileEntries.push({ name: `${FILES_FOLDER}/${name}`, data });
  }

  for (const entry of entries.slice(MAX_ARCHIVE_FILES)) {
    omitted.push(`${entry.display_name || entry.filename || 'a file'} `
      + `— past the ${MAX_ARCHIVE_FILES}-file limit`);
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
        + 'Its files can still be downloaded one at a time from the shelf.',
    };
  }

  return {
    ok: true,
    zip,
    filename: `${safeName(content?.pack?.title, 'pack')}.zip`,
  };
}
