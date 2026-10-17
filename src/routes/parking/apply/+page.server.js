// src/routes/parking/apply/+page.server.js
// The public parking application form has no login, so what it shows — the
// privacy notice an admin set, the building's name, whether applications are
// open — is read here, on the server (#lib/server/parkingApply.js).

import { applyFormContext } from '#lib/server/parkingApply.js';

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  try {
    return await applyFormContext();
  } catch {
    return { buildingName: '', privacyNotice: '', open: false, unavailable: true };
  }
}
