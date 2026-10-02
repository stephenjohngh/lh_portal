// src/lib/utils/download.js
// Browser file download helper — shared by all report modal components.

import { authHeaders } from './authHeaders.js';

/**
 * POST to an authenticated endpoint that returns a file, and download the
 * result. Carries the bearer token (authHeaders), throws Error(server.error)
 * on a non-2xx, and streams the body to the browser as `filename`. Callers wrap
 * in try/catch for their own loading/error state.
 * @param {string} url
 * @param {string} filename
 * @param {any}    [body]  JSON body; omit for a bodyless POST
 */
export async function downloadAuthedPost(url, filename, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: await authHeaders(),           // already sets Content-Type: application/json
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error ?? msg; } catch { /* non-JSON body */ }
    throw new Error(msg);
  }
  await downloadResponse(res, filename);
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
 * Trigger a file download from a fetch Response object.
 *
 * Usage:
 *   const response = await fetch('/api/plans/generate-report', { ... });
 *   if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *   await downloadResponse(response, 'MyReport.docx');
 *   // or, to keep the name the server gave it:
 *   await downloadResponse(response, filenameFromResponse(response, 'fallback.docx'));
 *
 * @param {Response} response  — A resolved fetch Response (caller must verify response.ok first)
 * @param {string}   filename  — The filename the browser will save as
 */
export async function downloadResponse(response, filename) {
  downloadBlob(await response.blob(), filename);
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
