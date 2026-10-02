// @vitest-environment jsdom
//
// src/lib/utils/download.test.js
//
// Downloads have one owner: download.js. Six screens wrote their own, and
// four of those freed the file in the same turn as the click, which saves an
// EMPTY file in Safari (it has not begun the download when click() returns).
// The fix had been learned once, in Dossier, and copied nowhere.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// download.js carries the bearer token for its POST helper; not needed here.
vi.mock('./authHeaders.js', () => ({ authHeaders: async () => ({}) }));

const { downloadBlob, filenameFromResponse } = await import('./download.js');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('downloadBlob', () => {
  it('saves under the name given, and frees the file only on a later turn', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['a']), 'report.docx');

    expect(click).toHaveBeenCalledTimes(1);
    expect(/** @type {HTMLAnchorElement} */ (click.mock.contexts[0]).download).toBe('report.docx');
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('filenameFromResponse', () => {
  const res = (value) => /** @type {any} */ ({ headers: new Headers(value ? { 'content-disposition': value } : {}) });
  it('reads the encoded name first, then the plain one, else the fallback', () => {
    expect(filenameFromResponse(res("attachment; filename=\"a.docx\"; filename*=UTF-8''Caf%C3%A9.docx"), 'x')).toBe('Café.docx');
    expect(filenameFromResponse(res('attachment; filename="a.docx"'), 'x')).toBe('a.docx');
    expect(filenameFromResponse(res(null), 'fallback.docx')).toBe('fallback.docx');
  });
});

/** Every .js and .svelte source file under src/, tests excluded. */
function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { sources(path, out); continue; }
    if (/\.test\.js$/.test(name)) continue;
    if (/\.(js|svelte)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

// Built from a string: Vite's import scanner misreads some regex literals.
const NAMES_A_DOWNLOAD = new RegExp('\\.download\\s*=');

describe('downloads have one owner (download.js)', () => {
  it('no other file saves a file by hand', () => {
    const files = sources('src');
    expect(files).toContain('src/lib/utils/download.js');
    const offenders = files
      .filter((f) => f !== 'src/lib/utils/download.js')
      .filter((f) => NAMES_A_DOWNLOAD.test(readFileSync(f, 'utf8')));
    expect(offenders, 'use downloadBlob / downloadResponse / downloadCsvRows').toEqual([]);
  });

  it('recognises the old habit', () => {
    expect(NAMES_A_DOWNLOAD.test('a.href = url; a.download = filename;')).toBe(true);
    expect(NAMES_A_DOWNLOAD.test('await downloadResponse(r, name);')).toBe(false);
  });
});
