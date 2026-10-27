// src/routes/status/+page.server.js
// The public status page (migration 261) has no login: its introduction —
// an admin setting, Admin → Portal settings → Wording — is read here, filled with
// this building's name. The look-up itself is POST /api/status.

import { getIdentity } from '#lib/server/identity.js';
import { serverWording } from '#lib/server/wording.js';

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  try {
    const { building } = await getIdentity();
    return { intro: await serverWording('publicStatusIntro', { building: building.name ?? 'the building' }) };
  } catch {
    return { intro: '' };
  }
}
