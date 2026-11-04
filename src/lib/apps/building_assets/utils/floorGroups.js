// src/lib/apps/building_assets/utils/floorGroups.js
// Floor groups, pure (migration 280). A group is a name and a set of floors,
// set in Admin → Floors and spaces → Floor groups; each with floors in it is a
// button beside "All" on the Components tab. Nothing here names a floor: which
// floors a building calls its basement is that building's own setting.

/** @typedef {{ id: string, name: string, position?: number, floorIds: string[] }} FloorGroup */

/** Rows as read (with floor_group_floors embedded) → groups, in order. @param {any[]} rows @returns {FloorGroup[]} */
export function toFloorGroups(rows) {
  return (rows ?? [])
    .map((g) => ({ id: g.id, name: g.name, position: g.position ?? 0, floorIds: (g.floor_group_floors ?? []).map((m) => m.floor_id) }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** The Components tab's buttons: All, then every group with floors in it. @param {FloorGroup[]} groups */
export function floorGroupOptions(groups) {
  return [{ value: 'all', label: 'All' },
    ...(groups ?? []).filter((g) => g.floorIds.length > 0).map((g) => ({ value: g.id, label: g.name }))];
}

/** The group a floor filter value names, or null ('all', 'custom', a group since deleted). @param {string} value @param {FloorGroup[]} groups */
export function floorGroupOf(value, groups) {
  return (groups ?? []).find((g) => g.id === value) ?? null;
}

/** "Basement (X, L, U)", floors in building order. @param {FloorGroup} group @param {Array<{id: string, short_name: string}>} floors */
export function floorGroupLabel(group, floors) {
  const shorts = (floors ?? []).filter((f) => group.floorIds.includes(f.id)).map((f) => f.short_name);
  return shorts.length ? `${group.name} (${shorts.join(', ')})` : group.name;
}

/**
 * Why a group cannot be saved, or ''.
 * @param {string} name @param {string|null} id  the group being edited
 * @param {FloorGroup[]} groups
 */
export function floorGroupProblem(name, id, groups) {
  const n = (name ?? '').trim();
  if (!n) return 'A group needs a name.';
  if (n.length > 40) return 'Up to 40 characters.';
  if (n.toLowerCase() === 'all') return '"All" is already a button.';
  if ((groups ?? []).some((g) => g.id !== id && g.name.trim().toLowerCase() === n.toLowerCase())) return 'There is already a group with that name.';
  return '';
}
