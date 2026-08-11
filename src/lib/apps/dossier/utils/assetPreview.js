// src/lib/apps/dossier/utils/assetPreview.js
// How a referenced file is shown — pure, Type-1 testable, no DOM.
//
// Spec 2 §6 calls inline preview "the most common failure point in homegrown
// tools", so the decisions live here on their own rather than inside a node.

import { declarableMime } from '$lib/utils/mimeTypes';

/** Ids the media proxy will accept — it applies exactly this guard itself. */
const SAFE_FILE_ID = /^[A-Za-z0-9_-]+$/;

/** The proxy path an asset's bytes are served from. Also the sanitiser's allow-rule. */
export const FILE_PROXY_PREFIX = '/api/media/file/';

/**
 * The sandbox a PDF preview frame runs under. One constant so the node's
 * renderHTML, its edit-mode node view and the sanitiser cannot drift apart.
 *
 * Arrived at empirically, after two wrong guesses:
 *   sandbox=""              → Firefox cannot run pdf.js (it IS script), falls
 *                             back to downloading, then blocks the download.
 *   sandbox="allow-scripts" → same result. The remaining blocker is the OPAQUE
 *                             ORIGIN: Firefox's PDF viewer declines to run in a
 *                             frame that has no real origin.
 *   + allow-same-origin     → the viewer runs.
 *
 * ⚠ Be honest about what this costs. `allow-scripts` + `allow-same-origin`
 * together means the frame could, if it were ever running script of its own,
 * remove its own sandbox. So the sandbox is NOT the security boundary here.
 *
 * The actual boundary is upstream, and does not depend on this attribute:
 *   1. An iframe is only produced for a file whose recorded type is
 *      application/pdf. Anything else renders as a card.
 *   2. That is therefore what we declare on the response — the `?mime` hint is
 *      validated against a tiny non-scriptable allow-list before it is used.
 *   3. The proxy sends X-Content-Type-Options: nosniff, so the browser will not
 *      reinterpret those bytes as HTML however the file was actually uploaded.
 *   4. The src must pass isProxyUrl(), so a frame can only ever point at our
 *      own storage proxy — enforced again in the sanitiser.
 *
 * What the sandbox still buys, even in this permissive form: no top-level
 * navigation, no popups, no form submission, no modals. `allow-downloads` is
 * granted so that a browser which still declines to render gives the user the
 * file, rather than the dead end of a blocked download and an empty box.
 */
export const ASSET_FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-downloads';

/**
 * Which preview to render for a mime type.
 * @param {string} mimeType
 * @returns {'image' | 'pdf' | 'file'}
 */
export function previewKind(mimeType) {
  const mime = String(mimeType ?? '').toLowerCase().trim();
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
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
 * @param {string} providerFileId - document_library.provider_file_id
 * @param {string} [mimeType]     - document_library.mime_type
 * @returns {string} '' when the id is unusable
 */
export function fileProxyUrl(providerFileId, mimeType) {
  const id = String(providerFileId ?? '');
  if (!SAFE_FILE_ID.test(id)) return '';
  const hint = declarableMime(mimeType);
  return hint
    ? `${FILE_PROXY_PREFIX}${id}?mime=${encodeURIComponent(hint)}`
    : `${FILE_PROXY_PREFIX}${id}`;
}

/**
 * True when a URL is one this app generated for its own proxy — the check the
 * sanitiser trusts before admitting an iframe or img.
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
 * The attributes an asset block stores.
 *
 * `document_id` is the REFERENCE and the source of truth — it is what the link
 * graph and the P3 publish walk follow. The rest is cached display metadata so
 * the renderer stays synchronous and needs no DB lookup; the bytes are still
 * stored exactly once, so this does not violate "reference, never copy".
 * Trade-off: a renamed file leaves a stale label until the block is re-inserted,
 * which the step-5 broken-reference panel can detect.
 *
 * @param {object} doc - a document_library row
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
