// src/lib/utils/mimeTypes.test.js
// Type-1 tests. declarableMime guards a URL parameter that influences a
// response Content-Type, so it is tested as a security boundary.

import { describe, it, expect } from 'vitest';
import { extensionOf, resolveMimeType, declarableMime } from './mimeTypes.js';

describe('extensionOf', () => {
  it('takes the last extension, lowercased', () => {
    expect(extensionOf('Notice.PDF')).toBe('pdf');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns empty when there is no usable extension', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');    // dotfile, not an extension
    expect(extensionOf('trailing.')).toBe('');
    expect(extensionOf('')).toBe('');
    expect(extensionOf(null)).toBe('');
  });
});

describe('resolveMimeType', () => {
  it('trusts a real type from the browser', () => {
    expect(resolveMimeType('application/pdf', 'x.pdf')).toBe('application/pdf');
    expect(resolveMimeType('image/png; charset=binary', 'x.png')).toBe('image/png');
  });

  it('falls back to the extension when the browser said nothing', () => {
    // This is the actual failure: File.type is empty often enough that storing
    // the blank as octet-stream made PDFs download instead of render.
    expect(resolveMimeType('', 'Notice.pdf')).toBe('application/pdf');
    expect(resolveMimeType(undefined, 'photo.JPG')).toBe('image/jpeg');
    expect(resolveMimeType(null, 'Schedule.xlsx'))
      .toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('treats octet-stream as "unknown" and tries the extension', () => {
    expect(resolveMimeType('application/octet-stream', 'Notice.pdf')).toBe('application/pdf');
  });

  it('stays honest when nothing identifies the file', () => {
    expect(resolveMimeType('', 'mystery')).toBe('application/octet-stream');
    expect(resolveMimeType('', 'thing.unknownext')).toBe('application/octet-stream');
  });
});

describe('declarableMime — guards a caller-supplied Content-Type', () => {
  it('accepts the inline-renderable types', () => {
    expect(declarableMime('application/pdf')).toBe('application/pdf');
    expect(declarableMime('image/png')).toBe('image/png');
    expect(declarableMime('IMAGE/JPEG')).toBe('image/jpeg');
    expect(declarableMime('application/pdf; charset=utf-8')).toBe('application/pdf');
  });

  it('refuses anything scriptable or otherwise dangerous', () => {
    // The whole point: a URL parameter must never be able to relabel a file as
    // something the browser will execute in our origin.
    expect(declarableMime('text/html')).toBe('');
    expect(declarableMime('application/javascript')).toBe('');
    expect(declarableMime('image/svg+xml')).toBe('');   // SVG can carry script
    expect(declarableMime('text/xml')).toBe('');
  });

  it('refuses malformed or injected values', () => {
    expect(declarableMime('application/pdf\r\nX-Evil: 1')).toBe('');
    expect(declarableMime('not a mime')).toBe('');
    expect(declarableMime('')).toBe('');
    expect(declarableMime(null)).toBe('');
    expect(declarableMime(undefined)).toBe('');
  });
});
