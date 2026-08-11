// src/lib/apps/dossier/utils/assetPreview.test.js
// Type-1 tests for asset preview decisions. The URL guard here is also what the
// sanitiser trusts when it admits <object>, so it is tested as a security
// boundary, not just a formatter.

import { describe, it, expect } from 'vitest';
import {
  previewKind, fileProxyUrl, isProxyUrl, fmtSize, assetAttrsFromDocument,
  assetIsMissing, normaliseImageWidth, IMAGE_WIDTHS, FILE_PROXY_PREFIX,
} from './assetPreview.js';

describe('previewKind', () => {
  it('recognises images', () => {
    expect(previewKind('image/png')).toBe('image');
    expect(previewKind('image/jpeg')).toBe('image');
    expect(previewKind('IMAGE/PNG')).toBe('image');       // case-insensitive
  });

  it('recognises PDFs exactly', () => {
    expect(previewKind('application/pdf')).toBe('pdf');
    // Not a PDF just because the string contains it.
    expect(previewKind('application/pdf-something')).toBe('file');
  });

  it('falls back to the plain card for everything else', () => {
    expect(previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('file');
    expect(previewKind('text/plain')).toBe('file');
    expect(previewKind('')).toBe('file');
    expect(previewKind(null)).toBe('file');
    expect(previewKind(undefined)).toBe('file');
  });
});

describe('fileProxyUrl', () => {
  it('builds a same-origin proxy URL from a provider file id', () => {
    expect(fileProxyUrl('1a2B_c-3')).toBe(`${FILE_PROXY_PREFIX}1a2B_c-3`);
  });

  it('appends a mime hint when we hold a declarable type', () => {
    // Fixes files already stored with the wrong type at the provider — a PDF
    // held as octet-stream downloads instead of rendering.
    expect(fileProxyUrl('abc', 'application/pdf'))
      .toBe(`${FILE_PROXY_PREFIX}abc?mime=application%2Fpdf`);
  });

  it('omits the hint for a type it would not declare', () => {
    expect(fileProxyUrl('abc', 'text/html')).toBe(`${FILE_PROXY_PREFIX}abc`);
    expect(fileProxyUrl('abc', 'image/svg+xml')).toBe(`${FILE_PROXY_PREFIX}abc`);
    expect(fileProxyUrl('abc', '')).toBe(`${FILE_PROXY_PREFIX}abc`);
  });

  it('rejects anything the proxy itself would reject', () => {
    // The proxy guards with the same pattern; a mismatch here would produce a
    // broken embed rather than a graceful card.
    expect(fileProxyUrl('has/slash')).toBe('');
    expect(fileProxyUrl('has.dot')).toBe('');
    expect(fileProxyUrl('has space')).toBe('');
    expect(fileProxyUrl('')).toBe('');
    expect(fileProxyUrl(null)).toBe('');
  });

  it('rejects a path-shaped id — Supabase storage addresses files by path', () => {
    // Documented consequence: previews are Drive/OneDrive-only today.
    expect(fileProxyUrl('packs/2026/contract.pdf')).toBe('');
  });

  it('cannot be tricked into leaving the proxy path', () => {
    expect(fileProxyUrl('../../etc/passwd')).toBe('');
    expect(fileProxyUrl('//evil.test/x')).toBe('');
  });
});

describe('isProxyUrl — the sanitiser trusts this', () => {
  it('accepts a URL this app generated', () => {
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc123`)).toBe(true);
  });

  it('accepts a URL carrying a valid mime hint', () => {
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc?mime=application%2Fpdf`)).toBe(true);
  });

  it('rejects a query it did not generate', () => {
    // The sanitiser trusts this to decide whether an iframe reaches the page,
    // so the query must be exactly one hint we would have produced ourselves.
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc?mime=text%2Fhtml`)).toBe(false);
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc?other=1`)).toBe(false);
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc?mime=application%2Fpdf&x=1`)).toBe(false);
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc?mime=`)).toBe(false);
    expect(isProxyUrl(`${FILE_PROXY_PREFIX}abc?mime=%E0%A4%A`)).toBe(false); // bad encoding
  });

  it('rejects anything else, however similar', () => {
    expect(isProxyUrl('https://evil.test/x')).toBe(false);
    expect(isProxyUrl('javascript:alert(1)')).toBe(false);
    expect(isProxyUrl('/api/media/file/')).toBe(false);          // no id
    expect(isProxyUrl('/api/media/file/a/b')).toBe(false);       // path traversal
    expect(isProxyUrl('/api/media/files/abc')).toBe(false);      // near-miss prefix
    expect(isProxyUrl('data:text/html,<script>')).toBe(false);
    expect(isProxyUrl(null)).toBe(false);
    expect(isProxyUrl(undefined)).toBe(false);
  });
});

describe('normaliseImageWidth', () => {
  it('passes through every declared size', () => {
    for (const w of IMAGE_WIDTHS) expect(normaliseImageWidth(w)).toBe(w);
  });

  it('defaults to full — what every image rendered as before sizes existed', () => {
    // Content authored before this attribute must not change appearance.
    expect(normaliseImageWidth(undefined)).toBe('full');
    expect(normaliseImageWidth(null)).toBe('full');
    expect(normaliseImageWidth('')).toBe('full');
    expect(normaliseImageWidth('120px')).toBe('full');
    expect(normaliseImageWidth('huge')).toBe('full');
  });
});

describe('assetIsMissing', () => {
  const shelf = [{ id: 'f1' }, { id: 'f2' }];

  it('is true when the file has left the shelf', () => {
    expect(assetIsMissing('gone', shelf)).toBe(true);
  });

  it('is false when the file is still there', () => {
    expect(assetIsMissing('f1', shelf)).toBe(false);
  });

  it('never claims missing without a shelf to check against', () => {
    // An empty or absent list means "caller supplied no shelf", not "everything
    // is deleted" — inferring absence from it would mark every asset in the
    // editor as broken.
    expect(assetIsMissing('f1', [])).toBe(false);
    expect(assetIsMissing('f1', null)).toBe(false);
    expect(assetIsMissing('f1', undefined)).toBe(false);
  });

  it('is false for a block with no file reference at all', () => {
    expect(assetIsMissing(null, shelf)).toBe(false);
  });
});

describe('fmtSize', () => {
  it('scales through the units', () => {
    expect(fmtSize(512)).toBe('512 B');
    expect(fmtSize(2048)).toBe('2.0 KB');
    expect(fmtSize(1024 * 1024 * 3)).toBe('3.0 MB');
  });

  it('returns an empty string for a missing or nonsense size', () => {
    expect(fmtSize(0)).toBe('');
    expect(fmtSize(null)).toBe('');
    expect(fmtSize('abc')).toBe('');
  });
});

describe('assetAttrsFromDocument', () => {
  it('carries the reference plus the cached display metadata', () => {
    expect(assetAttrsFromDocument({
      id: 'doc-1', display_name: 'Consultation notice', filename: 'notice.pdf',
      mime_type: 'application/pdf', provider_file_id: 'drive-1', file_size: '2048',
    })).toEqual({
      document_id: 'doc-1',
      filename: 'Consultation notice',      // display_name wins
      mime_type: 'application/pdf',
      provider_file_id: 'drive-1',
      size_bytes: 2048,                     // coerced from the string the API returns
    });
  });

  it('falls back to the raw filename, then to a label', () => {
    expect(assetAttrsFromDocument({ id: 'd', filename: 'raw.docx' }).filename).toBe('raw.docx');
    expect(assetAttrsFromDocument({ id: 'd' }).filename).toBe('File');
    expect(assetAttrsFromDocument(null).document_id).toBeNull();
  });
});
