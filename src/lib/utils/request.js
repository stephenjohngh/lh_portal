// src/lib/utils/request.js
// Thin wrapper for authenticated JSON calls to the portal's own API routes.
//
// Collapses the pattern repeated across many components:
//     const res  = await fetch(url, { headers: await authHeaders() });
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

async function parse(res, fallback) {
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
  const res = await fetch(url, { headers: await authHeaders() });
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
    headers: await authHeaders(),
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
    headers: await authHeaders(),
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
  const res = await fetch(url, { method: 'DELETE', headers: await authHeaders() });
  return parse(res, errorFallback);
}
