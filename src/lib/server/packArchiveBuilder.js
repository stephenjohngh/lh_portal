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
import { zipStream }            from './zip.js';
import { ownerOf }              from './storage/index.js';
import { storedFileChunks }     from './storage/fileBytes.js';
import { isStorageId }          from './storage/storageRef.js';
import { friendlyStorageError } from './storage/storageErrors.js';
import { buildArchiveText, safeName, uniqueName } from '#lib/apps/dossier/utils/packArchive.js';
import { getLogger }            from '#lib/utils/logger.js';

const logger = getLogger('PackArchive');

/**
 * Bounds.
 *
 * ⭐ STREAMED since 2026-11-08: each file passes through a piece at a time, so the
 * bound is no longer memory. It used to be 4 MB, because the zip was built whole
 * and returned as one body (Netlify buffers about 6 MB; Northflank has about 100 MB
 * to spare). What bounds it now is the time a host lets one request run, so a pack
 * past these is still refused piece by piece and the README names what was left out.
 */
export const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
export const MAX_ARCHIVE_FILES = 200;

/** Where a pack's own files land inside the zip. */
export const FILES_FOLDER = 'files';

/**
 * Build the archive for one pack, as a stream.
 *
 * Never fails for a single unreadable or oversized file: an archive that names its
 * gaps is better than no archive at all. Whatever is left out is listed in the
 * README, which is written LAST, from what actually went in. A file that fails part
 * way through breaks the download rather than leaving an archive that is short.
 *
 * @param {object} input
 * @param {object} input.content   { pack, docs, datasets, records }
 * @param {{ document_id: string, provider_file_id: string, provider?: string|null,
 *           display_name?: string, filename?: string, file_size?: number }[]} input.files
 *   `provider` is the one recorded on the document's row: the file is read
 *   from where it was written, not from wherever storage is configured today.
 * @param {string} input.notice    the confidentiality notice, verbatim
 * @returns {{ ok: true, stream: ReadableStream<Uint8Array>, filename: string }}
 */
export function buildPackArchive({ content, files: entries = [], notice = '' }) {
  const date = new Date();

  async function* zipEntries() {
    /** @type {Map<string, string>} */
    const fileNames = new Map();
    const omitted = [];
    const taken = new Set();
    let budget = MAX_ARCHIVE_BYTES;

    for (const entry of entries.slice(0, MAX_ARCHIVE_FILES)) {
      // The storage id comes from the row the server read, never from anything
      // the caller sent — the same discipline as the published file endpoint.
      const storageId = String(entry.provider_file_id || '');
      if (!isStorageId(storageId, entry.provider)) continue;

      const label = entry.display_name || entry.filename || 'file';
      if ((Number(entry.file_size) || 0) > budget) {
        omitted.push(`${label} — too large to fit in this archive`);
        continue;
      }

      let opened;
      try {
        opened = await storedFileChunks(ownerOf(entry.provider), storageId);
      } catch (err) {
        logger('⚠ archive could not read', storageId, '—', friendlyStorageError(err));
        omitted.push(`${label} — could not be read`);
        continue;
      }
      const size = opened.size ?? Number(entry.file_size) ?? 0;
      if (size > budget) {
        omitted.push(`${label} — too large to fit in this archive`);
        continue;
      }
      budget -= size;

      const name = uniqueName(safeName(label), taken);
      fileNames.set(entry.document_id, name);
      yield { name: `${FILES_FOLDER}/${name}`, data: opened.chunks, date };
    }

    for (const entry of entries.slice(MAX_ARCHIVE_FILES)) {
      omitted.push(`${entry.display_name || entry.filename || 'a file'} `
        + `— past the ${MAX_ARCHIVE_FILES}-file limit`);
    }

    for (const e of buildArchiveText({ content, fileNames, notice, omitted })) {
      yield { name: e.name, data: Buffer.from(e.text, 'utf8'), date };
    }
  }

  return {
    ok: true,
    stream: zipStream(zipEntries()),
    filename: `${safeName(content?.pack?.title, 'pack')}.zip`,
  };
}
