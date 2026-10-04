// src/lib/utils/mediaSession.js
// Open and close the media session — the HttpOnly cookie that lets <img src>
// and plain links reach the file proxy (/api/media/file/:id), which a bearer
// token cannot do. Security review, 2026-09-27; the server half is
// src/routes/api/auth/media-session/+server.js and #lib/server/mediaAccess.js.
//
// Both are best-effort: a failure here must never stop someone logging in or
// out. The cost of a failure is images that do not load until the next token
// refresh renews the cookie.

/**
 * Exchange a bearer token for the media session cookie.
 * @param {string|null|undefined} accessToken
 */
export async function openMediaSession(accessToken) {
  if (!accessToken) return;
  try {
    await fetch('/api/auth/media-session', {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch { /* best-effort */ }
}

/** Clear the media session cookie (logout). */
export async function closeMediaSession() {
  try {
    await fetch('/api/auth/media-session', { method: 'DELETE', keepalive: true });
  } catch { /* best-effort */ }
}
