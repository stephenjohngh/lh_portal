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
// The bearer token: switchable, so a missing session can be tested.
const session = vi.hoisted(() => ({ ok: true }));
vi.mock('./authHeaders.js', () => ({
  authHeaders: async () => {
    if (!session.ok) throw new Error('Not authenticated');
    return { 'Content-Type': 'application/json', Authorization: 'Bearer t' };
  },
}));

const { downloadBlob, filenameFromResponse, requestDownload } = await import('./download.js');
const { SESSION_EXPIRED } = await import('./request.js');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); session.ok = true; });

describe('requestDownload — a report from our own API', () => {
  /** Answer the next fetch with this response; record what was saved. */
  function serve(response) {
    const fetch = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetch);
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const saved = () => click.mock.contexts.map((a) => /** @type {HTMLAnchorElement} */ (a).download);
    return { fetch, saved };
  }
  const file = (headers = {}) => new Response(new Blob(['PK']), { status: 200, headers });

  it('posts the body as JSON with the token, and saves under the SERVER name', async () => {
    const { fetch, saved } = serve(file({ 'content-disposition': 'attachment; filename="Obligations_Statement_2026-10-02.docx"' }));
    const name = await requestDownload('/api/x', { body: { a: 1 }, filename: 'register.docx' });
    expect(name).toBe('Obligations_Statement_2026-10-02.docx');
    expect(saved()).toEqual(['Obligations_Statement_2026-10-02.docx']);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/x');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers.Authorization).toBe('Bearer t');
  });

  it('falls back to the given name when the server names nothing', async () => {
    const { saved } = serve(file());
    expect(await requestDownload('/api/x', { filename: 'fallback.docx' })).toBe('fallback.docx');
    expect(saved()).toEqual(['fallback.docx']);
  });

  it('sends a GET with no body when asked', async () => {
    const { fetch } = serve(file());
    await requestDownload('/api/archive/1', { method: 'GET', filename: 'p.zip' });
    expect(fetch.mock.calls[0][1].method).toBe('GET');
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });

  it('saves NOTHING for a 204, and says so by returning null', async () => {
    const { saved } = serve(new Response(null, { status: 204 }));
    expect(await requestDownload('/api/x', { filename: 'empty.docx' })).toBeNull();
    expect(saved()).toEqual([]);
  });

  it("throws the server's own reason, and saves nothing", async () => {
    const { saved } = serve(new Response(JSON.stringify({ error: 'No meeting provided' }), { status: 400 }));
    await expect(requestDownload('/api/x', { filename: 'a.docx' })).rejects.toThrow('No meeting provided');
    expect(saved()).toEqual([]);
  });

  it('says what failed when the server gave no reason', async () => {
    serve(new Response('boom', { status: 500 }));
    await expect(requestDownload('/api/x')).rejects.toThrow(/HTTP 500/);
  });

  it('reads a 401, and a missing session, as an expired session', async () => {
    serve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }));
    await expect(requestDownload('/api/x')).rejects.toThrow(SESSION_EXPIRED);
    session.ok = false;
    await expect(requestDownload('/api/x')).rejects.toThrow(SESSION_EXPIRED);
  });
});

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
    expect(NAMES_A_DOWNLOAD.test('await requestDownload(url, { filename });')).toBe(false);
  });
});

// A file that asks our own API for something AND reads its bytes is fetching a
// report by hand. Sixteen did, and disagreed about errors, 204s and names.
const ASKS_OUR_API = new RegExp('fetch\\(\\s*[`\'"]/api/');
const READS_BYTES  = new RegExp('\\.blob\\(\\)|\\.arrayBuffer\\(\\)');
const OWN_FETCH = {
  'src/lib/apps/inspection/public.js':
    'files the report in the Golden Thread as a File; it is never saved in the browser',
};

describe('reports are fetched through requestDownload', () => {
  const files = sources('src');
  const fetchesBytes = (f) => { const t = readFileSync(f, 'utf8'); return ASKS_OUR_API.test(t) && READS_BYTES.test(t); };

  it('no other file fetches a report and reads it by hand', () => {
    expect(files).toContain('src/lib/apps/management/components/reports/IssuesReportPanel.svelte');
    const offenders = files
      .filter((f) => f !== 'src/lib/utils/download.js' && !OWN_FETCH[f])
      .filter(fetchesBytes);
    expect(offenders, 'use requestDownload from $lib/utils/download.js, or name the file in OWN_FETCH with the reason').toEqual([]);
  });

  it('every exception still has something to excuse', () => {
    for (const f of Object.keys(OWN_FETCH)) expect(fetchesBytes(f), f).toBe(true);
  });

  it('recognises the old habit', () => {
    const old = "const res = await fetch('/api/reports/x', {});\n  downloadBlob(await res.blob(), 'x.docx');";
    expect(ASKS_OUR_API.test(old) && READS_BYTES.test(old)).toBe(true);
  });
});
