// src/lib/apps/inspection/publicSurvey.test.js
// loadSurvey / undoSurvey (migration 287): the evidence goes up FIRST, the rows go
// to the database function as checked, and a refused load removes the evidence again.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  api: { get: vi.fn(async () => []), rpc: vi.fn(async () => ({ rows: 1, status_changes: 1 })) },
  uploadDocument: vi.fn(async (file) => ({ id: `doc-${file.name}` })),
  deleteDocumentsFor: vi.fn(async () => 2),
  logAudit: vi.fn(),
}));

vi.mock('#lib/utils/api.js', () => ({ api: h.api }));
vi.mock('#lib/utils/mediaAttachments.js', () => ({ purgeAttachments: vi.fn(), listAttachments: vi.fn(async () => []) }));
vi.mock('#lib/utils/driveUtils.js', () => ({ normalisePhotoUrl: (u) => u }));
vi.mock('#lib/utils/authHeaders.js', () => ({ authHeaders: vi.fn(async () => ({})), accessToken: vi.fn(async () => 't') }));
vi.mock('#lib/apps/golden_thread/public.js', () => ({ registerDocument: vi.fn(), findDocumentBySource: vi.fn() }));
vi.mock('#lib/utils/documentApi.js', () => ({ uploadDocument: h.uploadDocument, deleteDocumentsFor: h.deleteDocumentsFor }));
vi.mock('#lib/utils/uploadChunks.js', () => ({ sha256Hex: vi.fn(async () => 'sha-1') }));
vi.mock('#lib/utils/auditLogger.js', () => ({ logAudit: h.logAudit }));

const { loadSurvey, undoSurvey } = await import('./public.js');

const file = { name: 'survey.xlsx' };
const report = { name: 'report.pdf' };
const details = { firm: 'Spartafire', reference: 'J123', definition_id: 'ob1', template_version: 'survey-template/1' };
const rows = [{ component_id: 'd1', ref: 'G/A/01', date: '2026-10-04', inspected_at: '2026-10-04T09:15:00.000Z', result: 'ok' }];

beforeEach(() => vi.clearAllMocks());

describe('loadSurvey', () => {
  it('attaches the report and the file first, then loads the rows as checked', async () => {
    const out = await loadSurvey({ file, report, details, rows });
    const order = [h.uploadDocument.mock.invocationCallOrder[0], h.uploadDocument.mock.invocationCallOrder[1], h.api.rpc.mock.invocationCallOrder[0]];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const [, meta] = h.uploadDocument.mock.calls[0];
    expect(meta).toMatchObject({ entity_type: 'inspection_survey', entity_id: out.id });
    expect(meta.folder_path).toMatch(/^Surveys\/J123 \(/);
    const [fn, args] = h.api.rpc.mock.calls[0];
    expect(fn).toBe('survey_load');
    expect(args.p_survey).toMatchObject({ id: out.id, file_sha256: 'sha-1', report_document_id: 'doc-report.pdf', file_document_id: 'doc-survey.xlsx', firm: 'Spartafire' });
    expect(args.p_rows).toEqual([{ component_id: 'd1', inspected_at: '2026-10-04T09:15:00.000Z', result: 'ok' }]);
    expect(h.deleteDocumentsFor).not.toHaveBeenCalled();
  });

  it('removes the evidence again when the load is refused, and says why', async () => {
    h.api.rpc.mockRejectedValueOnce(new Error('A component has two results on one day.'));
    await expect(loadSurvey({ file, report, details, rows })).rejects.toThrow('two results on one day');
    expect(h.deleteDocumentsFor).toHaveBeenCalledWith('inspection_survey', expect.any(String));
  });

  it('refuses a file already loaded, before uploading anything', async () => {
    h.api.get.mockResolvedValueOnce([{ firm: 'Spartafire', loaded_at: '2026-11-01T10:00:00Z', undone_at: null }]);
    await expect(loadSurvey({ file, report, details, rows })).rejects.toThrow('was loaded on');
    expect(h.uploadDocument).not.toHaveBeenCalled();
  });
});

describe('undoSurvey', () => {
  it('undoes through the database function, with the reason', async () => {
    await undoSurvey('s1', 'Wrong doors');
    expect(h.api.rpc).toHaveBeenCalledWith('survey_undo', { p_id: 's1', p_reason: 'Wrong doors' });
  });
});
