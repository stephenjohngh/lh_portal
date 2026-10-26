import { describe, it, expect } from 'vitest';
import { isLinkOf, mergeDocumentAudit, describeLinkAudit } from './gtAuditHistory.js';

const link = (seq, action, data) => ({ seq, action, target_table: 'gt_links',
  after_data: action === 'delete' ? null : data, before_data: action === 'delete' ? data : null });
const out = { source_type: 'gt_document', source_id: 'D1', target_type: 'mor_case', target_id: 'M1', relation: 'cites' };
const inc = { source_type: 'gt_document', source_id: 'D2', target_type: 'gt_document', target_id: 'D1', relation: 'evidences' };
const doc = (seq) => ({ seq, action: 'update', target_table: 'gt_documents' });

describe('a document\'s audit history includes its citations', () => {
  it('recognises a citation from, or to, the document — and no other', () => {
    expect(isLinkOf(link(5, 'insert', out), 'D1')).toBe(true);
    expect(isLinkOf(link(6, 'insert', inc), 'D1')).toBe(true);
    expect(isLinkOf(link(7, 'insert', { ...out, source_id: 'D9' }), 'D1')).toBe(false);
    expect(isLinkOf(doc(1), 'D1')).toBe(false);
  });

  it('a mor_case target with the same id as the document is not a citation of it', () => {
    expect(isLinkOf(link(8, 'insert', { ...out, source_type: 'risk', source_id: 'X', target_type: 'mor_case', target_id: 'D1' }), 'D1')).toBe(false);
  });

  it('merges in chain order', () => {
    const merged = mergeDocumentAudit([doc(1), doc(4)], [link(3, 'insert', out), link(9, 'insert', { ...out, source_id: 'D9' })], 'D1');
    expect(merged.map((r) => r.seq)).toEqual([1, 3, 4]);
  });

  it('describes an addition and a removal, from either side', () => {
    expect(describeLinkAudit(link(3, 'insert', out), 'D1')).toBe('Citation added — cites mor_case');
    expect(describeLinkAudit(link(4, 'delete', out), 'D1')).toBe('Citation removed — cites mor_case');
    expect(describeLinkAudit(link(5, 'insert', inc), 'D1')).toBe('Citation added — cited by gt_document (evidences)');
    expect(describeLinkAudit(doc(1), 'D1')).toBeNull();
  });
});
