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

import { api } from '#lib/utils/api.js';
import { listParkingBaySpaces } from '#lib/apps/building_assets/public.js';
import { buildSpaceRef } from '#lib/utils/spaceRef.js';
import { parkingDueItems } from './utils/parkingDue.js';
import { todayISO } from './utils/agreementModel.js';
import { listDeadlines } from '#lib/workflow/workflowApi.js';
import { APPLICATION_WORKFLOW_KEY } from './utils/applicationWorkflow.js';

/**
 * Parking's dated items for the Planner: agreements ending, notice running
 * out, drafts not activated, devices not returned, offers expiring, and bays
 * due back in use — and online applications whose workflow step has a
 * deadline (migration 248). Each row names a licence, a bay or an
 * application's reference, never a person.
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
    api.getAll('parking_access_devices', { select: 'id, agreement_id, device_type, returned_on' }),
    api.getAll('parking_bays', { select: 'id, space_id, in_service, out_of_use_until, out_of_use_reason' }),
    listParkingBaySpaces(),
    api.get('floors', { select: 'id, short_name' }),
  ]);
  const spaceById = new Map(spaces.map(s => [s.id, s]));
  const bayRefs = new Map(bays.map(b => [b.id, buildSpaceRef(spaceById.get(b.space_id), floors)]));
  const today = todayISO();
  const items = parkingDueItems({ agreements, applications, devices, bays, bayRefs }, today, to);
  // Application deadlines fail alone: a missing workflow is not a broken Planner.
  const deadlines = await listDeadlines(APPLICATION_WORKFLOW_KEY).catch(() => []);
  for (const d of deadlines) {
    if (to && d.due_on > to) continue;
    items.push({
      id: `application:${d.id}`, kind: 'application', date: d.due_on,
      title: `Application ${d.label ?? ''} — ${d.step}`.replace(/\s+—/, ' —'),
      detail: d.due_on < today ? 'Past its step’s deadline' : null,
      overdue: d.due_on < today, needsArranging: false,
    });
  }
  return items;
}
