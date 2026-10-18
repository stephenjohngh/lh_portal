// src/lib/workflow/fieldLinks.js
//
// What a process's LINK fields offer — the portal's components, spaces and
// users — read only for the link types the process actually has. Used by the
// item controls (any app) and the Cases "Open a case" form.
// ⛔ A person is a portal user, never a resident.

import { api } from '#lib/utils/api.js';
import { linkOptions, LINK_TYPES } from './workflowFieldValues.js';

/**
 * @param {Array<{ type: string }>} fields
 * @param {Array<{ id: string, full_name: string|null }>} people  the portal's users, already read
 */
export async function loadLinkOptions(fields, people = []) {
  const want = new Set(fields.map((f) => f.type).filter((t) => LINK_TYPES.includes(t)));
  const [components, spaces, floors, types] = await Promise.all([
    want.has('component') ? api.getAll('components', { select: 'id, label, asset_id, type_code, floor_id' }) : [],
    want.has('space') ? api.getAll('spaces', { select: 'id, label, name, kind, assigned_id, floor_id' }) : [],
    want.has('component') || want.has('space') ? api.get('floors', { select: 'id, short_name' }) : [],
    want.has('component') ? api.getAll('component_types', { select: 'id, code, initial' }) : [],
  ]);
  return linkOptions({ components, spaces, floors, types, people });
}
