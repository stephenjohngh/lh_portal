// src/lib/server/fileResponse.test.js
import { describe, it, expect } from 'vitest';
import { contentDisposition, fileHeaders } from './fileResponse.js';

describe('fileHeaders — user-uploaded bytes from our own origin', () => {
  const base = { length: 10, cacheControl: 'private, max-age=60' };

  it('renders the non-scriptable allow-list inline', () => {
    for (const mime of ['application/pdf', 'image/jpeg', 'image/png']) {
      const h = fileHeaders({ ...base, mime, filename: 'a' });
      expect(h['Content-Type']).toBe(mime);
      expect(h['Content-Disposition']).toMatch(/^inline;/);
      expect(h['Content-Security-Policy']).toBeUndefined();
    }
  });

  // The security review's finding: an uploaded web page served as text/html
  // from this origin runs its script with the viewer's session.
  it('never serves HTML, SVG or script as themselves: they download, sandboxed', () => {
    for (const mime of ['text/html', 'image/svg+xml', 'application/javascript', 'text/xml', '', null]) {
      const h = fileHeaders({ ...base, mime, filename: 'x.html' });
      expect(h['Content-Type']).toBe('application/octet-stream');
      expect(h['Content-Disposition']).toMatch(/^attachment;/);
      expect(h['Content-Security-Policy']).toMatch(/sandbox/);
    }
  });

  it('always sends nosniff', () => {
    expect(fileHeaders({ ...base, mime: 'image/png' })['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('contentDisposition', () => {
  it('keeps a real name, and cannot be broken by one', () => {
    expect(contentDisposition('Report — Flat 3.pdf', 'inline'))
      .toBe(`inline; filename="Report _ Flat 3.pdf"; filename*=UTF-8''${encodeURIComponent('Report — Flat 3.pdf')}`);
    expect(contentDisposition('a"\r\nb.txt', 'attachment')).toMatch(/^attachment; filename="ab\.txt"/);
    expect(contentDisposition('', 'attachment')).toMatch(/filename="file"/);
  });
});
