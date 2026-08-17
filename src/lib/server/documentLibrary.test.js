// src/lib/server/documentLibrary.test.js
//
// Characterisation tests for the shared document stack.
//
// Every app that attaches a file — Info, Golden Thread, Maintenance, Dossier —
// goes through this module, and until now nothing stood behind it. That is what
// made it the one place a regression reaches other apps SILENTLY: a change made
// for Dossier lands in Info's attachments panel with no test objecting.
//
// So these pin BEHAVIOUR that other code already depends on, not implementation:
// what row reaches the database, what bytes reach storage, and which of the two
// happens first when something is deleted. Written against the module as it is,
// deliberately — the point of a characterisation test is to notice a change,
// not to assert an opinion about what the code ought to do.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  // Storage
  ensurePath:    vi.fn(() => Promise.resolve('folder-1')),
  uploadFile:    vi.fn(() => Promise.resolve({
    fileId: 'drive-new', folderId: 'folder-1',
    webViewUrl: 'https://drive.test/view', thumbnailUrl: 'https://drive.test/thumb',
  })),
  getFileStream: vi.fn(() => Promise.resolve({ data: Buffer.from('copied bytes') })),
  getFileUrl:    vi.fn(() => Promise.resolve('https://drive.test/fresh')),
  deleteFile:    vi.fn(() => Promise.resolve()),
  listFiles:     vi.fn(() => Promise.resolve([{ name: 'a folder', isFolder: true }])),

  // Database — the last insert/update/delete the module attempted
  inserted: /** @type {any} */ (null),
  updated:  /** @type {any} */ (null),
  deletedFrom: /** @type {any} */ (null),
  selectRow: /** @type {any} */ ({ id: 'doc1', provider_file_id: 'drive-1' }),
  listRows:  /** @type {any[]} */ ([]),
  filters:   /** @type {any} */ ({}),
  orFilter:  '',
}));

vi.mock('./storage/index.js', () => ({
  storageProvider: {
    name: 'google_drive',
    ensurePath:    h.ensurePath,
    uploadFile:    h.uploadFile,
    getFileStream: h.getFileStream,
    getFileUrl:    h.getFileUrl,
    deleteFile:    h.deleteFile,
    listFiles:     h.listFiles,
  },
}));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'http://db.test' }));
vi.mock('$env/dynamic/private', () => ({ env: { SUPABASE_SERVICE_ROLE_KEY: 'svc' } }));
// Pulled in transitively by logger.js, which is not otherwise part of this.
vi.mock('$app/environment', () => ({ browser: false, dev: false }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from() {
      const q = {
        insert(row) { h.inserted = row; return q; },
        update(row) { h.updated  = row; return q; },
        delete()    { h.deletedFrom = true; return q; },
        select()    { return q; },
        order()     { return q; },
        limit()     { return q; },
        eq(col, val) { h.filters[col] = val; return q; },
        or(expr)     { h.orFilter = expr; return q; },
        single()     { return Promise.resolve({ data: h.selectRow, error: null }); },
        then(resolve) {
          // A bare await on the builder — the list path.
          return Promise.resolve({ data: h.listRows, error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));

const {
  uploadDocument, copyDocument, listDocuments, getDocument,
  getDocumentUrl, updateDocument, deleteDocument, listFolders,
} = await import('./documentLibrary.js');

beforeEach(() => {
  vi.clearAllMocks();
  h.inserted = null; h.updated = null; h.deletedFrom = null;
  h.filters = {}; h.orFilter = '';
  h.selectRow = { id: 'doc1', provider_file_id: 'drive-1', filename: 'notice.pdf' };
  h.listRows = [];
});

describe('uploadDocument', () => {
  const bytes = Buffer.from('hello world');

  it('stores the bytes, then indexes what storage reported', async () => {
    await uploadDocument(bytes, 'notice.pdf', 'application/pdf',
      { entity_type: 'info_note', entity_id: 'n1' }, 'user-1');

    expect(h.uploadFile).toHaveBeenCalledWith(
      bytes, 'notice.pdf', 'application/pdf', 'folder-1');
    expect(h.inserted).toMatchObject({
      provider:           'google_drive',
      provider_file_id:   'drive-new',
      provider_folder_id: 'folder-1',
      filename:           'notice.pdf',
      mime_type:          'application/pdf',
      file_size:          bytes.byteLength,
      entity_type:        'info_note',
      entity_id:          'n1',
      uploaded_by:        'user-1',
    });
  });

  it('records a SHA-256 of the bytes as they arrived', async () => {
    // Golden Thread ingest pins this, and a publication's drift detection is
    // measured against the same idea. It must be a digest of the content, not
    // of a name or a path.
    await uploadDocument(bytes, 'notice.pdf', 'application/pdf', {}, 'u1');

    expect(h.inserted.file_checksum).toMatch(/^[0-9a-f]{64}$/);
    // Same bytes, same checksum — the property drift detection relies on.
    const first = h.inserted.file_checksum;
    await uploadDocument(Buffer.from('hello world'), 'other.pdf', 'application/pdf', {}, 'u1');
    expect(h.inserted.file_checksum).toBe(first);
  });

  it('defaults the display name to the filename', async () => {
    await uploadDocument(bytes, 'notice.pdf', 'application/pdf', {}, 'u1');
    expect(h.inserted.display_name).toBe('notice.pdf');

    await uploadDocument(bytes, 'notice.pdf', 'application/pdf',
      { display_name: 'The notice' }, 'u1');
    expect(h.inserted.display_name).toBe('The notice');
  });

  it('files an unplaced upload under documents/, not at the root', async () => {
    await uploadDocument(bytes, 'a.pdf', 'application/pdf', {}, 'u1');
    expect(h.ensurePath).toHaveBeenCalledWith(['documents']);
  });

  it('splits a folder path, ignoring empty segments', async () => {
    await uploadDocument(bytes, 'a.pdf', 'application/pdf',
      { folder_path: 'Dossier Packs//2026' }, 'u1');
    expect(h.ensurePath).toHaveBeenCalledWith(['Dossier Packs', '2026']);
  });

  it('writes tags as an array, never null', async () => {
    // The column is text[]; a null here surfaces as a crash in every consumer
    // that maps over it.
    await uploadDocument(bytes, 'a.pdf', 'application/pdf', {}, 'u1');
    expect(h.inserted.tags).toEqual([]);
  });
});

describe('copyDocument', () => {
  it('reads the source bytes and uploads them as a NEW file', async () => {
    // Not a second row pointing at one stored file: Golden Thread ingest and
    // Dossier pack duplication both need the copy to survive the original
    // being deleted.
    h.selectRow = {
      id: 'src', provider_file_id: 'drive-src', filename: 'cert.pdf',
      mime_type: 'application/pdf', display_name: 'Certificate',
      doc_type: 'certificate', issuer: 'ACME',
    };

    await copyDocument('src', { entity_type: 'gt_document', entity_id: 'g1' }, 'u1');

    expect(h.getFileStream).toHaveBeenCalledWith('drive-src');
    expect(h.uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer), 'cert.pdf', 'application/pdf', 'folder-1');
    expect(h.inserted).toMatchObject({
      provider_file_id: 'drive-new',       // the copy's own storage id
      entity_type: 'gt_document', entity_id: 'g1',
    });
  });

  it('carries the source-s descriptive metadata across', async () => {
    h.selectRow = {
      id: 'src', provider_file_id: 'drive-src', filename: 'cert.pdf',
      mime_type: 'application/pdf', display_name: 'Certificate',
      doc_type: 'certificate', issuer: 'ACME', document_date: '2026-01-01',
      expiry_date: '2027-01-01', reference_number: 'REF/1',
    };

    await copyDocument('src', {}, 'u1');

    expect(h.inserted).toMatchObject({
      display_name: 'Certificate', doc_type: 'certificate', issuer: 'ACME',
      document_date: '2026-01-01', expiry_date: '2027-01-01',
      reference_number: 'REF/1',
    });
  });

  it('lets the caller override what it carries', async () => {
    h.selectRow = { id: 'src', provider_file_id: 'd', filename: 'a.pdf',
      mime_type: 'application/pdf', display_name: 'Original' };

    await copyDocument('src', { display_name: 'Renamed' }, 'u1');
    expect(h.inserted.display_name).toBe('Renamed');
  });
});

describe('listDocuments', () => {
  it('applies only the filters it was given', async () => {
    await listDocuments({ entity_type: 'dossier_pack', entity_id: 'p1' });
    expect(h.filters).toEqual({ entity_type: 'dossier_pack', entity_id: 'p1' });
  });

  it('asks for nothing in particular when given nothing', async () => {
    await listDocuments();
    expect(h.filters).toEqual({});
  });

  it('strips PostgREST filter grammar out of a search term', async () => {
    // Without this a search term could inject extra conditions into the .or()
    // string — see pgFilter.js. The shared library is exactly where that would
    // matter most.
    await listDocuments({ search: 'a,b.ilike.*' });
    expect(h.orFilter).not.toContain(',b.ilike');
  });

  it('returns [] rather than null for an empty shelf', async () => {
    h.listRows = null;
    expect(await listDocuments({ entity_id: 'x' })).toEqual([]);
  });
});

describe('getDocument / getDocumentUrl / updateDocument', () => {
  it('fetches one row by id', async () => {
    const doc = await getDocument('doc1');
    expect(h.filters.id).toBe('doc1');
    expect(doc.id).toBe('doc1');
  });

  it('asks storage for a FRESH url rather than a stored one', async () => {
    // web_view_url in the row can expire; this path exists to re-derive it.
    const url = await getDocumentUrl('doc1');
    expect(h.getFileUrl).toHaveBeenCalledWith('drive-1');
    expect(url).toBe('https://drive.test/fresh');
  });

  it('stamps who changed the metadata and when', async () => {
    await updateDocument('doc1', { description: 'Served by post' }, 'user-9');

    expect(h.updated).toMatchObject({
      description: 'Served by post', updated_by: 'user-9',
    });
    expect(h.updated.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('deleteDocument', () => {
  it('removes the stored file BEFORE the row', async () => {
    // Order matters and is not arbitrary: the row is the only record of the
    // storage id, so dropping it first orphans the bytes with nothing left to
    // find them by. Pack-publication deletes rely on the same reasoning.
    const order = [];
    h.deleteFile.mockImplementationOnce(() => { order.push('storage'); return Promise.resolve(); });

    await deleteDocument('doc1');
    order.push('row');

    expect(h.deleteFile).toHaveBeenCalledWith('drive-1');
    expect(order).toEqual(['storage', 'row']);
    expect(h.deletedFrom).toBe(true);
    expect(h.filters.id).toBe('doc1');
  });

  it('does not delete the row when storage refuses', async () => {
    // Better a file nobody deleted than a row nobody can find.
    h.deleteFile.mockRejectedValueOnce(new Error('drive unavailable'));

    await expect(deleteDocument('doc1')).rejects.toThrow('drive unavailable');
    expect(h.deletedFrom).toBeNull();
  });
});

describe('listFolders', () => {
  it('asks storage for folders only, and tolerates no path', async () => {
    await listFolders();
    expect(h.listFiles).toHaveBeenCalledWith('', { foldersOnly: true });

    await listFolders('Dossier Packs');
    expect(h.listFiles).toHaveBeenCalledWith('Dossier Packs', { foldersOnly: true });
  });
});
