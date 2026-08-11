// src/lib/apps/dossier/utils/assetPreview.test.js
// Type-1 tests for asset preview decisions. The URL guard here is also what the
// sanitiser trusts when it admits <object>, so it is tested as a security
// boundary, not just a formatter.

import { describe, it, expect } from 'vitest';
import {
  previewKind, fileProxyUrl, isProxyUrl, fmtSize, assetAttrsFromDocument,
  FILE_PROXY_PREFIX,
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
