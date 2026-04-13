// src/lib/apps/v2proto/stores/helpers.js
// Shared utilities used across all v2proto action modules.

import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth';

// ── Auth guard ─────────────────────────────────────────────────────────────
// Call at the top of any write method. Throws immediately if no user is
// authenticated so no DB write occurs with a null created_by / updated_by.
export function requireUserId() {
  const userId = get(auth).user?.id;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

// ── Component reference string ─────────────────────────────────────────────
// Canonical human-readable ref for a component.
// Format: "{facility short_name} / {floor short_name} / {type name} / {asset_id or label}"
// e.g.   "BH / G / Fire Door / FD-042"
// Used for linked_component_ref values and for the datalist in component forms.
export function buildRef(component, floors, facilities, types) {
  if (!component) return '';
  const floor    = floors.find(f => f.id === component.floor_id);
  const facility = floor ? facilities.find(f => f.id === floor.facility_id) : null;
  const type     = types.find(t => t.code === component.type_code);
  const facName  = facility?.short_name ?? '?';
  const flrName  = floor?.short_name    ?? '?';
  const typeName = type?.name ?? component.type_code ?? '?';
  const id       = component.asset_id || component.label || component.id?.slice(0, 8) || '?';
  return `${facName} / ${flrName} / ${typeName} / ${id}`;
}
