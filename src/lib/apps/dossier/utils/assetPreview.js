// src/lib/apps/dossier/utils/assetPreview.js
// How a referenced file is shown — pure, Type-1 testable, no DOM.
//
// Spec 2 §6 calls inline preview "the most common failure point in homegrown
// tools", so the decisions live here on their own rather than inside a node.

/** Ids the media proxy will accept — it applies exactly this guard itself. */
const SAFE_FILE_ID = /^[A-Za-z0-9_-]+$/;

/** The proxy path an asset's bytes are served from. Also the sanitiser's allow-rule. */
export const FILE_PROXY_PREFIX = '/api/media/file/';

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
 * @param {string} providerFileId - document_library.provider_file_id
 * @returns {string} '' when the id is unusable
 */
export function fileProxyUrl(providerFileId) {
  const id = String(providerFileId ?? '');
  return SAFE_FILE_ID.test(id) ? `${FILE_PROXY_PREFIX}${id}` : '';
}

/** True when a URL is one this app generated for its own proxy. */
export function isProxyUrl(url) {
  if (typeof url !== 'string') return false;
  if (!url.startsWith(FILE_PROXY_PREFIX)) return false;
  return SAFE_FILE_ID.test(url.slice(FILE_PROXY_PREFIX.length));
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
