// src/lib/server/gtSharePack.test.js
import { describe, it, expect } from 'vitest';
import { sanitizeName, packPath, buildManifest, renderReadme } from './gtSharePack.js';

describe('sanitizeName', () => {
  it('keeps references and ordinary filenames intact', () => {
    expect(sanitizeName('GT-000001')).toBe('GT-000001');
    expect(sanitizeName('Fire Strategy.pdf')).toBe('Fire Strategy.pdf');
  });
  it('replaces path separators and control chars', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });
  it('strips leading dots and falls back for empty', () => {
    expect(sanitizeName('../etc')).toBe('__etc');   // '/'→'_', then leading '..'→'_'
    expect(sanitizeName('   ')).toBe('file');
    expect(sanitizeName(null)).toBe('file');
  });
});

describe('packPath', () => {
  it('builds files/<reference>/<filename>', () => {
    const seen = new Set();
    expect(packPath('GT-000001', 'cert.pdf', seen)).toBe('files/GT-000001/cert.pdf');
  });
  it('disambiguates duplicate names within a document', () => {
    const seen = new Set();
    expect(packPath('GT-1', 'a.pdf', seen)).toBe('files/GT-1/a.pdf');
    expect(packPath('GT-1', 'a.pdf', seen)).toBe('files/GT-1/a (2).pdf');
    expect(packPath('GT-1', 'a.pdf', seen)).toBe('files/GT-1/a (3).pdf');
  });
  it('same filename under a different reference does not collide', () => {
    const seen = new Set();
    expect(packPath('GT-1', 'a.pdf', seen)).toBe('files/GT-1/a.pdf');
    expect(packPath('GT-2', 'a.pdf', seen)).toBe('files/GT-2/a.pdf');
  });
});

const sampleDocs = [
  {
    document: { reference: 'GT-000001', title: 'Fire strategy', document_type: 'Fire strategy',
                schedule1_category: 6, status: 'current', effective_from: '2026-01-01',
                review_due: '2027-01-01', safety_critical: true },
    files: [{ path: 'files/GT-000001/fs.pdf', filename: 'fs.pdf', mime_type: 'application/pdf',
              size_bytes: 10, stored_checksum: 'abc', computed_checksum: 'abc', checksum_ok: true }],
  },
  {
    document: { reference: 'GT-000002', title: 'FRA', document_type: 'Fire risk assessment',
                schedule1_category: 6, status: 'current' },
    files: [],   // no file attached
  },
  {
    document: { reference: 'GT-000003', title: 'EICR', document_type: 'EICR', schedule1_category: 10, status: 'current' },
    files: [{ path: 'files/GT-000003/e.pdf', filename: 'e.pdf', size_bytes: 5,
              stored_checksum: 'x', computed_checksum: 'y', checksum_ok: false }],
  },
];

describe('buildManifest', () => {
  const m = buildManifest({
    generatedAt: '2026-07-06T10:00:00.000Z',
    generatedBy: 'admin@example.com',
    documents: sampleDocs,
    completeness: [{ code: 6, name: 'Fire safety', currentCount: 2, satisfied: true }],
  });

  it('counts documents and files, and flags integrity issues', () => {
    expect(m.document_count).toBe(3);
    expect(m.file_count).toBe(2);
    expect(m.integrity.checksum_mismatches).toBe(1);      // GT-000003 mismatch
    expect(m.integrity.documents_without_file).toBe(1);   // GT-000002
    expect(m.integrity.checksum_algorithm).toBe('sha256');
  });

  it('projects the document fields and carries completeness', () => {
    expect(m.documents[0]).toMatchObject({ reference: 'GT-000001', safety_critical: true });
    expect(m.documents[1].review_due).toBeNull();         // defaulted
    expect(m.completeness).toHaveLength(1);
    expect(m.kind).toBe('golden_thread_bsr_share_pack');
  });
});

describe('renderReadme', () => {
  it('summarises counts, lists documents and completeness', () => {
    const m = buildManifest({
      generatedAt: '2026-07-06T10:00:00.000Z', generatedBy: 'admin@example.com',
      documents: sampleDocs, completeness: [{ code: 6, name: 'Fire safety', currentCount: 2, satisfied: true }],
    });
    const txt = renderReadme(m);
    expect(txt).toContain('BSR SHARE PACK');
    expect(txt).toContain('Documents:    3');
    expect(txt).toContain('GT-000001  Fire strategy  [current]');
    expect(txt).toContain('Fire safety (2)');
    expect(txt).toContain('1 checksum mismatch(es), 1 document(s) with no file');
  });
});
