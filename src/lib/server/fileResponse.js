// src/lib/server/fileResponse.js
// Headers for serving user-uploaded bytes from the portal's own origin.
//
// ⛔ WHY THIS EXISTS (security review, 2026-09-27). The media proxy used to
// label a file with whatever type the storage provider reported. Drive reports
// what the uploader's browser said, so an uploaded `.html` came back as
// `text/html` — from THIS origin, and a `+server.js` response carries none of
// the page CSP. Anyone who opened it ran its script with their own session.
// The public pack route had already got this right; the rule now lives here so
// every route that streams stored bytes applies the same one:
//
//   · inline ONLY for the small non-scriptable allow-list (`declarableMime`:
//     PDF and ordinary raster images — never SVG, never HTML);
//   · everything else is an opaque `application/octet-stream` DOWNLOAD under
//     its own name, with a sandboxing CSP in case a browser renders it anyway.

import { declarableMime } from '$lib/utils/mimeTypes';

/**
 * A Content-Disposition header that cannot break, whatever the file is called.
 *
 * Two hazards, both real with author-supplied names:
 *   * CR/LF and quotes would break out of the header — stripped.
 *   * A non-Latin-1 character (an accent, a dash, any non-Western script)
 *     THROWS when the Response is constructed, turning a perfectly ordinary
 *     filename into a 500. So the quoted form is ASCII-only, and the real name
 *     travels in RFC 5987 `filename*`, which every current browser prefers.
 *
 * @param {string|null|undefined} rawName
 * @param {'inline'|'attachment'} kind
 */
export function contentDisposition(rawName, kind) {
  const name = String(rawName ?? '').trim() || 'file';
  const ascii = name
    .replace(/[\r\n"\\]/g, '')        // cannot start a header or close the string
    .replace(/[^\x20-\x7e]/g, '_')    // cannot be encoded in a header at all
    .trim() || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * The headers for one stored file.
 *
 * @param {{ mime?: string|null, filename?: string|null, length: number, cacheControl: string }} opts
 * @returns {Record<string, string>}
 */
export function fileHeaders({ mime, filename, length, cacheControl }) {
  const inline = declarableMime(mime);
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type':        inline || 'application/octet-stream',
    'Content-Length':      String(length),
    'Content-Disposition': contentDisposition(filename, inline ? 'inline' : 'attachment'),
    'Cache-Control':       cacheControl,
    // Without nosniff a browser may ignore the declared type and sniff the
    // bytes — e.g. treat an "image" as HTML and run it here.
    'X-Content-Type-Options': 'nosniff',
  };
  // A download is not meant to render at all. If a browser does anyway, it gets
  // a unique origin, no script and nothing to load. Not applied to the inline
  // allow-list: none of it can script, and Chrome's PDF viewer refuses to run
  // inside a sandboxed document.
  if (!inline) headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  return headers;
}
