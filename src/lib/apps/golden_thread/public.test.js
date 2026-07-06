// src/lib/apps/golden_thread/public.test.js
// The Golden Thread L2 public interface — producer ingest surface (Stage B).
// Seams mocked: api, request (postJson), documentApi.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: {
    get:      vi.fn(),
    getById:  vi.fn(),
    getAllIn: vi.fn(),
    create:   vi.fn(),
    update:   vi.fn(),
  },
  postJson: vi.fn(),
  uploadDocument: vi.fn(),
}));

vi.mock('$lib/utils/api',         () => ({ api: h.api }));
vi.mock('$lib/utils/request',     () => ({ postJson: h.postJson }));
vi.mock('$lib/utils/documentApi', () => ({ uploadDocument: h.uploadDocument }));

const { registerExistingArtifact, findDocumentBySource, findDocumentsBySources, listDocumentsCiting } = await import('./public.js');

beforeEach(() => vi.clearAllMocks());

describe('findDocumentBySource', () => {
  it('returns the register doc produced from a source entity', async () => {
    h.api.get.mockResolvedValueOnce([{ source_id: 'gt-1' }]);
    h.api.getById.mockResolvedValueOnce({ id: 'gt-1', reference: 'GT-000001', status: 'draft' });
    const res = await findDocumentBySource('maintenance_document', 'md-1');
    expect(h.api.get).toHaveBeenCalledWith('gt_links', expect.objectContaining({
      filters: expect.objectContaining({ target_type: 'maintenance_document', target_id: 'md-1', relation: 'produced_by' }),
    }));
    expect(res).toMatchObject({ id: 'gt-1', reference: 'GT-000001' });
  });

  it('returns null when nothing is registered', async () => {
    h.api.get.mockResolvedValueOnce([]);
    expect(await findDocumentBySource('walk_session', 's1')).toBeNull();
    expect(h.api.getById).not.toHaveBeenCalled();
  });
});

describe('listDocumentsCiting', () => {
  it('resolves citing gt_documents for a target entity (one links + one docs query)', async () => {
    h.api.get.mockResolvedValueOnce([
      { id: 'l1', source_id: 'gt-1', source_type: 'gt_document', target_type: 'mor_case', target_id: 'm1', relation: 'cites' },
      { id: 'l2', source_id: 'gt-2', source_type: 'gt_document', target_type: 'mor_case', target_id: 'm1', relation: 'evidences' },
    ]);
    h.api.getAllIn.mockResolvedValueOnce([
      { id: 'gt-1', reference: 'GT-000001', title: 'Fire strategy', status: 'current' },
      { id: 'gt-2', reference: 'GT-000002', title: 'FRA', status: 'draft' },
    ]);
    const res = await listDocumentsCiting('mor_case', 'm1');
    expect(h.api.get).toHaveBeenCalledWith('gt_links', expect.objectContaining({
      filters: expect.objectContaining({ target_type: 'mor_case', target_id: 'm1', source_type: 'gt_document' }),
    }));
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ id: 'l1', document: { reference: 'GT-000001', status: 'current' } });
    expect(res[1].document).toMatchObject({ reference: 'GT-000002' });
  });

  it('returns [] when nothing cites the entity (no docs query)', async () => {
    h.api.get.mockResolvedValueOnce([]);
    expect(await listDocumentsCiting('mor_case', 'm1')).toEqual([]);
    expect(h.api.getAllIn).not.toHaveBeenCalled();
  });

  it('attaches null document when the citing doc row is missing', async () => {
    h.api.get.mockResolvedValueOnce([{ id: 'l1', source_id: 'gt-x', target_type: 'mor_case', target_id: 'm1', relation: 'cites' }]);
    h.api.getAllIn.mockResolvedValueOnce([]);
    const res = await listDocumentsCiting('mor_case', 'm1');
    expect(res[0].document).toBeNull();
  });
});

describe('findDocumentsBySources', () => {
  it('batches: one links query + one docs query, keyed by target id', async () => {
    h.api.getAllIn
      .mockResolvedValueOnce([   // gt_links rows (client-side filtered)
        { source_type: 'gt_document', target_type: 'walk_session', relation: 'produced_by', source_id: 'gt-1', target_id: 's1' },
        { source_type: 'gt_document', target_type: 'walk_session', relation: 'evidences',   source_id: 'gt-2', target_id: 's2' }, // wrong relation → dropped
      ])
      .mockResolvedValueOnce([{ id: 'gt-1', reference: 'GT-000001', status: 'draft' }]);

    const map = await findDocumentsBySources('walk_session', ['s1', 's2']);
    expect(h.api.getAllIn).toHaveBeenCalledTimes(2);
    expect(map).toEqual({ s1: { id: 'gt-1', reference: 'GT-000001', status: 'draft' } });
  });

  it('returns {} for empty input without querying', async () => {
    expect(await findDocumentsBySources('walk_session', [])).toEqual({});
    expect(h.api.getAllIn).not.toHaveBeenCalled();
  });
});

describe('registerExistingArtifact', () => {
  it('creates a draft, copies the library file server-side, sets storage+checksum, links produced_by', async () => {
    h.api.create.mockResolvedValueOnce({ id: 'gt-9' });                 // draft
    h.postJson.mockResolvedValueOnce({ storage_uri: 'document_library:copy-1', file_checksum: 'abc123' });
    h.api.update.mockResolvedValueOnce({ id: 'gt-9', storage_uri: 'document_library:copy-1', file_checksum: 'abc123' });
    h.api.create.mockResolvedValueOnce({ id: 'link-1' });              // produced_by link

    const meta = { sourceDocId: 'lib-7', schedule1_category: 10, document_type: 'Test / inspection certificate', title: 'cert' };
    const res = await registerExistingArtifact(meta, { producedBy: { type: 'maintenance_document', id: 'md-1' } }, 'user-1');

    // draft insert carried the metadata + actor, NOT the sourceDocId column
    expect(h.api.create.mock.calls[0][0]).toBe('gt_documents');
    expect(h.api.create.mock.calls[0][1]).toMatchObject({ created_by: 'user-1', schedule1_category: 10, document_type: 'Test / inspection certificate' });
    expect(h.api.create.mock.calls[0][1].sourceDocId).toBeUndefined();

    // server copy called with the draft id
    expect(h.postJson).toHaveBeenCalledWith('/api/golden-thread/ingest-artifact', { sourceDocId: 'lib-7', entityId: 'gt-9' }, expect.any(String));

    // storage_uri + checksum written back
    expect(h.api.update).toHaveBeenCalledWith('gt_documents', 'gt-9',
      expect.objectContaining({ storage_uri: 'document_library:copy-1', file_checksum: 'abc123' }), true);

    // produced_by link
    expect(h.api.create.mock.calls[1][1]).toMatchObject({
      source_type: 'gt_document', source_id: 'gt-9', target_type: 'maintenance_document', target_id: 'md-1', relation: 'produced_by',
    });
    expect(res.id).toBe('gt-9');
  });

  it('requires a sourceDocId', async () => {
    await expect(registerExistingArtifact({}, null, 'u')).rejects.toThrow(/sourceDocId/);
  });
});
