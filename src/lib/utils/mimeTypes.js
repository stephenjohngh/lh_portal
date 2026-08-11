// src/lib/utils/mimeTypes.js
// Filename → mime type, and a safety check for a mime type we are willing to
// declare on a response. Pure, Type-1 testable, shared (server + client).
//
// Why this exists: a browser sets File.type from its own registry, and leaves
// it EMPTY often enough to matter — no OS association, some drag-and-drop
// paths, some mobile pickers. The upload endpoint used to store the empty
// string as 'application/octet-stream', which is then what Google Drive stores,
// which is then what the media proxy serves — so a perfectly good PDF arrives
// as an anonymous download instead of rendering.

const BY_EXTENSION = {
  // Documents
  pdf:  'application/pdf',
  doc:  'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:  'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:  'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt:  'application/vnd.oasis.opendocument.text',
  ods:  'application/vnd.oasis.opendocument.spreadsheet',
  rtf:  'application/rtf',
  txt:  'text/plain',
  csv:  'text/csv',
  // Images
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp',
  bmp:  'image/bmp',
  tif:  'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  svg:  'image/svg+xml',
  // Mail + archives
  eml:  'message/rfc822',
  msg:  'application/vnd.ms-outlook',
  zip:  'application/zip',
};

/**
 * Lowercase extension without the dot, or '' when there isn't one.
 * @param {string|null} [filename]
 */
export function extensionOf(filename) {
  const name = String(filename ?? '');
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Best mime type for an upload: what the browser said, else the extension,
 * else the honest generic.
 * @param {string|null} [browserType] - File.type, often ''
 * @param {string|null} [filename]
 */
export function resolveMimeType(browserType, filename) {
  const given = String(browserType ?? '').split(';')[0].trim().toLowerCase();
  if (given && given !== 'application/octet-stream') return given;
  return BY_EXTENSION[extensionOf(filename)] ?? 'application/octet-stream';
}

/**
 * Mime types this app is willing to DECLARE on a proxied response when asked to
 * by a caller. Deliberately tiny: only the kinds rendered inline.
 *
 * Nothing scriptable is here. `image/svg+xml` is excluded on purpose — an SVG
 * is a document that can carry script, and this list exists to let a URL
 * parameter influence a Content-Type header.
 */
const DECLARABLE = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
]);

const MIME_SHAPE = /^[a-z]+\/[a-z0-9.+-]+$/;

/**
 * Normalise a caller-supplied mime hint, or '' if it is not one we will declare.
 * @param {string|null} [mime]
 */
export function declarableMime(mime) {
  const value = String(mime ?? '').split(';')[0].trim().toLowerCase();
  return MIME_SHAPE.test(value) && DECLARABLE.has(value) ? value : '';
}
