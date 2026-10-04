// src/routes/api/auth/media-session/+server.js
// POST   /api/auth/media-session — issue the media session cookie
// DELETE /api/auth/media-session — clear it (logout)
//
// The media proxy (GET /api/media/file/:id) serves <img src> and plain links,
// which cannot carry the bearer token the rest of the API uses. So a verified
// bearer token is exchanged here for a cookie the browser sends by itself:
// HttpOnly (no script can read it), SameSite=Lax, scoped to /api/media only,
// signed, and good for 12 hours. The client renews it on every token refresh
// (src/lib/stores/auth.js). Security review, 2026-09-27;
// #lib/server/mediaAccess.js has the rest.

import { json }        from '@sveltejs/kit';
import { requireAuth } from '#lib/server/requireAuth.js';
import {
  MEDIA_COOKIE, MEDIA_COOKIE_PATH, mediaSessionSeconds, mediaSessionValue,
} from '#lib/server/mediaAccess.js';
import { loadServerPolicies } from '#lib/server/policies.js';

export async function POST({ request, cookies }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  await loadServerPolicies();   // the pass's length is an admin policy
  cookies.set(MEDIA_COOKIE, mediaSessionValue(auth.user.id), {
    path:     MEDIA_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   mediaSessionSeconds(),
  });
  return json({ ok: true });
}

// No auth: clearing a cookie grants nothing, and logout must work with an
// expired token.
export async function DELETE({ cookies }) {
  cookies.delete(MEDIA_COOKIE, { path: MEDIA_COOKIE_PATH });
  return json({ ok: true });
}
