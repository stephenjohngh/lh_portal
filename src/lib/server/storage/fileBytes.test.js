// src/lib/server/storage/fileBytes.test.js
// Copying, hashing and bounded reads of stored files without holding them whole,
// and the guard that keeps server code off getFileStream (2026-11-08).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { hashStoredFile, copyStoredFile, readStoredFile, FileTooLarge, MAX_CROSS_STORAGE_BYTES } from './fileBytes.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
/** A provider that serves its bytes in pieces, as Drive does. */
function ranged(bytes, extra = {}) {
  return {
    name: 'ranged',
    openFileStream: vi.fn(async () => ({
      size: bytes.length, mimeType: 'application/pdf',
      body: (async function* () { for (let i = 0; i < bytes.length; i += 4) yield bytes.subarray(i, i + 4); })(),
    })),
    getFileStream: vi.fn(),
    uploadFile: vi.fn(async () => ({ fileId: 'up-1', folderId: 'f' })),
    ...extra,
  };
}

describe('hashStoredFile', () => {
  it('uses the storage’s own checksum where it keeps one, reading nothing', async () => {
    const p = ranged(Buffer.from('hello'), { fileChecksum: vi.fn(async () => ({ size: 5, sha256: 'ABCD' })) });
    expect(await hashStoredFile(p, 'x')).toEqual({ sha256: 'abcd', size: 5 });
    expect(p.openFileStream).not.toHaveBeenCalled();
  });
  it('otherwise reads the file in pieces, never whole', async () => {
    const bytes = Buffer.from('a longer file read in pieces');
    const p = ranged(bytes, { fileChecksum: vi.fn(async () => ({ size: bytes.length, sha256: null })) });
    expect(await hashStoredFile(p, 'x')).toEqual({ sha256: sha(bytes), size: bytes.length });
    expect(p.getFileStream).not.toHaveBeenCalled();
  });
});

describe('copyStoredFile', () => {
  it('lets one storage copy its own file: no bytes pass through', async () => {
    const p = ranged(Buffer.from('x'), { copyFile: vi.fn(async () => ({ fileId: 'c-1', folderId: 'f', size: 1, sha256: 'EE' })) });
    const out = await copyStoredFile(p, p, 'src', { name: 'n.pdf', folderId: 'f' });
    expect(out).toMatchObject({ fileId: 'c-1', sha256: 'ee' });
    expect(p.openFileStream).not.toHaveBeenCalled();
    expect(p.uploadFile).not.toHaveBeenCalled();
  });
  it('between two storages, refuses a file over the limit before reading it', async () => {
    const source = ranged(Buffer.alloc(8));
    source.openFileStream.mockResolvedValueOnce({ size: MAX_CROSS_STORAGE_BYTES + 1, mimeType: 'x', body: (async function* () {})() });
    const target = ranged(Buffer.alloc(0));
    await expect(copyStoredFile(source, target, 'src', { name: 'n', folderId: 'f' })).rejects.toThrow('too large to copy');
    expect(target.uploadFile).not.toHaveBeenCalled();
  });
});

describe('readStoredFile', () => {
  it('returns the whole file under the limit', async () => {
    const bytes = Buffer.from('a spreadsheet');
    expect((await readStoredFile(ranged(bytes), 'x', 100)).data.equals(bytes)).toBe(true);
  });
  it('refuses a file over the limit, by its size before reading', async () => {
    await expect(readStoredFile(ranged(Buffer.alloc(50)), 'x', 10)).rejects.toBeInstanceOf(FileTooLarge);
  });
  it('stops reading the moment a file of unknown size passes the limit', async () => {
    const p = ranged(Buffer.alloc(50));
    const opened = await p.openFileStream();
    p.openFileStream.mockResolvedValueOnce({ ...opened, size: null });
    await expect(readStoredFile(p, 'x', 10)).rejects.toBeInstanceOf(FileTooLarge);
  });
});

// ⛔ getFileStream reads a whole file into memory. Server code goes through
// openStoredFile.js or fileBytes.js; the providers themselves are the only callers.
describe('nothing in server code reads a whole stored file', () => {
  const ALLOWED = new Set([
    'src/lib/server/storage/openStoredFile.js',          // the fallback for a provider with no ranged read
    'src/lib/server/storage/googleDriveProvider.js',     // a zero-size file, and the definition
    'src/lib/server/storage/oneDriveProvider.js',
    'src/lib/server/storage/supabaseStorageProvider.js',
  ]);
  /** @param {string} dir @returns {string[]} */
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n).replace(/\\/g, '/');
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && !p.endsWith('.test.js') ? [p] : [];
  });
  it('calls getFileStream nowhere else', () => {
    const offenders = [...walk('src/lib'), ...walk('src/routes')]
      .filter((f) => !ALLOWED.has(f) && readFileSync(f, 'utf8').includes('.getFileStream('));
    expect(offenders).toEqual([]);
  });
});
