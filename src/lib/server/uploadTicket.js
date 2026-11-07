// src/lib/server/uploadTicket.js
//
// Signed tickets for an upload in pieces. A piece is its own request, possibly on
// another server, so the state between pieces travels with the browser. Signing it
// means the browser cannot change it:
//   · the address pieces are sent to, so a caller cannot point the server at any
//     other URL;
//   · the folder, name and size, so the document recorded at the end is the one
//     that was permitted at the start;
//   · who started it, so it is useless to anyone else.
// It is signed, not secret: the browser can read it, and the address in it only
// lets the holder add to that one unfinished file.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import * as env from '$app/env/private';
import { DAY_MS } from '#lib/utils/dates.js';

function key() {
  return createHash('sha256')
    .update('lh-portal:upload-ticket:' + (env.SUPABASE_SERVICE_ROLE_KEY ?? ''))
    .digest();
}

const sign = (body) => createHmac('sha256', key()).update(body).digest('base64url');

/**
 * @param {string} kind  'session' while sending, 'receipt' once the file is complete
 * @param {Record<string, any>} data
 * @param {number} [now]
 */
export function makeTicket(kind, data, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...data, kind, exp: now + DAY_MS }), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * The ticket's contents, or null if it is forged, expired, the wrong kind, or not
 * this user's.
 * @param {unknown} ticket
 * @param {string} kind
 * @param {string} userId
 * @param {number} [now]
 * @returns {Record<string, any>|null}
 */
export function readTicket(ticket, kind, userId, now = Date.now()) {
  if (typeof ticket !== 'string') return null;
  const [body, sig, extra] = ticket.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const supplied = Buffer.from(sig);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (data.kind !== kind || data.userId !== userId || !(data.exp > now)) return null;
  return data;
}
