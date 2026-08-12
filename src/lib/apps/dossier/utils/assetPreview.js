// src/lib/apps/dossier/utils/assetPreview.js
// How a referenced file is shown — pure, Type-1 testable, no DOM.
//
// Spec 2 §6 calls inline preview "the most common failure point in homegrown
// tools", so the decisions live here on their own rather than inside a node.

import { declarableMime } from '$lib/utils/mimeTypes';
import { isSheetMime }    from './sheetPreview.js';

/** Ids the media proxy will accept — it applies exactly this guard itself. */
const SAFE_FILE_ID = /^[A-Za-z0-9_-]+$/;

/** The proxy path an asset's bytes are served from. Also the sanitiser's allow-rule. */
export const FILE_PROXY_PREFIX = '/api/media/file/';

/**
 * ── Why there is no inline PDF frame ──────────────────────────────────────
 *
 * A PDF renders as a prominent open-in-new-tab card, not an embedded viewer.
 * Four attempts at an <iframe> preview each failed for a different reason:
 *
 *   <object>                              → blocked by the portal CSP
 *                                           (object-src 'none')
 *   <iframe sandbox="">                   → Firefox cannot run pdf.js (it IS
 *                                           script) → falls back to a download
 *                                           → blocks that too
 *   <iframe sandbox="allow-scripts">      → same; the blocker is the opaque
 *                                           origin, which Firefox's viewer
 *                                           refuses to run in
 *   + allow-same-origin allow-downloads   → still blank in Firefox, and Chrome
 *                                           refuses the frame outright
 *
 * Stopping was the better engineering call. Embedding user-uploaded bytes in a
 * same-origin frame that has been granted both allow-scripts AND
 * allow-same-origin gives the frame the ability to drop its own sandbox — a
 * meaningful risk to carry for a convenience. The card always works, in every
 * browser, and the browser's own full-window PDF viewer is a better reading
 * experience than a 60vh box anyway.
 *
 * If inline preview is ever wanted again, the honest route is pdf.js as a real
 * dependency rendering to a canvas — no frame, no sandbox question. That is a
 * P4 polish item, not a bug fix.
 */

/**
 * Which preview to render for a file.
 *
 * The filename is consulted for spreadsheets only, because that is where the
 * stored mime type is least reliable — an .xlsx uploaded before the type was
 * captured properly is octet-stream, and an octet-stream image or PDF has
 * bigger problems than its preview.
 *
 * @param {string|null} [mimeType]
 * @param {string|null} [filename]
 * @returns {'image' | 'pdf' | 'sheet' | 'file'}
 */
export function previewKind(mimeType, filename = '') {
  const mime = String(mimeType ?? '').toLowerCase().trim();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (isSheetMime(mime, filename)) return 'sheet';
  return 'file';   // everything else: name, size, download
}

/**
 * Same-origin URL for an asset's bytes.
 *
 * Returns '' for anything that would not survive the proxy's own id guard, so a
 * malformed reference renders as a plain card instead of a broken embed. Note
 * this makes previews Drive/OneDrive-only: the Supabase storage provider
 * addresses files by path, which contains characters this guard rejects.
 *
 * A `?mime=` hint is appended when we hold a type worth declaring. The proxy
 * otherwise reports whatever the storage provider says, and that is wrong for
 * any file uploaded before the type was recorded properly — a PDF stored as
 * octet-stream downloads instead of rendering. `document_library.mime_type` is
 * our own record and the better answer; the proxy re-validates it against the
 * same tiny allow-list, so this is a hint, never a trusted instruction.
 *
 * @param {string|null} providerFileId - document_library.provider_file_id
 * @param {string|null} [mimeType]      - document_library.mime_type
 * @returns {string} '' when the id is unusable
 */
export function fileProxyUrl(providerFileId, mimeType = '') {
  const id = String(providerFileId ?? '');
  if (!SAFE_FILE_ID.test(id)) return '';
  const hint = declarableMime(mimeType);
  return hint
    ? `${FILE_PROXY_PREFIX}${id}?mime=${encodeURIComponent(hint)}`
    : `${FILE_PROXY_PREFIX}${id}`;
}

/**
 * True when a URL is one this app generated for its own proxy — the check the
 * sanitiser trusts before admitting an img.
 * @param {string|null} [url]
 */
export function isProxyUrl(url) {
  if (typeof url !== 'string') return false;
  if (!url.startsWith(FILE_PROXY_PREFIX)) return false;

  const [path, query, ...rest] = url.slice(FILE_PROXY_PREFIX.length).split('?');
  if (rest.length) return false;                 // more than one '?'
  if (!SAFE_FILE_ID.test(path)) return false;
  if (query === undefined) return true;

  // The only query we ever generate is a single declarable mime hint.
  const match = /^mime=([^&]+)$/.exec(query);
  if (!match) return false;
  try {
    return declarableMime(decodeURIComponent(match[1])) !== '';
  } catch {
    return false;                                // malformed percent-encoding
  }
}

/** Human-readable size. Mirrors $lib/utils/files fmtBytes, kept local so this module stays pure. */
export function fmtSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/**
 * How wide an image preview renders, as a share of the text column.
 *
 * Discrete steps rather than a drag handle: the same value has to render
 * identically in the editor, in Preview and in a published pack, and a pixel
 * width chosen against one column width would not survive the others. It is
 * also an author decision worth persisting, not a view setting.
 */
export const IMAGE_WIDTHS = ['small', 'medium', 'large', 'full'];

export const IMAGE_WIDTH_LABEL = {
  small: 'S', medium: 'M', large: 'L', full: 'Full',
};

/** Default to full width, which is what every image rendered as before this existed. */
export function normaliseImageWidth(width) {
  return IMAGE_WIDTHS.includes(width) ? width : 'full';
}

/**
 * Is this asset's file still on the pack's shelf?
 *
 * `files` undefined means the CALLER supplied no shelf to check against (the
 * live editor), not that the file is gone — the same distinction the embed
 * resolver makes. Only an explicit list can prove absence.
 *
 * @param {string|null} documentId
 * @param {object[]|null} [files]
 * @returns {boolean}
 */
export function assetIsMissing(documentId, files) {
  if (!Array.isArray(files) || !files.length) return false;
  if (!documentId) return false;
  return !files.some(f => f.id === documentId);
}

/**
 * Ask the server for a spreadsheet's first rows.
 *
 * Never throws: a preview is an enhancement, and failing to get one must not
 * stop the author inserting the file. The block falls back to the plain card,
 * which still opens correctly.
 *
 * Lives here rather than in a store because it is stateless and per-file — the
 * result is snapshotted onto the block, not held in app state.
 *
 * @param {object|null} doc - a document_library row
 * @returns {Promise<object|null>}
 */
export async function fetchSheetPreview(doc) {
  const id = String(doc?.provider_file_id ?? '');
  if (!SAFE_FILE_ID.test(id)) return null;
  if (!isSheetMime(doc?.mime_type, doc?.display_name || doc?.filename)) return null;

  try {
    const { getJson } = await import('$lib/utils/request');
    const body = await getJson(`/api/dossier/sheet-preview/${id}`, 'Could not read the spreadsheet');
    return body?.preview?.columns?.length ? body.preview : null;
  } catch {
    return null;
  }
}

/**
 * The attributes an asset block stores.
 *
 * `document_id` is the REFERENCE and the source of truth — it is what the link
 * graph and the P3 publish walk follow. The rest is cached display metadata so
 * the renderer stays synchronous and needs no DB lookup; the bytes are still
 * stored exactly once, so this does not violate "reference, never copy".
 * Trade-off: a renamed file leaves a stale label until the block is re-inserted,
 * which the step-5 broken-reference panel can detect.
 *
 * @param {object|null} doc - a document_library row
 */
export function assetAttrsFromDocument(doc) {
  return {
    document_id:      doc?.id ?? null,
    filename:         doc?.display_name || doc?.filename || 'File',
    mime_type:        doc?.mime_type ?? '',
    provider_file_id: doc?.provider_file_id ?? '',
    size_bytes:       Number(doc?.file_size) || 0,
  };
}
