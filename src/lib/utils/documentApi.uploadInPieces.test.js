// src/lib/utils/documentApi.uploadInPieces.test.js
//
// The browser's half of a large upload: every byte goes once, in order, and a
// dropped piece is picked up from where storage says it got to.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('#lib/utils/authHeaders.js', () => ({ accessToken: () => Promise.resolve('tok') }));

const { uploadDocument, uploadInPieces } = await import('./documentApi.js');
const { UPLOAD_CHUNK_BYTES } = await import('./uploadChunks.js');

const reply = (body, status = 200) => ({ status, ok: status < 400, json: () => Promise.resolve(body) });
const SIZE = UPLOAD_CHUNK_BYTES * 2 + 100;
const file = () => new File([new Uint8Array(SIZE)], 'report.pdf', { type: 'application/pdf' });
const noPause = { pause: () => Promise.resolve() };

/** A fake server. `drop` names the offsets whose first send fails after storage kept it. */
function server({ drop = new Set(), never = false } = {}) {
  const log = { sent: [], status: 0, finished: null };
  let held = 0;
  globalThis.fetch = vi.fn(async (url, init) => {
    if (init.method === 'POST' && url.endsWith('/finish')) { log.finished = JSON.parse(init.body); return reply({ id: 'doc1' }, 201); }
    if (init.method === 'POST') return reply({ ticket: 't' }, 201);
    if (never) throw new TypeError('Failed to fetch');
    if (init.headers['X-Upload-Status']) {
      log.status++;
      return reply(held === SIZE ? { receipt: 'r', received: SIZE } : { received: held });
    }
    const offset = Number(init.headers['X-Upload-Offset']);
    log.sent.push([offset, init.body.size]);
    held = offset + init.body.size;
    if (drop.delete(offset)) throw new TypeError('Failed to fetch');
    return reply(held === SIZE ? { receipt: 'r', received: SIZE } : { received: held });
  });
  return log;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
beforeEach(() => vi.clearAllMocks());

describe('uploadInPieces', () => {
  it('sends the file once, in order, then finishes with its checksum', async () => {
    const log = server();
    expect(await uploadInPieces(file(), { description: 'x' }, noPause)).toEqual({ id: 'doc1' });
    expect(log.sent).toEqual([[0, UPLOAD_CHUNK_BYTES], [UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_BYTES], [UPLOAD_CHUNK_BYTES * 2, 100]]);
    expect(log.finished).toMatchObject({ receipt: 'r', meta: { description: 'x' } });
    expect(log.finished.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('picks up after a dropped piece without sending kept bytes again', async () => {
    const log = server({ drop: new Set([UPLOAD_CHUNK_BYTES]) });
    await uploadInPieces(file(), {}, noPause);
    expect(log.status).toBe(1);
    expect(log.sent.map(([o]) => o)).toEqual([0, UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_BYTES * 2]);
  });

  it('finishes when the answer to the last piece was the part that got lost', async () => {
    const log = server({ drop: new Set([UPLOAD_CHUNK_BYTES * 2]) });
    expect(await uploadInPieces(file(), {}, noPause)).toEqual({ id: 'doc1' });
    expect(log.finished.receipt).toBe('r');
  });

  it('gives up and says so, rather than trying for ever', async () => {
    server({ never: true });
    await expect(uploadInPieces(file(), {}, noPause)).rejects.toThrow('Failed to fetch');
  });

  it('shows the server’s reason when it will not start', async () => {
    globalThis.fetch = vi.fn(async () => reply({ error: 'File exceeds the 200 MB limit' }, 413));
    await expect(uploadInPieces(file(), {}, noPause)).rejects.toThrow('200 MB');
  });
});

describe('uploadDocument', () => {
  it('sends a small file in one request', async () => {
    globalThis.fetch = vi.fn(async () => reply({ id: 'small' }, 201));
    await uploadDocument(new File([new Uint8Array(10)], 'a.txt'), {});
    expect(globalThis.fetch.mock.calls.map((c) => c[0])).toEqual(['/api/documents/upload']);
  });

  it('sends a large file whole where storage takes no pieces', async () => {
    globalThis.fetch = vi.fn(async (url) => (url.endsWith('upload-session') ? reply({}, 501) : reply({ id: 'whole' }, 201)));
    expect(await uploadDocument(file(), {})).toEqual({ id: 'whole' });
  });
});
