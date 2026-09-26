// src/lib/server/parkingRetention.test.js
import { describe, it, expect, vi } from 'vitest';
import { runParkingRetention } from './parkingRetention.js';

function db(dry, real) {
  const rpc = vi.fn(async (_fn, p) => ({ data: p.p_dry_run ? dry : real, error: null }));
  return { rpc };
}

describe('runParkingRetention', () => {
  it('deletes the licence documents in the way, then runs the rule for real, recording who ran it', async () => {
    const d = db({ documents_due: ['doc1', 'doc2'] }, { agreements: 1, documents_due: [] });
    const deleteDocument = vi.fn(async () => {});
    const out = await runParkingRetention(d, { deleteDocument, runBy: 'admin1' });
    expect(deleteDocument.mock.calls.map(c => c[0])).toEqual(['doc1', 'doc2']);
    expect(d.rpc.mock.calls[0][1]).toEqual({ p_dry_run: true });
    expect(d.rpc.mock.calls[1][1]).toEqual({ p_dry_run: false, p_run_by: 'admin1' });
    // The deletions happen BEFORE the real run, or the agreement is held back again.
    expect(deleteDocument.mock.invocationCallOrder[1]).toBeLessThan(d.rpc.mock.invocationCallOrder[1]);
    expect(out).toEqual({ agreements: 1, documents_removed: 2, documents_failed: 0 });
  });

  it('a document that will not delete is counted, and the run still happens (its agreement stays held back)', async () => {
    const d = db({ documents_due: ['doc1'] }, { agreements: 0, held_back_documents: 1 });
    const deleteDocument = vi.fn(async () => { throw new Error('Drive said no'); });
    const out = await runParkingRetention(d, { deleteDocument, runBy: 'admin1' });
    expect(out).toMatchObject({ documents_removed: 0, documents_failed: 1, held_back_documents: 1 });
  });

  it('never returns the document ids', async () => {
    const d = db({ documents_due: [] }, { agreements: 0, documents_due: ['x'] });
    const out = await runParkingRetention(d, { deleteDocument: vi.fn(), runBy: 'a' });
    expect(out).not.toHaveProperty('documents_due');
  });
});
