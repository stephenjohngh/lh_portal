// src/lib/utils/driveUtils.test.js
// Google Drive URL helpers: extract a file id and rewrite Drive URLs to the
// same-origin proxy (non-Drive URLs pass through).
//
// ⛔ DELETION USED TO BE TESTED HERE AND IS NOT DRIVE'S JOB. deleteStorageFiles
// extracted a Drive id and skipped everything else, so a Supabase or OneDrive
// attachment was never even requested — its file stayed behind for ever. It
// now lives in mediaAttachments.js, routed per provider. PROJECT_STATUS §6hh.

import { describe, it, expect } from 'vitest';
import { extractDriveFileId, normalisePhotoUrl } from './driveUtils.js';

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
