// src/routes/api/parking/bay-plan/+server.js
// The caretaker's printable bay plan, as Word. Thin on purpose: the document
// is built by $lib/server/parkingBayPlanDocx.js, which is tested; the plan
// images arrive already drawn by the browser (parking/utils/bayPlanImage.js).

import { today } from '../../../../lib/utils/dates.js';
import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/requireAuth';
import { getLogger } from '$lib/utils/logger';
import { buildBayPlanBuffer } from '$lib/server/parkingBayPlanDocx.js';
import { documentBuildingName } from '$lib/server/identity.js';

const logger = getLogger('parkingBayPlan');

export async function POST({ request }) {
  // Authenticated users only — renders caller-supplied data into a document.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    // The building as an admin named it (Admin → Building & business), never
    // what the request carried or a name in code.
    body.building = await documentBuildingName();
    const buffer = await buildBayPlanBuffer(body);
    const date = today();
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="Parking_Bay_Plan_${date}.docx"`,
      },
    });
  } catch (/** @type {any} */ err) {
    logger('❌ bay plan failed:', err);
    const message = err?.message ?? 'Failed to build the bay plan';
    return json({ error: message }, { status: /No basement plan/.test(message) ? 400 : 500 });
  }
}
