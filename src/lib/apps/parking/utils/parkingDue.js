// src/lib/apps/parking/utils/parkingDue.js
// Parking's dated items for the Planner (hub 1), as a pure function.
// docs/requirements/app_designs/Parking_App_Design.md §7.
//
// "What is due" is answered in ONE place (CLAUDE.md standing decision): the
// Planner shows these rows, Notifications will read the Planner's registry,
// and neither derives a parking date a second time. This file is that place.
//
// ⛔ NO PERSONAL DATA IN A ROW. The Planner is granted separately from Parking,
// and shows its rows beside other apps' work, so a row says "Licence PA-0014
// ends · L/PK/22" and never whose licence it is. The source is gated on the
// `parking` grant as well (planner/utils/linked.js), but a row that names
// nobody leaks nothing even if a gate is ever wrong.

import { outstandingDevices } from './agreementModel.js';

/**
 * @param {{agreements:object[], applications:object[], devices:object[], bayRefs:Map<string,string>}} data
 *        bayRefs maps a parking_bays id to its reference (L/PK/22)
 * @param {string} today  YYYY-MM-DD
 * @param {string|null} to  the window's end; anything later is left out
 * @returns {Array<{id:string, kind:string, date:string, title:string, detail:string|null, overdue:boolean, needsArranging:boolean}>}
 */
export function parkingDueItems({ agreements = [], applications = [], devices = [], bayRefs = new Map(), bays = [] }, today, to = null) {
  const ref = (bayId) => bayRefs.get(bayId) ?? 'a bay';
  const items = [];
  const push = (item) => { if (item.date && (!to || item.date <= to)) items.push(item); };

  for (const a of agreements) {
    // An agreement ending, or its notice running out. Once the date has
    // passed and it has not been ended, it is overdue: the bay is still shown
    // as held by someone whose agreement is over.
    if ((a.status === 'active' || a.status === 'notice_given') && a.ends_on) {
      push({
        id: `end:${a.id}`, kind: 'ending', date: a.ends_on,
        title: a.status === 'notice_given'
          ? `Notice runs out: ${a.reference} · ${ref(a.bay_id)}`
          : `Agreement ends: ${a.reference} · ${ref(a.bay_id)}`,
        detail: a.ends_on < today ? 'Past its end date — end it to free the bay' : null,
        overdue: a.ends_on < today, needsArranging: false,
      });
    }
    // A draft whose start date has come without being activated: somebody
    // has a bay they cannot yet be said to hold.
    if (a.status === 'draft' && a.starts_on <= today) {
      push({
        id: `draft:${a.id}`, kind: 'draft', date: today,
        title: `Draft not activated: ${a.reference} · ${ref(a.bay_id)}`,
        detail: `Was due to start ${a.starts_on}`, overdue: false, needsArranging: true,
      });
    }
    // ⛔ A device still out after the agreement ended still opens the gate.
    if ((a.status === 'ended' || a.status === 'terminated') && a.ends_on) {
      const out = outstandingDevices(a.id, devices).length;
      if (out) {
        push({
          id: `device:${a.id}`, kind: 'device', date: a.ends_on,
          title: `${out} device${out === 1 ? '' : 's'} not returned: ${a.reference}`,
          detail: 'It still opens the gate', overdue: true, needsArranging: false,
        });
      }
    }
  }

  for (const app of applications) {
    if (app.status === 'offered' && app.offer_expires_on) {
      push({
        id: `offer:${app.id}`, kind: 'offer', date: app.offer_expires_on,
        title: `Offer expires: ${ref(app.offered_bay_id)}`,
        detail: app.offer_expires_on < today ? 'Lapsed — record it, and offer the next in the queue' : null,
        overdue: app.offer_expires_on < today, needsArranging: false,
      });
    }
  }

  for (const b of bays) {
    if (b.in_service === false && b.out_of_use_until) {
      push({
        id: `bay:${b.id}`, kind: 'bay_back', date: b.out_of_use_until,
        title: `Due back in use: ${ref(b.id)}`,
        detail: b.out_of_use_reason ?? null,
        overdue: b.out_of_use_until < today, needsArranging: false,
      });
    }
  }

  return items.sort((x, y) => x.date.localeCompare(y.date));
}
