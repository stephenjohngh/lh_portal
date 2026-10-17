// src/lib/utils/sessionExpired.js
// Shown when there is no valid session client-side (authHeaders throws) or the
// server rejects the token (HTTP 401). Friendlier and more actionable than the
// raw 'Not authenticated' / 'Unauthorized' strings these paths produce.
// Its own module (2026-10-17) so code that only compares against it — the
// offline queues' retry rule — need not load the sign-in client with request.js.
export const SESSION_EXPIRED = 'Your session has expired — please log in again.';
