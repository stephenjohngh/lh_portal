// src/lib/server/publicationAssets.test.js
// P3 step 6 — pinning, and detecting drift.
//
// The promise being kept here (merge doc §6.1, decision #5) is that a frozen
// publication is actually frozen. Both source specs promised immutability AND
// "reference, never copy", which cannot both hold when the files live in a
// Drive somebody can edit. Pinning is the resolution, and these tests hold the
// two properties that make it worth having:
//
//   * a pinned publication records the copy, so the reader can be served it;
//   * a failure to pin is recorded as a GAP, never passed over — an unpinned
//     file still serves, from the original, which is exactly the drift risk
//     pinning exists to remove.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getFileStream: vi.fn(),
  uploadFile:    vi.fn(),
  ensurePath:    vi.fn(() => Promise.resolve('pin-folder')),
}));

vi.mock('./storage/index.js', () => ({
  storageProvider: {
    getFileStream: h.getFileStream,
    uploadFile:    h.uploadFile,
    ensurePath:    h.ensurePath,
  },
}));
vi.mock('./storage/storageErrors.js', () => ({
  friendlyStorageError: (e) => String(e?.message ?? e),
}));

const {
  prepareAssets, verifyManifest, describeVerification, sha256Hex, MAX_FILES,
} = await import('./publicationAssets.js');

const file = (id, name = 'Notice.pdf') => ({
  providerFileId: id, filename: name, mimeType: 'application/pdf',
});

beforeEach(() => {
  vi.clearAllMocks();
  h.ensurePath.mockResolvedValue('pin-folder');
  h.getFileStream.mockResolvedValue({ data: Buffer.from('bytes') });
  h.uploadFile.mockResolvedValue({ fileId: 'pinned-1' });
});

describe('prepareAssets — checksums', () => {
  it('checksums each file', async () => {
    const assets = await prepareAssets([file('drive-1')]);
    expect(assets['drive-1'].checksum).toBe(await sha256Hex(Buffer.from('bytes')));
  });

  it('reads each file ONCE, even when pinning', async () => {
    // Checksumming and pinning both need the whole file. Doing them separately
    // would double the bytes pulled through a serverless function for nothing.
    await prepareAssets([file('drive-1')], { pin: true });
    expect(h.getFileStream).toHaveBeenCalledTimes(1);
  });

  it('records a null checksum for a file it cannot read, and carries on', async () => {
    h.getFileStream.mockRejectedValueOnce(new Error('gone'));
    const assets = await prepareAssets([file('drive-1'), file('drive-2')]);

    expect(assets['drive-1']).toEqual({ checksum: null, pinned_file_id: null });
    expect(assets['drive-2'].checksum).toBeTruthy();
  });

  it('refuses an id that could not be a storage id, without asking storage', async () => {
    const assets = await prepareAssets([file('../../etc/passwd')]);
    expect(assets['../../etc/passwd']).toEqual({ checksum: null, pinned_file_id: null });
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('reports files past the cap rather than omitting them', async () => {
    // So the caller can tell "not done" from "never asked for".
    const many = Array.from({ length: MAX_FILES + 3 }, (_, i) => file(`drive-${i}`));
    const assets = await prepareAssets(many);

    expect(Object.keys(assets)).toHaveLength(MAX_FILES + 3);
    expect(assets[`drive-${MAX_FILES + 1}`]).toEqual({ checksum: null, pinned_file_id: null });
  });

  it('stops spending the byte budget once it is exhausted', async () => {
    h.getFileStream.mockResolvedValue({ data: Buffer.alloc(80 * 1024 * 1024) });
    const assets = await prepareAssets([file('drive-1'), file('drive-2')]);

    expect(assets['drive-1'].checksum).toBeTruthy();
    expect(assets['drive-2'].checksum).toBeNull();   // over budget
  });
});

describe('prepareAssets — pinning', () => {
  it('pins nothing unless asked', async () => {
    // A follow-latest publication makes no immutability promise, so there is
    // nothing to pin and copying would be waste.
    const assets = await prepareAssets([file('drive-1')]);
    expect(assets['drive-1'].pinned_file_id).toBeNull();
    expect(h.uploadFile).not.toHaveBeenCalled();
  });

  it('copies the bytes and records the copy', async () => {
    const assets = await prepareAssets([file('drive-1')], { pin: true });
    expect(assets['drive-1'].pinned_file_id).toBe('pinned-1');
    expect(h.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('pins into a folder of its own, not onto the shelf', async () => {
    // Nothing in the app lists this folder, which is the point: the copy exists
    // to be served, not to be edited.
    await prepareAssets([file('drive-1')], { pin: true });
    expect(h.ensurePath).toHaveBeenCalledWith(['Dossier Packs', '_published']);
    expect(h.uploadFile.mock.calls[0][3]).toBe('pin-folder');
  });

  it('resolves the pin folder once for the whole batch', async () => {
    await prepareAssets([file('drive-1'), file('drive-2')], { pin: true });
    expect(h.ensurePath).toHaveBeenCalledTimes(1);
  });

  it('records a FAILED pin as a gap, keeping the checksum', async () => {
    // The critical case. An unpinned file still serves — from the original,
    // which is exactly the drift risk pinning exists to remove. Passing over it
    // silently would leave a publication claiming an immutability it lacks.
    h.uploadFile.mockRejectedValueOnce(new Error('quota'));
    const assets = await prepareAssets([file('drive-1')], { pin: true });

    expect(assets['drive-1'].pinned_file_id).toBeNull();
    expect(assets['drive-1'].checksum).toBeTruthy();
  });

  it('carries on pinning after one file fails', async () => {
    h.uploadFile
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce({ fileId: 'pinned-2' });

    const assets = await prepareAssets([file('drive-1'), file('drive-2')], { pin: true });
    expect(assets['drive-1'].pinned_file_id).toBeNull();
    expect(assets['drive-2'].pinned_file_id).toBe('pinned-2');
  });
});

describe('verifyManifest', () => {
  const entry = (extra = {}) => ({
    document_id: 'f1', provider_file_id: 'drive-1', filename: 'Notice.pdf', ...extra,
  });

  it('reports an unchanged file', async () => {
    const checksum = await sha256Hex(Buffer.from('bytes'));
    const result = await verifyManifest({ files: [entry({ checksum })] });

    expect(result.checked).toBe(1);
    expect(result.changed).toEqual([]);
  });

  it('reports a changed one', async () => {
    const result = await verifyManifest({ files: [entry({ checksum: 'stale-value' })] });
    expect(result.changed).toHaveLength(1);
  });

  it('checks the ORIGINAL, not the pinned copy', async () => {
    // The author is asking "has the source document changed since I sent this?"
    // Checking the pin would answer a question nobody asked, always with "no".
    await verifyManifest({
      files: [entry({ checksum: 'x', pinned_file_id: 'pinned-1' })],
    });
    expect(h.getFileStream).toHaveBeenCalledWith('drive-1');
    expect(h.getFileStream).not.toHaveBeenCalledWith('pinned-1');
  });

  it('separates "no baseline" from "unchanged"', async () => {
    // The difference between "I checked and it is fine" and "I could not
    // check" is the whole value of the answer.
    const result = await verifyManifest({ files: [entry({ checksum: null })] });

    expect(result.unknown).toHaveLength(1);
    expect(result.checked).toBe(0);
    expect(result.changed).toEqual([]);
  });

  it('separates "cannot be read" from "changed"', async () => {
    h.getFileStream.mockRejectedValueOnce(new Error('gone'));
    const result = await verifyManifest({ files: [entry({ checksum: 'x' })] });

    expect(result.missing).toHaveLength(1);
    expect(result.changed).toEqual([]);
  });

  it('counts how many are pinned', async () => {
    const result = await verifyManifest({
      files: [entry({ checksum: 'x', pinned_file_id: 'p1' }), entry({ checksum: 'y' })],
    });
    expect(result.pinned).toBe(1);
  });

  it('handles an empty or missing manifest', async () => {
    expect((await verifyManifest({ files: [] })).checked).toBe(0);
    expect((await verifyManifest(null)).checked).toBe(0);
  });
});

describe('describeVerification', () => {
  it('says plainly when nothing has changed', async () => {
    expect(describeVerification({ checked: 3, changed: [], unknown: [], missing: [] }))
      .toBe('All 3 files are unchanged since publication.');
  });

  it('reassures for a PINNED publication that the recipient is unaffected', () => {
    // A changed source is information here, not a problem — the recipient still
    // has the bytes that were sent.
    const line = describeVerification(
      { checked: 2, changed: [{}], unknown: [], missing: [], pinned: 2 }, 'snapshot');
    expect(line).toContain('still sees the version you sent');
  });

  it('warns for a follow-latest publication, where the view HAS moved', () => {
    const line = describeVerification(
      { checked: 2, changed: [{}], unknown: [], missing: [], pinned: 0 }, 'latest');
    expect(line).toContain('changed since publication');
    expect(line).not.toContain('still sees');
  });

  it('reports what could not be checked', () => {
    const line = describeVerification({
      checked: 0, changed: [], unknown: [{}, {}], missing: [{}],
    });
    expect(line).toContain('1 could not be read');
    expect(line).toContain('2 had no baseline');
  });

  it('says so when there is nothing to check', () => {
    expect(describeVerification({ checked: 0, changed: [], unknown: [], missing: [] }))
      .toBe('Nothing to check.');
    expect(describeVerification(null)).toBe('');
  });
});
