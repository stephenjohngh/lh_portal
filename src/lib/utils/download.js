// src/lib/utils/download.js
// Browser file downloads — the one place a file is saved (download.test.js).

import { authHeaders } from './authHeaders.js';
import { SESSION_EXPIRED } from './request.js';

/**
 * Ask one of the portal's own routes for a file, and save it — the ONE way a
 * report reaches the browser (2026-10-02).
 *
 * Sixteen report buttons each did this by hand and disagreed:
 *   · some showed the server's reason for failing, others "HTTP 500";
 *   · two routes answer "nothing to report" with an empty 204, which every
 *     screen took for success and saved as an empty file;
 *   · most named the file themselves while the server had already named it —
 *     and the register export threw away the name that says whether the file
 *     is the obligations statement or an extract.
 *
 * Here: the bearer token goes with it; a 401 or a missing session reads as
 * SESSION_EXPIRED; any other failure throws the server's own `error`; a 204
 * saves nothing and returns null; otherwise the file is saved under the
 * SERVER's name, `filename` being only the fallback.
 *
 * @param {string} url
 * @param {{ body?: any, method?: 'GET'|'POST', filename?: string }} [opts]
 *        body — JSON, or a FormData (files travel as binary parts, which is
 *        how a report with plan images avoids sending them as base64 text);
 *        omit for a bodyless request
 * @returns {Promise<string|null>} the name it was saved as, or null when the
 *          server had nothing to send
 */
export async function requestDownload(url, { body, method = 'POST', filename = 'download' } = {}) {
  let headers;
  try { headers = await authHeaders(); } catch { throw new Error(SESSION_EXPIRED); }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (isForm) {
    // The browser writes the multipart Content-Type, boundary included.
    headers = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type'));
  }
  const res = await fetch(url, {
    method,
    headers,                                // JSON: already sets Content-Type: application/json
    ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  if (res.status === 401) throw new Error(SESSION_EXPIRED);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `The file could not be produced (HTTP ${res.status}).`);
  }
  if (res.status === 204) return null;
  const name = filenameFromResponse(res, filename);
  downloadBlob(await res.blob(), name);
  return name;
}

/**
 * Save a Blob as a file — the ONE place a download is triggered.
 *
 * ⚠ The object URL is released on a LATER turn, not straight after click():
 * Safari has not begun the download when click() returns, and releasing it
 * synchronously saves an empty file. Dossier's pack archive had learned this
 * (2026-08); the shared helper and three MOR downloads had not, until
 * 2026-10-02.
 * @param {Blob}   blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The file name a response asks to be saved as (Content-Disposition), or the
 * fallback. Understands both `filename*=UTF-8''…` and `filename="…"`.
 * @param {Response} response
 * @param {string}   fallback
 */
export function filenameFromResponse(response, fallback) {
  const header = response.headers?.get?.('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* fall through */ } }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

/**
 * Trigger a CSV download from already-serialised rows. Prepends a UTF-8 BOM so
 * Excel opens it as UTF-8 without the import wizard.
 * @param {string}   filename
 * @param {string[]} rows      CSV lines (already escaped + column-joined)
 */
export function downloadCsvRows(filename, rows) {
  const csv = '\uFEFF' + rows.join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}
