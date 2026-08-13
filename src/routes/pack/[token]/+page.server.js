// src/routes/pack/[token]/+page.server.js
// The public reader's data load. No auth, no session, no anon key.
//
// A server `load` rather than a client fetch against an /api/pack endpoint,
// which is what the plan originally sketched. The load function has the same
// isolation properties — it runs server-side and goes through
// $lib/server/publicationReader, the single token→content path — and it is
// strictly better here: the token never has to be handed to client JavaScript,
// there is no second endpoint to secure, and the page renders server-side for a
// recipient who may be on a phone in a meeting.
//
// The asset endpoint (step 4) stays a real API route, because bytes have to
// stream.

import {
  findServablePublication, readPublicationContent, publicPublicationFields,
  stripStorageIds,
} from '$lib/server/publicationReader.js';
import { checkRateLimit } from '$lib/server/publicRateLimit.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, request, setHeaders }) {
  // Throttle by IP before any lookup. The token is unguessable, so this is not
  // the primary defence — it is what makes enumeration pointless rather than
  // merely impractical, and it is the same table-backed limiter the MOR public
  // endpoints use (an in-memory one is useless across serverless cold starts).
  const allowed = await checkRateLimit(request, 'pack_read');
  if (!allowed) {
    return { refused: true, message: 'Too many requests. Please try again shortly.' };
  }

  const found = await findServablePublication(params.token);
  if (!found.ok) return { refused: true, message: found.message };

  const content = await readPublicationContent(found.publication);
  if (!content) return { refused: true, message: found.message };

  // A published pack is private to whoever holds the link. It must not be
  // cached by a shared proxy, and it must not turn up in a search index.
  setHeaders({
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag':  'noindex, nofollow, noarchive',
  });

  return {
    refused:     false,
    publication: publicPublicationFields(found.publication),
    // Storage ids never leave for a recipient — see stripStorageIds() for why
    // revocation depends on it.
    content:     stripStorageIds(content),
    // The recipient's own path to file bytes. Built from the token they already
    // hold; the manifest check happens server-side on every request.
    assetBase:   `/api/pack/${params.token}/file/`,
  };
}
