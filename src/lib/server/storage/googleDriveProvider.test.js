// src/lib/server/storage/googleDriveProvider.test.js
// Type-1 tests for readHeader — the helper behind the content-type fix.
//
// Why this exists: getFileStream used to default the mime type to 'image/jpeg'
// whenever the response header could not be read. Images therefore worked by
// coincidence and every other type was mislabelled — a PDF was served as a
// JPEG, which browsers reject with "the image cannot be displayed". The header
// read is the part that decides whether the fallback fires at all, so it is the
// part worth pinning.

import { describe, it, expect, vi } from 'vitest';

// The provider pulls logger → $app/environment, and googleapis → $env, neither
// of which resolves without the SvelteKit vite plugin. Mock the seams.
vi.mock('$lib/utils/logger', () => ({ getLogger: () => () => {} }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { readHeader } = await import('./googleDriveProvider.js');

describe('readHeader', () => {
  it('reads a plain object', () => {
    expect(readHeader({ 'content-type': 'application/pdf' }, 'content-type'))
      .toBe('application/pdf');
  });

  it('is case-insensitive about the key', () => {
    // gaxios has returned both casings across versions; a case-sensitive lookup
    // is exactly how the mime type went missing.
    expect(readHeader({ 'Content-Type': 'application/pdf' }, 'content-type'))
      .toBe('application/pdf');
    expect(readHeader({ 'CONTENT-TYPE': 'image/png' }, 'Content-Type'))
      .toBe('image/png');
  });

  it('reads a fetch-style Headers object', () => {
    const headers = new Headers({ 'content-type': 'application/pdf' });
    expect(readHeader(headers, 'content-type')).toBe('application/pdf');
  });

  it('takes the first value when a header repeats', () => {
    expect(readHeader({ 'content-type': ['application/pdf', 'text/plain'] }, 'content-type'))
      .toBe('application/pdf');
  });

  it('returns undefined rather than guessing', () => {
    expect(readHeader({}, 'content-type')).toBeUndefined();
    expect(readHeader(null, 'content-type')).toBeUndefined();
    expect(readHeader(undefined, 'content-type')).toBeUndefined();
    expect(readHeader(new Headers(), 'content-type')).toBeUndefined();
  });
});
