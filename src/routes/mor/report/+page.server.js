// src/routes/mor/report/+page.server.js
// The public MOR form has no login, so it cannot read the portal's settings
// itself. The one it needs — how many photos a report may carry, an admin
// policy (Admin → Other Config → Policies) — is read here, on the server.

import { serverPolicy } from '$lib/server/policies.js';

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  return { maxPhotos: await serverPolicy('morPhotosPerReport') };
}
