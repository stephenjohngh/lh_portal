// src/lib/server/storage/openStoredFile.test.js

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { openStoredFile } from './openStoredFile.js';

describe('openStoredFile', () => {
  it('streams where the provider can, and never reads the whole file', async () => {
    const opened = { body: 'stream', size: 9, mimeType: 'application/pdf' };
    const provider = { openFileStream: vi.fn(async () => opened), getFileStream: vi.fn() };
    expect(await openStoredFile(provider, 'f1')).toBe(opened);
    expect(provider.getFileStream).not.toHaveBeenCalled();
  });

  it('reads the file whole where the provider cannot stream', async () => {
    const data = Buffer.from('abc');
    const provider = { getFileStream: async () => ({ data, mimeType: 'image/png' }) };
    expect(await openStoredFile(provider, 'f1')).toEqual({ body: data, size: 3, mimeType: 'image/png' });
  });
});

describe('routes that serve a file to a browser', () => {
  it('do not read the whole file into memory', () => {
    for (const route of ['media/file/[fileId]', 'pack/[token]/file/[documentId]']) {
      const src = readFileSync(`src/routes/api/${route}/+server.js`, 'utf8');
      expect(src, route).toContain('openStoredFile(');
      expect(src.includes('.getFileStream('), route).toBe(false);
    }
  });
});
