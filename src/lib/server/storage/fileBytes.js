// src/lib/server/storage/fileBytes.js
//
// Working with a stored file's bytes without holding the whole file in memory.
//
// ⛔ Northflank's container has about 100 MB to spare. On 2026-11-07 serving a 30 MB
// file in one piece stopped the server for everyone; openStoredFile.js fixed serving.
// This is the same fix for the jobs that copy, hash or bundle a file: a copy inside
// the storage moves no bytes at all, a hash reads the file in ranges, and a zip is
// streamed (zip.js zipStream). openStoredFile.test.js fails server code that goes back
// to getFileStream (fileBytes.test.js).

import { createHash } from 'node:crypto';
import { openStoredFile } from './openStoredFile.js';

/**
 * A stored file's bytes, a piece at a time.
 * @param {import('./storageProvider.js').StorageProvider} provider
 * @param {string} fileId
 * @returns {Promise<{ chunks: AsyncIterable<Uint8Array>, size: number|null, mimeType: string }>}
 */
export async function storedFileChunks(provider, fileId) {
  const { body, size, mimeType } = await openStoredFile(provider, fileId);
  const chunks = body instanceof Uint8Array ? (async function* () { yield body; })() : /** @type {any} */ (body);
  return { chunks, size, mimeType };
}

/**
 * SHA-256 and size of a stored file: the storage's own record where it keeps one,
 * otherwise read in ranges.
 * @param {import('./storageProvider.js').StorageProvider} provider
 * @param {string} fileId
 * @returns {Promise<{ sha256: string, size: number }>}
 */
export async function hashStoredFile(provider, fileId) {
  if (provider.fileChecksum) {
    const known = await provider.fileChecksum(fileId);
    if (known?.sha256) return { sha256: known.sha256.toLowerCase(), size: known.size };
  }
  const hash = createHash('sha256');
  let size = 0;
  const { chunks } = await storedFileChunks(provider, fileId);
  for await (const piece of chunks) { hash.update(piece); size += piece.byteLength; }
  return { sha256: hash.digest('hex'), size };
}

/** The largest file copied between two DIFFERENT storages, which has to pass through. */
export const MAX_CROSS_STORAGE_BYTES = 25 * 1024 * 1024;

/**
 * Copy a stored file into `target`'s folder. Inside one storage that offers it, the
 * storage copies the file itself. Between two storages (only after a provider switch)
 * the bytes pass through, so a file over MAX_CROSS_STORAGE_BYTES is refused rather
 * than read whole.
 *
 * @param {import('./storageProvider.js').StorageProvider} source  holds the file
 * @param {import('./storageProvider.js').StorageProvider} target  receives the copy
 * @param {string} fileId
 * @param {{ name: string, mimeType?: string, folderId: string }} to
 * @returns {Promise<import('./storageProvider.js').UploadResult & { size: number, sha256: string }>}
 */
export async function copyStoredFile(source, target, fileId, { name, mimeType, folderId }) {
  if (source === target && target.copyFile) {
    const copy = await target.copyFile(fileId, name, folderId);
    const sha256 = copy.sha256 ? copy.sha256.toLowerCase() : (await hashStoredFile(target, copy.fileId)).sha256;
    return { ...copy, sha256 };
  }
  let read;
  try { read = await readStoredFile(source, fileId, MAX_CROSS_STORAGE_BYTES); }
  catch (err) {
    if (err instanceof FileTooLarge) throw new Error(`${err.message}, too large to copy between two storages`);
    throw err;
  }
  const { data, mimeType: stored } = read;
  const result = await target.uploadFile(data, name, mimeType || stored, folderId);
  return { ...result, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}

/** Thrown by readStoredFile for a file over its limit. */
export class FileTooLarge extends Error {
  /** @param {number} size @param {number} max */
  constructor(size, max) { super(`the file is larger than ${Math.round(max / 1048576)} MB`); this.size = size; this.max = max; }
}

/**
 * The whole of a stored file, for a job that must have every byte (a spreadsheet to
 * parse, a photo to put in a report), but only up to `maxBytes`. The size is checked
 * BEFORE reading where the storage gives it, and the read stops the moment it passes,
 * so an unexpectedly large file is refused instead of filling the memory.
 * @param {import('./storageProvider.js').StorageProvider} provider
 * @param {string} fileId
 * @param {number} maxBytes
 * @returns {Promise<{ data: Buffer, mimeType: string }>}
 */
export async function readStoredFile(provider, fileId, maxBytes) {
  const { chunks, size, mimeType } = await storedFileChunks(provider, fileId);
  if (size != null && size > maxBytes) {
    await /** @type {any} */ (chunks).cancel?.();
    throw new FileTooLarge(size, maxBytes);
  }
  const parts = [];
  let total = 0;
  for await (const piece of chunks) {
    total += piece.byteLength;
    if (total > maxBytes) throw new FileTooLarge(total, maxBytes);
    parts.push(Buffer.from(piece));
  }
  return { data: Buffer.concat(parts), mimeType };
}
