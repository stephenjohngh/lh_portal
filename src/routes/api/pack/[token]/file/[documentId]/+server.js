// src/routes/api/pack/[token]/file/[documentId]/+server.js
// GET /api/pack/:token/file/:documentId — a published pack's file bytes.
//
// This closes the security item deferred from P1. /api/media/file/:id is
// unauthenticated on the stated grounds that a storage id is opaque and a
// caller would need authenticated DB access to learn one. **That reasoning does
// not extend to a published pack**, whose entire purpose is to hand out a link.
// So a recipient never touches that endpoint: they come here, and every request
// is re-checked against the publication.
//
// Three gates, in order, all of which must pass:
//
//   1. the token resolves to a publication that is live (not revoked, not
//      expired) — checked on EVERY request, so revoking a link stops the images
//      in a page the recipient already has open;
//   1b. if the publication has a passphrase, this browser has answered it —
//      otherwise the lock on the page would be cosmetic, and someone holding
//      the link alone could still pull every file the manifest lists;
//   2. the requested document_id appears in that publication's manifest — an
//      allow-list of what the content actually references, so a valid link
//      cannot be walked outwards into the rest of the shelf;
//   3. the storage id comes from the manifest entry, never from the caller.
//
// Note what is NOT here: an origin check. The MOR public endpoints have one as
// CSRF defence on POSTs that accept no auth. This is a GET whose credential is
// in the path, and a recipient opening a file in a fresh tab sends no Referer —
// so an origin check would break legitimate use while defending nothing.

import { json }                 from '@sveltejs/kit';
import { storageProvider }      from '$lib/server/storage/index.js';
import { friendlyStorageError } from '$lib/server/storage/storageErrors.js';
import { checkRateLimit }       from '$lib/server/publicRateLimit.js';
import { declarableMime }       from '$lib/utils/mimeTypes';
import { manifestEntry }        from '$lib/apps/dossier/utils/snapshot.js';
import {
  findServablePublication, resolveManifest, readerRefusal,
} from '$lib/server/publicationReader.js';
import { hasGrant } from '$lib/server/publicationPassphrase.js';

/**
 * A Content-Disposition header that cannot break, whatever the file is called.
 *
 * Two hazards, both real with author-supplied names:
 *   * CR/LF and quotes would break out of the header — stripped.
 *   * A non-Latin-1 character (an accent, a dash, any non-Western script)
 *     THROWS when the Response is constructed, turning a perfectly ordinary
 *     filename into a 500. So the quoted form is ASCII-only, and the real name
 *     travels in RFC 5987 `filename*`, which every current browser prefers.
 */
function contentDisposition(rawName, kind) {
  const name = String(rawName ?? 'file');
  const ascii = name
    .replace(/[\r\n"\\]/g, '')        // cannot start a header or close the string
    .replace(/[^\x20-\x7e]/g, '_')    // cannot be encoded in a header at all
    .trim() || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Every refusal, whatever the cause. See publicationReader.readerRefusal(). */
function refuse() {
  return json({ error: readerRefusal().message }, { status: 404 });
}

export async function GET({ params, request, cookies }) {
  const allowed = await checkRateLimit(request, 'pack_asset');
  if (!allowed) return json({ error: 'Too many requests.' }, { status: 429 });

  // Gate 1 — is this link still good? Re-checked per request, not per page
  // load, so revocation reaches a page the recipient already has open.
  const found = await findServablePublication(params.token);
  if (!found.ok) return refuse();

  // Gate 1b — a passphrase-protected pack serves nothing until it is answered.
  if (!hasGrant(cookies, found.publication)) return refuse();

  // Gate 2 — is this file part of what the link exposes?
  const manifest = await resolveManifest(found.publication);
  const entry = manifestEntry(manifest, params.documentId);
  if (!entry) return refuse();

  // Gate 3 — the storage id is the manifest's, never the caller's. The caller
  // supplies a document_id and has no way to name a file outside the pack.
  const storageId = String(entry.provider_file_id ?? '');
  if (!/^[A-Za-z0-9_-]+$/.test(storageId)) return refuse();

  let data;
  try {
    ({ data } = await storageProvider.getFileStream(storageId));
  } catch (err) {
    // Deliberately the same refusal as every other failure — a recipient
    // learning that a file exists but cannot be read is of no use to them and
    // narrates storage internals to an unauthenticated caller.
    console.error('[PackAsset] fetch failed for', storageId, '—',
      friendlyStorageError(err), err?.code ?? '');
    return refuse();
  }

  // Inline only for the small non-scriptable set the shared allow-list permits;
  // everything else downloads as an opaque octet-stream under its own name. The
  // bytes are user-uploaded and served from our origin, so this is the same
  // caution the media proxy applies, with the same reasoning.
  const inline = declarableMime(entry.mime_type);
  const disposition = contentDisposition(entry.filename, inline ? 'inline' : 'attachment');

  return new Response(data, {
    headers: {
      'Content-Type':   inline || 'application/octet-stream',
      'Content-Length': String(data.length),
      'Content-Disposition': disposition,
      // Private to whoever holds the link: no shared-proxy caching, and a short
      // browser cache only, so a revoked link stops working promptly.
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}
