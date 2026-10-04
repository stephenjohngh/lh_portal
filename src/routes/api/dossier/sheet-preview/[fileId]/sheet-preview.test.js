// src/routes/api/dossier/sheet-preview/[fileId]/sheet-preview.test.js
// A spreadsheet preview is only for someone who may read that document
// (security review, 2026-09-27). It used to be enough that the file was in the
// library at all.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  doc: /** @type {any} */ (null),
  allowed: { ok: true },
  getFileStream: vi.fn(),
}));

vi.mock('#lib/server/requireAuth.js', () => ({
  requireAuth: async () => ({ user: { id: 'u1' }, isAdmin: false, error: null }),
}));
vi.mock('#lib/server/documentLibrary.js', () => ({ getDocumentByFileId: async () => h.doc }));
vi.mock('#lib/server/documentAccess.js', () => ({
  canAccessDocument: async () => h.allowed,
  bearerToken: () => 'tok',
}));
vi.mock('#lib/server/storage/index.js', () => ({ ownerOf: () => ({ getFileStream: h.getFileStream }) }));
vi.mock('#lib/server/storage/storageRef.js', () => ({ isStorageId: () => true }));
vi.mock('#lib/server/storage/storageErrors.js', () => ({ friendlyStorageError: (e) => String(e) }));
vi.mock('#lib/server/sheetReader.js', () => ({
  MAX_SHEET_BYTES: 1_000_000,
  readSheetPreview: async () => ({ rows: [['a']] }),
}));

const { GET } = await import('./+server.js');
const call = () => GET({ params: { fileId: 'abc' }, request: new Request('http://x'), url: new URL('http://x/') });

beforeEach(() => {
  vi.clearAllMocks();
  h.doc = { id: 'd', entity_type: 'dossier_pack', entity_id: 'p', provider: 'google_drive' };
  h.allowed = { ok: true };
  h.getFileStream.mockResolvedValue({ data: Buffer.from('x') });
});

describe('GET /api/dossier/sheet-preview/:fileId', () => {
  it('previews a document the caller may read', async () => {
    expect((await call()).status).toBe(200);
  });

  it('refuses a document the caller may not read, without reading the file', async () => {
    h.allowed = { ok: false };
    expect((await call()).status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });

  it('refuses a file that is not in the library', async () => {
    h.doc = null;
    expect((await call()).status).toBe(404);
    expect(h.getFileStream).not.toHaveBeenCalled();
  });
});
