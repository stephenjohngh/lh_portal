// src/lib/utils/pickFiles.js
// Open the browser's file chooser at the folder last used for uploads.
//
// A plain <input type="file"> cannot say where its chooser opens, so it starts
// wherever the browser likes (often the Desktop). Chrome and Edge have a picker
// that remembers the last folder per `id`; Firefox and Safari do not, and keep
// the plain input.
//
// Resolves to the chosen files, to [] if the person cancelled, or to null when
// this browser has no such picker (or it failed for another reason) — the caller
// then falls back to clicking its hidden input.

export const UPLOAD_PICKER_ID = 'lh-portal-upload';

/**
 * @param {{ multiple?: boolean, accept?: string, id?: string }} [opts]
 * @returns {Promise<File[] | null>}
 */
export async function pickFiles({ multiple = false, accept = '*/*', id = UPLOAD_PICKER_ID } = {}) {
  const w = /** @type {any} */ (typeof window === 'undefined' ? null : window);
  if (!w || typeof w.showOpenFilePicker !== 'function') return null;
  // A restricted `accept` would need a matching types table; keep the plain
  // input for those rather than risk a picker that offers the wrong files.
  if (accept && accept !== '*/*') return null;
  try {
    const handles = await w.showOpenFilePicker({ id, multiple });
    return await Promise.all(handles.map((h) => h.getFile()));
  } catch (err) {
    if (/** @type {any} */ (err)?.name === 'AbortError') return [];
    return null;
  }
}
