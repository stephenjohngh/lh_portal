// src/lib/apps/planner/public.js
//
// PUBLIC INTERFACE of the Planner — what other apps may read. Stateless; nothing here
// writes. (The Planner READS other apps through theirs; this is the other direction:
// the Guides editor names a Planner event it links a guide to.)

import { api } from '#lib/utils/api.js';

/**
 * The events the Planner owns, for a picker: id, title and when it starts. Archived
 * events are included (a link may still name one).
 * @returns {Promise<Array<{ id: string, title: string, start_date: string }>>}
 */
export function listPlannerEventsForPicker() {
  return api.getAll('planner_events', { select: 'id, title, start_date', orderBy: 'title' });
}
