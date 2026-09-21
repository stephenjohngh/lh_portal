// src/lib/server/storage/storageRef.test.js
//
// ⛔ THESE COVER A FAULT THAT ALREADY DESTROYED NOTHING ONLY BECAUSE SOMEBODY
// LOOKED. 30 files were stranded by a provider switch and had to be removed by
// hand (PROJECT_STATUS §6hh). The cases below are drawn from the URLs actually
// found on production, not invented.
import { describe, it, expect } from 'vitest';
import {
  resolveStorageRef, driveFileId, supabaseObjectRef,
  STORAGE_PROVIDERS, PROTECTED_BUCKETS,
} from './storageRef.js';

// Real shapes, taken from the rows that had to be purged.
const DRIVE_UC   = 'https://drive.google.com/uc?export=view&id=17vo6rB4FPEI6tfgnAer5e7rGjA';
const DRIVE_VIEW = 'https://drive.google.com/file/d/1Kccc9mb145sFfQUgXk_2vQSkG15Zo0kY/view';
const SB_PUBLIC  = 'https://x.supabase.co/storage/v1/object/public/inspection-photos/'
                 + 'walk-inspections/555dcbda-41f8-4a8a-94fd-cdf1a5b2615a/01_1775575021865_0.jpg';
const SB_PLANS   = 'https://x.supabase.co/storage/v1/object/public/plan-images/ground.png';

describe('url shapes', () => {
  it('reads a Drive id from both formats Drive returns', () => {
    expect(driveFileId(DRIVE_UC)).toBe('17vo6rB4FPEI6tfgnAer5e7rGjA');
    expect(driveFileId(DRIVE_VIEW)).toBe('1Kccc9mb145sFfQUgXk_2vQSkG15Zo0kY');
    expect(driveFileId(SB_PUBLIC)).toBeNull();
    expect(driveFileId(null)).toBeNull();
  });

  it('reads bucket and path from public, signed and authenticated object URLs', () => {
    expect(supabaseObjectRef(SB_PUBLIC)).toEqual({
      bucket: 'inspection-photos',
      path:   'walk-inspections/555dcbda-41f8-4a8a-94fd-cdf1a5b2615a/01_1775575021865_0.jpg',
    });
    expect(supabaseObjectRef('https://x.supabase.co/storage/v1/object/docs/a/b.pdf'))
      .toEqual({ bucket: 'docs', path: 'a/b.pdf' });
    expect(supabaseObjectRef('https://x.supabase.co/storage/v1/object/sign/docs/a/b.pdf?token=zz'))
      .toEqual({ bucket: 'docs', path: 'a/b.pdf' });
    // The path is what the provider is handed, so an encoded space must come
    // back as a space or `remove()` silently matches nothing.
    expect(supabaseObjectRef('https://x.supabase.co/storage/v1/object/public/d/a%20b.jpg')?.path)
      .toBe('a b.jpg');
  });
});

describe('resolving without a declared provider — every legacy row', () => {
  // ⭐ storage_provider was NULL on every row this project had ever written, so
  // inference is not a fallback here, it is the main path for anything old.
  it('infers Drive and Supabase from the URL alone', () => {
    expect(resolveStorageRef(DRIVE_UC)).toMatchObject({ provider: 'google_drive', ref: '17vo6rB4FPEI6tfgnAer5e7rGjA' });
    expect(resolveStorageRef(SB_PUBLIC)).toMatchObject({ provider: 'supabase', bucket: 'inspection-photos' });
  });

  it('refuses an unrecognised URL with a reason rather than guessing', () => {
    const r = resolveStorageRef('https://example.com/whatever.jpg');
    expect(r.ref).toBeNull();
    expect(r.reason).toBeTruthy();
  });

  it('has nothing to address when there is no URL', () => {
    expect(resolveStorageRef(null).ref).toBeNull();
    expect(resolveStorageRef('').ref).toBeNull();
  });
});

describe('the declared provider is authoritative, but never fatal', () => {
  it('uses what was recorded at upload time', () => {
    expect(resolveStorageRef(DRIVE_UC, 'google_drive').provider).toBe('google_drive');
    expect(resolveStorageRef(SB_PUBLIC, 'supabase').provider).toBe('supabase');
  });

  // ⛔ The whole point: the ACTIVE provider is irrelevant. A Drive-era file
  // resolves to Drive while STORAGE_PROVIDER says supabase, and vice versa —
  // nothing in this module reads the environment.
  it('ignores what the application is configured with today', () => {
    expect(resolveStorageRef(SB_PUBLIC, 'supabase').ref).toBeTruthy();
    expect(resolveStorageRef(DRIVE_UC, 'google_drive').ref).toBeTruthy();
  });

  // ⚠ A wrong value in the column must not make a file permanently
  // undeletable — that IS the failure being removed, so it falls back.
  it('falls back to the URL when the column disagrees with it', () => {
    expect(resolveStorageRef(DRIVE_UC, 'supabase')).toMatchObject({
      provider: 'google_drive', ref: '17vo6rB4FPEI6tfgnAer5e7rGjA',
    });
    expect(resolveStorageRef(SB_PUBLIC, 'nonsense-provider').provider).toBe('supabase');
  });
});

describe('the things it must refuse', () => {
  // ⛔ The schematics. A media row naming one is a bug in itself, and deleting
  // it would be unrecoverable.
  it('will not delete out of a protected bucket', () => {
    const r = resolveStorageRef(SB_PLANS, 'supabase');
    expect(r.ref).toBeNull();
    expect(r.reason).toMatch(/plan-images/);
    expect(PROTECTED_BUCKETS).toContain('plan-images');
  });

  // Honest about a real limit rather than silently skipping, which is how the
  // Drive-only deleter hid this.
  it('says why OneDrive cannot be addressed at all', () => {
    const r = resolveStorageRef('https://contoso.sharepoint.com/sites/x/Doc.aspx?id=1', 'onedrive');
    expect(r.ref).toBeNull();
    expect(r.reason).toMatch(/provider_file_id/);
  });

  it('declares exactly the provider names the registry keys on', () => {
    expect(STORAGE_PROVIDERS).toEqual(['google_drive', 'onedrive', 'supabase']);
  });
});
