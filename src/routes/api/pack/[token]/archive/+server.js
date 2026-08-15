// src/routes/api/pack/[token]/archive/+server.js
// GET /api/pack/:token/archive — the whole pack as a zip the recipient keeps.
//
// Merge doc §9.4's "download all", built as an OFFLINE ARCHIVE: a copy that
// keeps working when the link expires, when the pack changes, and when this
// application is not there. That is its whole point, so it contains the files
// themselves rather than links to them, and a README saying what it is.
//
// The gates are the same three the single-file endpoint applies, in the same
// order and for the same reasons — this is the same act, performed for every
// file at once, and it must not become the softer way in:
//
//   1. the token resolves to a publication that is live;
//   1b. a passphrase-protected pack is unlocked in this browser — otherwise
//       one request would hand over everything the lock exists to protect;
//   2/3. only files in the manifest, addressed by the manifest's storage id.
//
// Rate-limited under its own key: one request here costs as much as every file
// request put together, so it cannot share a budget with them.

import { json }             from '@sveltejs/kit';
import { checkRateLimit }   from '$lib/server/publicRateLimit.js';
import { buildPackArchive } from '$lib/server/packArchiveBuilder.js';
import {
  findServablePublication, readPublicationContent, resolveManifest, readerRefusal,
} from '$lib/server/publicationReader.js';
import { hasGrant } from '$lib/server/publicationPassphrase.js';

/**
 * The notice that travels with the material. Duplicated from the reader page
 * deliberately: a .svelte file cannot be imported by a server route, and the
 * alternative — a shared module for one string — buys less than it costs. The
 * archive test asserts the README carries it.
 */
const CONFIDENTIALITY_NOTICE =
  'This document package contains proprietary and confidential information '
  + 'intended strictly for the designated recipient. Please do not copy, '
  + 'forward, or distribute these materials without prior written consent.';

function refuse() {
  return json({ error: readerRefusal().message }, { status: 404 });
}

export async function GET({ params, request, cookies }) {
  const allowed = await checkRateLimit(request, 'pack_archive');
  if (!allowed) return json({ error: 'Too many requests.' }, { status: 429 });

  const found = await findServablePublication(params.token);
  if (!found.ok) return refuse();
  if (!hasGrant(cookies, found.publication)) return refuse();

  const content = await readPublicationContent(found.publication);
  if (!content) return refuse();

  const manifest = await resolveManifest(found.publication);

  const result = await buildPackArchive({
    content, manifest, notice: CONFIDENTIALITY_NOTICE,
  });
  if (!result.ok) return json({ error: result.message }, { status: 413 });

  return new Response(result.zip, {
    headers: {
      'Content-Type':   'application/zip',
      'Content-Length': String(result.zip.length),
      'Content-Disposition':
        `attachment; filename="${result.filename.replace(/[^\x20-\x7e]/g, '_')}"; `
        + `filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      // Never cached anywhere: it is assembled per request from a publication
      // that can be revoked between two of them.
      'Cache-Control': 'no-store',
      'X-Robots-Tag':  'noindex, nofollow, noarchive',
    },
  });
}
