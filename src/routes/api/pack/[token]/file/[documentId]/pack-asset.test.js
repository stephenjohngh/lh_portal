// src/routes/api/pack/[token]/file/[documentId]/pack-asset.test.js
// P3 step 4 — the token-scoped asset endpoint.
//
// This is where "gives no access to anything else" is enforced for FILE BYTES,
// and it is the part most likely to be quietly wrong: a caller who can name a
// storage id, or reach a file the pack never referenced, or keep fetching after
// revocation, has broken the promise regardless of how the page behaves.
//
// So every gate is tested by making it the ONLY thing standing in the way.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getFileStream:  vi.fn(),
  checkRateLimit: vi.fn(() => Promise.resolve(true)),
  findServablePublication: vi.fn(),
  resolveManifest: vi.fn(),
}));

vi.mock('$lib/server/storage/index.js', () => ({
  storageProvider: { getFileStream: h.getFileStream },
}));
vi.mock('$lib/server/storage/storageErrors.js', () => ({
  friendlyStorageError: (e) => String(e?.message ?? e),
}));
vi.mock('$lib/server/publicRateLimit.js', () => ({ checkRateLimit: h.checkRateLimit }));
vi.mock('$lib/server/publicationReader.js', () => ({
  findServablePublication: h.findServablePublication,
  resolveManifest: h.resolveManifest,
  readerRefusal: () => ({ ok: false, message: 'This link is not available.' }),
}));

const { GET } = await import('./+server.js');

const TOKEN = 'a'.repeat(43);
const call = (documentId = 'doc-1', token = TOKEN) =>
  GET({ params: { token, documentId }, request: new Request('http://x/') });

const MANIFEST = {
  files: [{
    document_id: 'doc-1', provider_file_id: 'drive-1',
    filename: 'Notice.pdf', mime_type: 'application/pdf', file_size: 10,
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.checkRateLimit.mockResolvedValue(true);
  h.findServablePublication.mockResolvedValue({
    ok: true, publication: { id: 'pub1', mode: 'snapshot', manifest: MANIFEST },
  });
  h.resolveManifest.mockResolvedValue(MANIFEST);
  h.getFileStream.mockResolvedValue({
    data: Buffer.from('bytes'), mimeType: 'application/pdf',
  });
});

describe('the happy path', () => {
  it('serves the bytes for a file the publication exposes', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('bytes');
  });

  it('resolves the storage id from the MANIFEST, not from the caller', async () => {
    // The caller supplies a document_id and has no way to name a file outside
    // the pack. This is what makes the allow-list meaningful.
    await call('doc-1');
    expect(h.getFileStream).toHaveBeenCalledWith('drive-1');
  });

  it('never lets a caller-supplied value reach storage', async () => {
    // A document_id shaped like a storage id must still go through the manifest
    // and find nothing.
    await call('drive-1');
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
});

describe('gate 1 — the link must still be live', () => {
  it('refuses when the token does not resolve', async () => {
    h.findServablePublication.mockResolvedValueOnce({ ok: false, message: 'no' });
    const res = await call();
    expect(res.status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('re-checks on EVERY request, not once per page load', async () => {
    // So revoking a link stops the images in a page the recipient already has
    // open — not merely the next one they load.
    await call();
    await call();
    expect(h.findServablePublication).toHaveBeenCalledTimes(2);
  });
});

describe('gate 2 — the file must be in the manifest', () => {
  it('refuses a file the pack never referenced', async () => {
    // The shelf may hold far more than the pack shows. A valid link must not
    // be walkable outwards into the rest of it.
    const res = await call('doc-unreferenced');
    expect(res.status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('refuses when the manifest is empty', async () => {
    h.resolveManifest.mockResolvedValueOnce({ files: [] });
    expect((await call()).status).toBe(404);
  });

  it('refuses a manifest entry with an unusable storage id', async () => {
    h.resolveManifest.mockResolvedValueOnce({
      files: [{ document_id: 'doc-1', provider_file_id: '../../etc/passwd' }],
    });
    const res = await call();
    expect(res.status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
});

describe('refusals are indistinguishable', () => {
  it('gives the same status and body for every cause', async () => {
    const responses = [];

    h.findServablePublication.mockResolvedValueOnce({ ok: false, message: 'no' });
    responses.push(await call());                       // dead link

    responses.push(await call('doc-unreferenced'));      // not in the manifest

    h.getFileStream.mockRejectedValueOnce(new Error('storage exploded'));
    responses.push(await call());                        // storage failure

    const seen = new Set();
    for (const res of responses) {
      expect(res.status).toBe(404);
      seen.add(await res.text());
    }
    // A recipient learning that a file exists but cannot be read is of no use
    // to them, and narrates storage internals to an unauthenticated caller.
    expect(seen.size).toBe(1);
  });

  it('does not leak the storage error to the caller', async () => {
    h.getFileStream.mockRejectedValueOnce(new Error('drive quota exceeded for acct 42'));
    expect(await (await call()).text()).not.toContain('quota');
  });
});

describe('response headers', () => {
  it('serves a PDF inline under its own name', async () => {
    const res = await call();
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('inline; filename="Notice.pdf"');
  });

  it('downloads anything not on the inline allow-list as opaque bytes', async () => {
    // User-uploaded bytes from our own origin: only the small non-scriptable
    // set renders inline, the same caution the media proxy applies.
    h.resolveManifest.mockResolvedValueOnce({
      files: [{ document_id: 'doc-1', provider_file_id: 'drive-1',
                filename: 'macro.xlsm', mime_type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }],
    });
    const res = await call();
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('content-disposition')).toContain('attachment');
  });

  it('refuses to let a filename break out of the header', async () => {
    h.resolveManifest.mockResolvedValueOnce({
      files: [{ document_id: 'doc-1', provider_file_id: 'drive-1',
                filename: 'evil".pdf\r\nX-Injected: 1', mime_type: 'application/pdf' }],
    });
    const res = await call();
    const disposition = res.headers.get('content-disposition');

    // The properties that matter: no line break can start a new header, and no
    // stray quote can close the quoted string early. Whatever text survives
    // inside the quotes is inert.
    expect(disposition).not.toMatch(/[\r\n]/);
    expect(res.headers.get('x-injected')).toBeNull();
    expect(disposition.match(/"/g)).toHaveLength(2);
  });

  it('survives a filename the header encoding cannot represent', async () => {
    // A non-Latin-1 character THROWS when the Response is constructed, which
    // would turn an ordinary accented filename into a 500.
    h.resolveManifest.mockResolvedValueOnce({
      files: [{ document_id: 'doc-1', provider_file_id: 'drive-1',
                filename: 'Réponse — 2025 ✓.pdf', mime_type: 'application/pdf' }],
    });
    const res = await call();
    const disposition = res.headers.get('content-disposition');

    expect(res.status).toBe(200);
    // The real name still travels, in the form browsers prefer.
    expect(disposition).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(disposition)[1]))
      .toBe('Réponse — 2025 ✓.pdf');
  });

  it('sets nosniff, keeps it out of shared caches and out of search indexes', async () => {
    const res = await call();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('caches only briefly, so a revoked link stops working promptly', async () => {
    const maxAge = Number(/max-age=(\d+)/.exec(
      (await call()).headers.get('cache-control'))?.[1]);
    expect(maxAge).toBeLessThanOrEqual(300);
  });
});

describe('rate limiting', () => {
  it('refuses over the limit, before any lookup', async () => {
    h.checkRateLimit.mockResolvedValueOnce(false);
    const res = await call();
    expect(res.status).toBe(429);
    expect(h.findServablePublication).not.toHaveBeenCalled();
  });
});
