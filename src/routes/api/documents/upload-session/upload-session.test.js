// src/routes/api/documents/upload-session/upload-session.test.js
//
// A file too large for one request goes up in pieces. What must hold: the same
// permission check as a normal upload, a piece only ever reaches the address the
// server signed, the record comes from the receipt, and nothing is left in storage
// with no row naming it.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
  let auth;
  return {
    getAuth: () => auth,
    setAuth: (a) => { auth = a; },
    canAttachDocument: vi.fn(),
    recordStoredFile: vi.fn(),
    uploadFolderFor: vi.fn(),
    provider: {
      startResumableUpload: vi.fn(),
      sendUploadChunk: vi.fn(),
      uploadProgress: vi.fn(),
      deleteFile: vi.fn(),
      storedFile: (fileId, folderId) => ({ fileId, folderId }),
    },
  };
});

vi.mock('@sveltejs/kit', () => ({ json: (body, init) => ({ body, status: init?.status ?? 200 }) }));
vi.mock('$app/env/private', async () => (await import('#lib/testing/envMock.test-helper.js')).envModule('private', { SUPABASE_SERVICE_ROLE_KEY: 'k' }));
vi.mock('#lib/server/requireAuth.js', () => ({ requireAuth: () => Promise.resolve(h.getAuth()) }));
vi.mock('#lib/server/documentLibrary.js', () => ({ uploadFolderFor: h.uploadFolderFor, recordStoredFile: h.recordStoredFile }));
vi.mock('#lib/server/documentAccess.js', () => ({ canAttachDocument: h.canAttachDocument, bearerToken: () => 'tok' }));
vi.mock('#lib/server/storage/index.js', () => ({ storageProvider: h.provider }));
vi.mock('#lib/server/policies.js', () => ({ serverPolicy: () => Promise.resolve(200) }));

const { POST, PUT } = await import('./+server.js');
const { POST: FINISH } = await import('./finish/+server.js');
const { UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_UNIT } = await import('#lib/utils/uploadChunks.js');

const SIZE = UPLOAD_CHUNK_BYTES + 10;
const ADDRESS = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc';
const SHA = 'a'.repeat(64);

const start = (body = {}) => POST({ request: {
  json: () => Promise.resolve({ filename: 'report.pdf', size: SIZE, mimeType: 'application/pdf', meta: { folder_path: 'Surveys/One', entity_type: 'x', entity_id: 'y' }, ...body }),
} });
const piece = (ticket, offset, length, extra = {}) => PUT({ request: {
  headers: new Headers({ 'x-upload-ticket': ticket, 'x-upload-offset': String(offset), ...extra }),
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(length)),
} });
const finish = (receipt, checksum = SHA, meta = {}) => FINISH({ request: { json: () => Promise.resolve({ receipt, checksum, meta }) } });

async function receipt() {
  const { body } = await start();
  h.provider.sendUploadChunk.mockResolvedValueOnce({ done: true, fileId: 'f1', size: SIZE, sha256: SHA });
  return (await piece(body.ticket, UPLOAD_CHUNK_BYTES, 10)).body.receipt;
}

beforeEach(() => {
  vi.resetAllMocks();
  h.setAuth({ user: { id: 'u1' }, isAdmin: false, error: null });
  h.canAttachDocument.mockResolvedValue({ ok: true });
  h.uploadFolderFor.mockResolvedValue('folder1');
  h.provider.startResumableUpload.mockResolvedValue(ADDRESS);
  h.provider.deleteFile.mockResolvedValue();
  h.recordStoredFile.mockResolvedValue({ id: 'doc1' });
});

describe('starting an upload', () => {
  it('needs a login', async () => {
    h.setAuth({ error: { status: 401 } });
    expect((await start()).status).toBe(401);
    expect(h.provider.startResumableUpload).not.toHaveBeenCalled();
  });

  it('is refused for a record the caller cannot read', async () => {
    h.canAttachDocument.mockResolvedValue({ ok: false });
    expect((await start()).status).toBe(403);
    expect(h.provider.startResumableUpload).not.toHaveBeenCalled();
  });

  it('is refused over the size the policy allows, and says the limit', async () => {
    const res = await start({ size: 201 * 1024 * 1024 });
    expect(res.status).toBe(413);
    expect(res.body.error).toContain('200 MB');
  });

  it('never gives the bare address back, only a ticket', async () => {
    const res = await start();
    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['ticket']);
  });

  it('tells the browser when this storage takes no pieces', async () => {
    const real = h.provider.startResumableUpload;
    h.provider.startResumableUpload = undefined;
    expect((await start()).status).toBe(501);
    h.provider.startResumableUpload = real;
  });
});

describe('sending a piece', () => {
  it('sends to the signed address and reports what storage holds', async () => {
    const { body } = await start();
    h.provider.sendUploadChunk.mockResolvedValue({ done: false, received: UPLOAD_CHUNK_BYTES });
    const res = await piece(body.ticket, 0, UPLOAD_CHUNK_BYTES);
    expect(res.body).toEqual({ received: UPLOAD_CHUNK_BYTES });
    expect(h.provider.sendUploadChunk.mock.calls[0][0]).toBe(ADDRESS);
    expect(h.provider.sendUploadChunk.mock.calls[0][1]).toMatchObject({ offset: 0, total: SIZE });
  });

  it('refuses a changed ticket, and sends nothing', async () => {
    const { body } = await start();
    const [data, sig] = body.ticket.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(data, 'base64url')), address: 'http://169.254.169.254/' })).toString('base64url');
    expect((await piece(`${forged}.${sig}`, 0, UPLOAD_CHUNK_BYTES)).status).toBe(403);
    expect(h.provider.sendUploadChunk).not.toHaveBeenCalled();
  });

  it('refuses another person’s ticket', async () => {
    const { body } = await start();
    h.setAuth({ user: { id: 'u2' }, error: null });
    expect((await piece(body.ticket, 0, UPLOAD_CHUNK_BYTES)).status).toBe(403);
  });

  it('refuses a receipt used as a ticket', async () => {
    const r = await receipt();
    expect((await piece(r, 0, UPLOAD_CHUNK_BYTES)).status).toBe(403);
  });

  it('refuses a piece that is too big, runs past the end, or breaks Drive’s unit', async () => {
    const { body } = await start();
    for (const [offset, length] of [[0, UPLOAD_CHUNK_BYTES + UPLOAD_CHUNK_UNIT], [UPLOAD_CHUNK_BYTES, 11], [0, UPLOAD_CHUNK_UNIT + 1]]) {
      expect((await piece(body.ticket, offset, length)).status).toBe(400);
    }
    expect(h.provider.sendUploadChunk).not.toHaveBeenCalled();
  });

  it('asks storage where it got to, without sending anything', async () => {
    const { body } = await start();
    h.provider.uploadProgress.mockResolvedValue({ done: false, received: 42 });
    const res = await PUT({ request: { headers: new Headers({ 'x-upload-ticket': body.ticket, 'x-upload-status': '1' }) } });
    expect(res.body).toEqual({ received: 42 });
    expect(h.provider.sendUploadChunk).not.toHaveBeenCalled();
  });

  it('removes a finished file of the wrong size, and gives no receipt', async () => {
    const { body } = await start();
    h.provider.sendUploadChunk.mockResolvedValue({ done: true, fileId: 'f1', size: 5, sha256: SHA });
    const res = await piece(body.ticket, UPLOAD_CHUNK_BYTES, 10);
    expect(res.status).toBe(422);
    expect(res.body.receipt).toBeUndefined();
    expect(h.provider.deleteFile).toHaveBeenCalledWith('f1');
  });
});

describe('finishing', () => {
  it('records from the receipt, whatever the request says', async () => {
    const r = await receipt();
    const res = await finish(r, SHA, { folder_path: 'Elsewhere', entity_type: 'other', entity_id: 'z', description: 'Report' });
    expect(res.status).toBe(201);
    const [stored, file, record, user] = h.recordStoredFile.mock.calls[0];
    expect(stored).toEqual({ fileId: 'f1', folderId: 'folder1' });
    expect(file).toEqual({ filename: 'report.pdf', mimeType: 'application/pdf', size: SIZE, checksum: SHA });
    expect(record).toMatchObject({ folder_path: 'Surveys/One', entity_type: 'x', entity_id: 'y', description: 'Report' });
    expect(user).toBe('u1');
  });

  it('removes the file when the bytes do not match, and records nothing', async () => {
    const res = await finish(await receipt(), 'b'.repeat(64));
    expect(res.status).toBe(422);
    expect(h.provider.deleteFile).toHaveBeenCalledWith('f1');
    expect(h.recordStoredFile).not.toHaveBeenCalled();
  });

  it('removes the file when the row cannot be written', async () => {
    h.recordStoredFile.mockRejectedValue(new Error('no'));
    expect((await finish(await receipt())).status).toBe(500);
    expect(h.provider.deleteFile).toHaveBeenCalledWith('f1');
  });

  it('removes the file when permission has gone since the start', async () => {
    const r = await receipt();
    h.canAttachDocument.mockResolvedValue({ ok: false });
    expect((await finish(r)).status).toBe(403);
    expect(h.provider.deleteFile).toHaveBeenCalledWith('f1');
  });

  it('refuses a session ticket as a receipt, and leaves storage alone', async () => {
    const { body } = await start();
    expect((await finish(body.ticket)).status).toBe(403);
    expect(h.provider.deleteFile).not.toHaveBeenCalled();
  });
});
