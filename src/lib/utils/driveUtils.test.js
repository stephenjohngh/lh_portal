// src/lib/utils/driveUtils.test.js
// Google Drive URL helpers: extract a file id, rewrite Drive URLs to the
// same-origin proxy (non-Drive URLs pass through), and best-effort delete.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractDriveFileId, normalisePhotoUrl, deleteStorageFiles } from './driveUtils.js';

describe('extractDriveFileId', () => {
  it('parses both Drive URL formats', () => {
    expect(extractDriveFileId('https://drive.google.com/uc?export=view&id=ABC_123')).toBe('ABC_123');
    expect(extractDriveFileId('https://drive.google.com/file/d/XYZ-789/view')).toBe('XYZ-789');
  });
  it('returns null for non-Drive or empty input', () => {
    expect(extractDriveFileId('https://proj.supabase.co/storage/x.jpg')).toBeNull();
    expect(extractDriveFileId('')).toBeNull();
    expect(extractDriveFileId(null)).toBeNull();
  });
});

describe('normalisePhotoUrl', () => {
  it('rewrites Drive URLs to the proxy path', () => {
    expect(normalisePhotoUrl('https://drive.google.com/uc?id=ABC_123')).toBe('/api/media/file/ABC_123');
  });
  it('passes non-Drive URLs through unchanged', () => {
    expect(normalisePhotoUrl('https://proj.supabase.co/x.jpg')).toBe('https://proj.supabase.co/x.jpg');
  });
  it('returns falsy input unchanged', () => {
    expect(normalisePhotoUrl(null)).toBeNull();
    expect(normalisePhotoUrl('')).toBe('');
  });
});

describe('deleteStorageFiles', () => {
  beforeEach(() => { globalThis.fetch = vi.fn(() => Promise.resolve({})); });
  afterEach(()  => { vi.restoreAllMocks(); });

  it('DELETEs each Drive file via the proxy with the bearer token', async () => {
    await deleteStorageFiles(['https://drive.google.com/uc?id=ABC_123'], 'tok');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/media/file/ABC_123', expect.objectContaining({
      method: 'DELETE', headers: { Authorization: 'Bearer tok' },
    }));
  });

  it('skips non-Drive URLs and no-ops without a token', async () => {
    await deleteStorageFiles(['https://proj.supabase.co/x.jpg'], 'tok');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await deleteStorageFiles(['https://drive.google.com/uc?id=ABC'], null);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('swallows fetch errors so DB cleanup is never blocked', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network')));
    await expect(deleteStorageFiles(['https://drive.google.com/uc?id=ABC'], 'tok')).resolves.toBeUndefined();
  });
});
