// src/lib/utils/files.test.js
import { describe, it, expect } from 'vitest';
import { fmtBytes, mimeIcon } from './files.js';

describe('fmtBytes', () => {
  it('formats across unit boundaries with no trailing zeros', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(null)).toBe('0 B');
    expect(fmtBytes(900)).toBe('900 B');
    expect(fmtBytes(1024)).toBe('1 KB');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(1024 * 1024)).toBe('1 MB');
    expect(fmtBytes(1024 ** 3)).toBe('1 GB');
  });
});

describe('mimeIcon', () => {
  it('maps MIME families to emoji and falls back to a paperclip', () => {
    expect(mimeIcon('application/pdf')).toBe('📄');
    expect(mimeIcon('image/png')).toBe('🖼');
    expect(mimeIcon('application/msword')).toBe('📝');
    expect(mimeIcon('application/vnd.ms-excel')).toBe('📊');
    expect(mimeIcon('text/plain')).toBe('📃');
    expect(mimeIcon(null)).toBe('📎');
    expect(mimeIcon('application/octet-stream')).toBe('📎');
  });
});
