// src/lib/apps/planner/utils/categories.js
// What kinds of thing appear on a building's year, and what colour each is.
//
// A fixed list rather than free text or a table. Free text gives four spellings
// of "compliance" and a legend nobody can read; a table gives a management
// screen to build and maintain before the app does anything at all. These are
// the categories a residential block's year actually contains, and adding one
// is a line here.
//
// Colours are Tailwind classes rather than hex, so they follow the portal's
// palette — and they are picked to be distinguishable in the year grid, which is
// the view that has to carry a dozen of them at once.

export const CATEGORIES = [
  { value: 'compliance',  label: 'Compliance',  dot: 'bg-red-500',     chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'maintenance', label: 'Maintenance', dot: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'meeting',     label: 'Meeting',     dot: 'bg-purple-400',  chip: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  { value: 'financial',   label: 'Financial',   dot: 'bg-emerald-500', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'contractor',  label: 'Contractor',  dot: 'bg-sky-500',     chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { value: 'seasonal',    label: 'Seasonal',    dot: 'bg-teal-400',    chip: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  { value: 'other',       label: 'Other',       dot: 'bg-slate-400',   chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
];

const BY_VALUE = new Map(CATEGORIES.map(c => [c.value, c]));

/** The category record, or a neutral one — never undefined at a render site. */
export function categoryOf(value) {
  return BY_VALUE.get(value) ?? { value: null, label: 'Uncategorised', dot: 'bg-slate-600',
                                  chip: 'bg-slate-700/40 text-slate-400 border-slate-600/40' };
}
