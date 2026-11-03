// src/routes/api/pack/[token]/unlock/+server.js
// POST /api/pack/:token/unlock — answer a publication's passphrase.
//
// On success it sets a short-lived, HttpOnly grant cookie scoped to that ONE
// publication, so the recipient can read the pack and open its files without
// being asked again and without the passphrase ever appearing in a URL.
//
// Failure says only "that is not right". It does not distinguish a wrong
// passphrase from a link that has no passphrase, from a link that does not
// exist — for the same reason every other refusal in this app is uniform.

import { json }               from '@sveltejs/kit';
import { checkRateLimit, checkKeyRateLimit } from '#lib/server/publicRateLimit.js';
import { isSameOrigin }       from '#lib/server/verifyOrigin.js';
import { findServablePublication } from '#lib/server/publicationReader.js';
import {
  needsPassphrase, mintGrant, grantCookieName, grantCookieOptions,
} from '#lib/server/publicationPassphrase.js';
import { recordPublicationEvent, safeAddress } from '#lib/server/publicationEvents.js';
import { verifyPassphrase } from '#lib/apps/dossier/utils/publicationPassphrase.js';

const WRONG = 'That passphrase was not recognised.';

export async function POST({ params, request, url, cookies, getClientAddress }) {
  const address = safeAddress(getClientAddress);
  // Unlike the asset GET, this one DOES get an origin check: it is an
  // unauthenticated POST, which is the shape CSRF exploits, and it is only ever
  // called by the reader page's own form.
  if (!isSameOrigin(request, url)) {
    return json({ error: WRONG }, { status: 403 });
  }

  // The passphrase is the low-entropy half of this credential, so the limiter
  // is what makes guessing it impractical. Keyed per IP, table-backed, and
  // checked before any work.
  if (!await checkRateLimit(request, 'pack_unlock')) {
    return json({ error: 'Too many attempts. Please try again shortly.' }, { status: 429 });
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: WRONG }, { status: 401 }); }

  const found = await findServablePublication(params.token);
  // Same 401 as a wrong passphrase: a caller must not learn that a token is
  // valid by watching this endpoint's status codes.
  if (!found.ok || !needsPassphrase(found.publication)) {
    return json({ error: WRONG }, { status: 401 });
  }

  // And per LINK, across every address: the per-address limit above does not
  // stop many addresses guessing one link's passphrase together.
  if (!await checkKeyRateLimit(`link:${found.publication.id}`, 'pack_unlock_link')) {
    return json({ error: 'Too many attempts. Please try again shortly.' }, { status: 429 });
  }

  const ok = await verifyPassphrase(
    body?.passphrase, found.publication.passphrase_hash, found.publication.passphrase_salt);
  if (!ok) {
    await recordPublicationEvent(request, found.publication.id, 'unlock_failed', { address });
    return json({ error: WRONG }, { status: 401 });
  }
  await recordPublicationEvent(request, found.publication.id, 'unlock_ok', { address });

  cookies.set(
    grantCookieName(found.publication.id),
    mintGrant(found.publication.id),
    grantCookieOptions(url));

  return json({ ok: true });
}
