// src/lib/apps/parking/public.js
//
// PUBLIC INTERFACE of the Parking app — what other apps may read from it.
// Other apps import from HERE and nowhere else inside `parking/`.
//
// ⛔ Parking holds the details of people who are not staff (a bounded
// exception to the resident-data rule, design §3). Nothing exported here
// returns a holder's name, contact details or vehicles: another app that
// needs one of those is asking for the wrong thing, and should link to the
// Parking app instead.

import { api } from '$lib/utils/api';
import { listParkingBaySpaces } from '$lib/apps/building_assets/public.js';
import { buildSpaceRef } from '$lib/utils/spaceRef.js';
import { parkingDueItems } from './utils/parkingDue.js';
import { todayISO } from './utils/agreementModel.js';

/**
 * Parking's dated items for the Planner: agreements ending, notice running
 * out, drafts not activated, devices not returned, offers expiring, and bays
 * due back in use. Each row names a licence and a bay, never a person.
 *
 * Bounded at `to` only: an item already past is overdue, and must not fall out
 * of view for predating the Planner's window. RLS on every parking table is
 * gated on the `parking` grant, so without it this returns nothing.
 *
 * @param {string|null} to  YYYY-MM-DD
 */
export async function listParkingDueDates(to = null) {
  const [agreements, applications, devices, bays, spaces, floors] = await Promise.all([
    api.getAll('parking_agreements', { select: 'id, reference, bay_id, status, starts_on, ends_on' }),
    api.getAll('parking_applications', { select: 'id, status, offered_bay_id, offer_expires_on' }),
    api.getAll('parking_access_devices', { select: 'id, agreement_id, returned_on' }),
    api.getAll('parking_bays', { select: 'id, space_id, in_service, out_of_use_until, out_of_use_reason' }),
    listParkingBaySpaces(),
    api.get('floors', { select: 'id, short_name' }),
  ]);
  const spaceById = new Map(spaces.map(s => [s.id, s]));
  const bayRefs = new Map(bays.map(b => [b.id, buildSpaceRef(spaceById.get(b.space_id), floors)]));
  return parkingDueItems({ agreements, applications, devices, bays, bayRefs }, todayISO(), to);
}
