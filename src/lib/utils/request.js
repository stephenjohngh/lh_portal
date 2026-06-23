// src/lib/utils/request.js
// Thin wrapper for authenticated JSON calls to the portal's own API routes.
//
// Collapses the pattern repeated across many components:
//     const res  = await fetch(url, { headers: await headers() });
//     const data = await res.json();
//     if (!res.ok) throw new Error(data.error ?? '…');
// into getJson/postJson/patchJson/del. Every call carries the Supabase bearer
// token (via authHeaders), parses JSON, and throws an Error with the server's
// `error` message on a non-2xx response.
//
// Use this for JSON endpoints. NOT for:
//   • multipart uploads  → use $lib/utils/documentApi or $lib/utils/mediaUpload
//   • file downloads     → use $lib/utils/download (downloadResponse)
//
// @example
//   import { postJson } from '$lib/utils/request';
//   const { summary } = await postJson('/api/management/suggest-summary', { body, activity_type });

import { authHeaders } from '$lib/utils/authHeaders';

// Shown when there is no valid session client-side (authHeaders throws) or the
// server rejects the token (HTTP 401). Friendlier and more actionable than the
// raw 'Not authenticated' / 'Unauthorized' strings these paths produce.
export const SESSION_EXPIRED = 'Your session has expired — please log in again.';

/** authHeaders(), but a missing session surfaces as SESSION_EXPIRED. */
async function headers() {
  try {
    return await authHeaders();
  } catch {
    throw new Error(SESSION_EXPIRED);
  }
}

async function parse(res, fallback) {
  // A 401 means the token was missing/expired/invalid — map it to a clear,
  // actionable message regardless of the server's terse body ('Unauthorized').
  if (res.status === 401) throw new Error(SESSION_EXPIRED);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? fallback ?? `Request failed (${res.status})`);
  return data;
}

/**
 * GET a JSON endpoint.
 * @param {string} url
 * @param {string} [errorFallback]
 * @returns {Promise<any>}
 */
export async function getJson(url, errorFallback) {
  const res = await fetch(url, { headers: await headers() });
  return parse(res, errorFallback);
}

/**
 * POST a JSON body and parse the JSON response.
 * @param {string} url
 * @param {any} [body]
 * @param {string} [errorFallback]
 * @returns {Promise<any>}
 */
export async function postJson(url, body, errorFallback) {
  const res = await fetch(url, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify(body ?? {}),
  });
  return parse(res, errorFallback);
}

/**
 * PATCH a JSON body and parse the JSON response.
 * @param {string} url
 * @param {any} [body]
 * @param {string} [errorFallback]
 * @returns {Promise<any>}
 */
export async function patchJson(url, body, errorFallback) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify(body ?? {}),
  });
  return parse(res, errorFallback);
}

/**
 * DELETE a JSON endpoint (response body optional).
 * @param {string} url
 * @param {string} [errorFallback]
 * @returns {Promise<any>}
 */
export async function del(url, errorFallback) {
  const res = await fetch(url, { method: 'DELETE', headers: await headers() });
  return parse(res, errorFallback);
}
