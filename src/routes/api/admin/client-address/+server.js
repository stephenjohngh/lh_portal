// src/routes/api/admin/client-address/+server.js
//
// GET — the address this deployment thinks the caller has, where it came from,
// and the raw headers behind it. Admin → Limits and timing → Visitor address
// shows it so that, after moving host (Netlify ↔ Northflank), an admin can see at
// once whether the sign-in lockout and the rate limits can tell visitors apart.
// Read only; it shows the caller only their own request.

import { json } from '@sveltejs/kit';
import * as env from '$app/env/private';
import { requireAdmin } from '#lib/server/requireAuth.js';
import { resolvedAddressOf, addressHeadersSeen, addressVerdict } from '#lib/server/clientAddress.js';

export async function GET({ request }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const resolved = resolvedAddressOf(request);
  return json({
    ...resolved,
    verdict: addressVerdict(resolved),
    headers: addressHeadersSeen(request),
    hostSettings: { ADDRESS_HEADER: env.ADDRESS_HEADER || null, XFF_DEPTH: env.XFF_DEPTH || null },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
