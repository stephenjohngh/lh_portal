// src/lib/utils/planConstants.js
//
// FLOOR_LEVELS is the single source of truth for floor order across the
// codebase. floorSorting.js derives FLOOR_ORDER from this array — add new
// floors here only and all sort functions update automatically.
//
// (This file used to also contain V1 element types, statuses and marker
// settings; those were dropped along with the V1 plan_elements / walk_*
// tables and have been removed.)

export const FLOOR_LEVELS = [
  { value: 'X', label: 'X — L80 Lower' },
  { value: 'L', label: 'L — Lower' },
  { value: 'U', label: 'U — Upper' },
  { value: 'G', label: 'G — Ground' },
  { value: '1', label: '1 — First' },
  { value: '2', label: '2 — Second' },
  { value: '3', label: '3 — Third' },
  { value: '4', label: '4 — Fourth' },
  { value: '5', label: '5 — Fifth' },
  { value: '6', label: '6 — Sixth' },
  { value: '7', label: '7 — Seventh' },
  { value: 'R', label: 'R — Roof' },
  { value: 'E', label: 'E — External' },
];
