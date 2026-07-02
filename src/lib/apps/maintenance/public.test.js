// src/lib/apps/maintenance/public.test.js
// The Maintenance app's public interface — the cross-app contract for jobs and
// their certificates. Pins the Golden Thread registration mapping + guard.
// Seams mocked: api, golden_thread/public.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: { getById: vi.fn() },
  registerExistingArtifact: vi.fn(async () => ({ id: 'gt-1', reference: 'GT-000001' })),
  findDocumentBySource: vi.fn(async () => null),
}));

vi.mock('$lib/utils/api', () => ({ api: h.api }));
vi.mock('$lib/apps/golden_thread/public.js', () => ({
  registerExistingArtifact: h.registerExistingArtifact,
  findDocumentBySource: h.findDocumentBySource,
}));

const { registerCertificateToGoldenThread, findRegisteredCertificate } = await import('./public.js');

beforeEach(() => vi.clearAllMocks());

describe('registerCertificateToGoldenThread', () => {
  it('maps a certificate to the GT draft + produced_by link (defaults: cat 10)', async () => {
    h.api.getById.mockResolvedValueOnce({
      id: 'md-1', job_id: 'job-9', library_doc_id: 'lib-7', doc_type: 'certificate', filename: 'gas-cert.pdf',
    });

    await registerCertificateToGoldenThread('md-1', {}, 'user-1');

    expect(h.registerExistingArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDocId: 'lib-7',
        schedule1_category: 10,
        document_type: 'Test / inspection certificate', // mapped from doc_type 'certificate'
        title: 'gas-cert.pdf',
      }),
      { producedBy: { type: 'maintenance_document', id: 'md-1' } },
      'user-1',
    );
  });

  it('honours caller overrides', async () => {
    h.api.getById.mockResolvedValueOnce({ id: 'md-2', job_id: 'j', library_doc_id: 'lib-2', doc_type: 'report', filename: 'x' });
    await registerCertificateToGoldenThread('md-2', { schedule1_category: 9, title: 'Structural cert' }, 'u');
    expect(h.registerExistingArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ schedule1_category: 9, title: 'Structural cert' }),
      expect.any(Object), 'u',
    );
  });

  it('refuses a legacy cert with no library_doc_id (not in document_library)', async () => {
    h.api.getById.mockResolvedValueOnce({ id: 'md-3', job_id: 'j', library_doc_id: null, filename: 'old.pdf' });
    await expect(registerCertificateToGoldenThread('md-3', {}, 'u')).rejects.toThrow(/unified storage/i);
    expect(h.registerExistingArtifact).not.toHaveBeenCalled();
  });
});

describe('findRegisteredCertificate', () => {
  it('looks up the produced_by link by maintenance_document', () => {
    findRegisteredCertificate('md-1');
    expect(h.findDocumentBySource).toHaveBeenCalledWith('maintenance_document', 'md-1');
  });
});
