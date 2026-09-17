// src/lib/utils/documentUtils.test.js
// Document-library formatting helpers: file size, MIME → icon/doc-type, and
// the certificate expiry status windows.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatFileSize, mimeIcon, docTypeFromMime, isUnclassifiedDocType,
  getExpiryStatus, isExpired, isExpiringSoon,
  docTypeLabel, categoryLabel, categoryFromFilename,
  folderSegments, folderLabel, compareFolderPath, sortDocsByFolder, docName,
  sanitiseFolderSegment, entityFolderPath, DOC_FOLDERS,
} from './documentUtils.js';

describe('formatFileSize', () => {
  it('formats across unit boundaries', () => {
    expect(formatFileSize(0)).toBe('—');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('mimeIcon', () => {
  it('maps known types and falls back to a paperclip', () => {
    expect(mimeIcon('application/pdf')).toBe('📄');
    expect(mimeIcon('image/png')).toBe('🖼');
    expect(mimeIcon('application/x-unknown')).toBe('📎');
  });
});

describe('docTypeFromMime', () => {
  it('derives a doc_type from the MIME family', () => {
    expect(docTypeFromMime('image/jpeg')).toBe('photo');
    expect(docTypeFromMime('application/pdf')).toBe('pdf');
    expect(docTypeFromMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('word');
    expect(docTypeFromMime('text/csv')).toBe('spreadsheet');
    expect(docTypeFromMime('application/zip')).toBe('other');
    expect(docTypeFromMime(null)).toBe('other');
  });
});

describe('expiry status', () => {
  const NOW = new Date('2026-06-14T00:00:00Z').getTime();
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(()  => { vi.useRealTimers(); });
  const inDays = (d) => new Date(NOW + d * 86_400_000).toISOString();

  it('classifies expired / expiring-soon / ok / null', () => {
    expect(getExpiryStatus(inDays(-1))).toBe('expired');
    expect(getExpiryStatus(inDays(10))).toBe('expiring-soon');
    expect(getExpiryStatus(inDays(90))).toBe('ok');
    expect(getExpiryStatus(null)).toBeNull();
  });

  it('isExpired / isExpiringSoon are derived predicates', () => {
    expect(isExpired(inDays(-1))).toBe(true);
    expect(isExpired(inDays(10))).toBe(false);
    expect(isExpiringSoon(inDays(10))).toBe(true);
    expect(isExpiringSoon(inDays(90))).toBe(false);
  });
});

describe('label lookups', () => {
  it('resolve known values and fall back to the raw value / dash', () => {
    expect(docTypeLabel('pdf')).toBe('PDF');
    expect(docTypeLabel('mystery')).toBe('mystery');
    expect(docTypeLabel(null)).toBe('—');
    expect(categoryLabel('ews1')).toBe('EWS1');
    expect(categoryLabel('unknown')).toBe('unknown');
  });
});

describe('docTypeFromMime — the wider families', () => {
  it('classifies the office formats that were all landing as "other"', () => {
    // The whole live library read 'other' because these fell through.
    expect(docTypeFromMime('application/vnd.oasis.opendocument.text')).toBe('word');
    expect(docTypeFromMime('application/vnd.oasis.opendocument.spreadsheet')).toBe('spreadsheet');
    expect(docTypeFromMime('application/rtf')).toBe('word');
    expect(docTypeFromMime('APPLICATION/PDF')).toBe('pdf');
  });

  it('leaves genuinely unclassifiable types alone rather than guessing', () => {
    expect(docTypeFromMime('text/plain')).toBe('other');
    expect(docTypeFromMime('application/zip')).toBe('other');
    expect(docTypeFromMime(undefined)).toBe('other');
  });
});

describe('isUnclassifiedDocType', () => {
  it("treats 'other' and absent as the same thing — nobody classified it", () => {
    expect(isUnclassifiedDocType('other')).toBe(true);
    expect(isUnclassifiedDocType(null)).toBe(true);
    expect(isUnclassifiedDocType('')).toBe(true);
    expect(isUnclassifiedDocType('pdf')).toBe(false);
    expect(isUnclassifiedDocType('certificate')).toBe(false);
  });
});

describe('categoryFromFilename', () => {
  it('suggests a category from the words in the filename', () => {
    expect(categoryFromFilename('safety_case.odt')).toBe('safety_case');
    expect(categoryFromFilename('EICR-2026-communal.pdf')).toBe('eicr');
    expect(categoryFromFilename('Block A FRA 2026.docx')).toBe('fire_risk_assessment');
    expect(categoryFromFilename('EWS1 form.pdf')).toBe('ews1');
    expect(categoryFromFilename('asbestos survey.pdf')).toBe('asbestos_survey');
    expect(categoryFromFilename('lift-inspection-report.pdf')).toBe('inspection_report');
    expect(categoryFromFilename('boiler warranty.pdf')).toBe('warranty');
  });

  it('returns nothing rather than a confident wrong answer', () => {
    // An empty suggestion leaves the field for a person; 'other' would not.
    expect(categoryFromFilename('hare.jpg')).toBe('');
    expect(categoryFromFilename('Screenshot 2026-08-12 092219.png')).toBe('');
    expect(categoryFromFilename('')).toBe('');
    expect(categoryFromFilename(null)).toBe('');
  });

  it('requires whole words, so a substring cannot masquerade as a match', () => {
    expect(categoryFromFilename('infrastructure-plan.pdf')).toBe('');   // not 'fra'
    expect(categoryFromFilename('newsletter.pdf')).toBe('');            // not 'ews1'
  });

  it('prefers the more specific hint when several could match', () => {
    // 'fire risk assessment certificate' is an FRA, not a generic certificate.
    expect(categoryFromFilename('fire risk assessment certificate.pdf'))
      .toBe('fire_risk_assessment');
  });
});

describe('folder hierarchy', () => {
  it('splits a path and tolerates stray slashes and nulls', () => {
    expect(folderSegments('Issues/Issue 49')).toEqual(['Issues', 'Issue 49']);
    expect(folderSegments('/Issues//Issue 49/')).toEqual(['Issues', 'Issue 49']);
    expect(folderSegments(null)).toEqual([]);
  });

  it('shows the whole hierarchy, not just the leaf', () => {
    expect(folderLabel('Issues/Issue 49')).toBe('Issues / Issue 49');
    expect(folderLabel('Dossier Packs')).toBe('Dossier Packs');
    expect(folderLabel(null)).toBe('—');
  });

  it('keeps children with their parent, where a plain string sort would not', () => {
    // '/' (0x2F) sorts AFTER a space, so 'Issues 2' < 'Issues/Issue 49' as
    // strings — which would slot an unrelated sibling between a parent folder
    // and its own children.
    const paths = ['Issues 2', 'Issues/Issue 49', 'Issues'];
    expect([...paths].sort(compareFolderPath))
      .toEqual(['Issues', 'Issues/Issue 49', 'Issues 2']);
  });

  it('orders numbered folders numerically, not lexically', () => {
    const paths = ['Issues/Issue 100', 'Issues/Issue 9', 'Issues/Issue 49'];
    expect([...paths].sort(compareFolderPath))
      .toEqual(['Issues/Issue 9', 'Issues/Issue 49', 'Issues/Issue 100']);
  });

  it('puts unfoldered documents last, so the hierarchy reads from the top', () => {
    expect([null, 'Admin'].sort(compareFolderPath)).toEqual(['Admin', null]);
  });

  it('sorts documents by folder then by name, without mutating the input', () => {
    const docs = [
      { id: '1', folder_path: 'Issues/Issue 49', display_name: 'zebra.pdf' },
      { id: '2', folder_path: null,              display_name: 'loose.pdf' },
      { id: '3', folder_path: 'Issues/Issue 49', display_name: 'apple.pdf' },
      { id: '4', folder_path: 'Dossier Packs',   filename:     'pack.pdf' },
    ];
    const before = docs.map(d => d.id);
    expect(sortDocsByFolder(docs).map(d => d.id)).toEqual(['4', '3', '1', '2']);
    expect(docs.map(d => d.id)).toEqual(before);
  });

  it('falls back to the filename when there is no display name', () => {
    expect(docName({ filename: 'a.pdf' })).toBe('a.pdf');
    expect(docName({ display_name: 'A', filename: 'a.pdf' })).toBe('A');
    expect(docName(null)).toBe('');
  });
});

describe('sanitiseFolderSegment', () => {
  it('replaces path-unsafe characters with a space rather than deleting them', () => {
    // "Flat 3/4" must not become "Flat 34" — and the slash must never survive,
    // because folder_path is SPLIT on it to create real folders.
    expect(sanitiseFolderSegment('Flat 3/4')).toBe('Flat 3 4');
    expect(sanitiseFolderSegment('a:b*c?d"e<f>g|h\\i')).toBe('a b c d e f g h i');
  });

  it('refuses to produce a name made only of dots or whitespace', () => {
    expect(sanitiseFolderSegment('..')).toBe('');
    expect(sanitiseFolderSegment('  ')).toBe('');
    expect(sanitiseFolderSegment('/')).toBe('');
    expect(sanitiseFolderSegment(null)).toBe('');
  });

  it('caps the length, because the name comes from a free-text title', () => {
    expect(sanitiseFolderSegment('x'.repeat(200))).toHaveLength(60);
    expect(sanitiseFolderSegment('abc', 2)).toBe('ab');
  });
});

describe('entityFolderPath', () => {
  it('nests one entity under its parent, named and uniquely identified', () => {
    expect(entityFolderPath('Dossier Packs', 'Smith solicitor pack',
      'a1b2c3d4-5e6f-7890-abcd-ef1234567890'))
      .toBe('Dossier Packs/Smith solicitor pack (a1b2c3d4)');
  });

  it('separates two packs that share a title', () => {
    // The whole reason the id is in the name.
    const a = entityFolderPath('Dossier Packs', 'Freehold enquiry', 'aaaaaaaa-1111-2222-3333-444444444444');
    const b = entityFolderPath('Dossier Packs', 'Freehold enquiry', 'bbbbbbbb-1111-2222-3333-444444444444');
    expect(a).not.toBe(b);
  });

  it('cannot invent a folder level from a title containing a slash', () => {
    const path = entityFolderPath('Info Notes', 'Fire/Safety', '12345678-aaaa-bbbb-cccc-dddddddddddd');
    expect(path.split('/')).toHaveLength(2);
    expect(path).toBe('Info Notes/Fire Safety (12345678)');
  });

  it('falls back to the bare parent when there is nothing to name a child with', () => {
    expect(entityFolderPath('Dossier Packs', null, null)).toBe('Dossier Packs');
    expect(entityFolderPath('Dossier Packs', '   ', '')).toBe('Dossier Packs');
  });

  it('uses whichever half it has', () => {
    expect(entityFolderPath('Maintenance', 'Annual service', null))
      .toBe('Maintenance/Annual service');
    expect(entityFolderPath('Maintenance', null, '99887766-aaaa-bbbb-cccc-dddddddddddd'))
      .toBe('Maintenance/99887766');
  });

  it('produces a path the folder helpers can read back', () => {
    const path = entityFolderPath('Dossier Packs', 'Smith pack', 'a1b2c3d4-0000-0000-0000-000000000000');
    expect(folderSegments(path)).toEqual(['Dossier Packs', 'Smith pack (a1b2c3d4)']);
    expect(folderLabel(path)).toBe('Dossier Packs / Smith pack (a1b2c3d4)');
  });
});

describe('DOC_FOLDERS', () => {
  it('declares every top-level folder in one place', () => {
    // These were five literals in five files, which is how two of them stayed
    // flat without anyone seeing both at once.
    expect(Object.values(DOC_FOLDERS)).toEqual(
      expect.arrayContaining(['Dossier Packs', 'Info Notes', 'Maintenance', 'Issues', 'Documents']));
  });

  it('has no folder name that would split into two levels', () => {
    for (const name of Object.values(DOC_FOLDERS)) {
      expect(folderSegments(name)).toHaveLength(1);
    }
  });
});
