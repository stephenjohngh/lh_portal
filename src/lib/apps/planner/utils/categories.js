// src/lib/apps/planner/utils/categories.js
// What kinds of thing appear on a building's year, and what colour each is.
//
// A fixed list rather than free text or a table. Free text gives four spellings
// of "compliance" and a legend nobody can read; a table gives a management
// screen to build and maintain before the app does anything at all. These are
// the categories a residential block's year actually contains, and adding one
// is a line here.
//
// ── The rule these colours follow: teal is CHROME, never data ───────────────
// The portal's accent is teal, and `tailwind.config.js` remaps the whole
// `purple-*` scale onto it — so `purple-400` renders teal, not purple. The
// first version of this file did not account for that and picked purple-400
// for Meeting, teal-400 for Seasonal and emerald-500 for Financial: three of
// seven categories came out in the accent colour or next to it, so the data
// read as interface. Buttons, selection and "today" are teal; a category never
// is.
//
// The remaining constraint is that seven hues have to be told apart as a dot
// six pixels across, on a dark ground, by somebody scanning a year. Hence one
// red, one orange, one blue, one violet, one magenta, one yellow-green and one
// grey — no two neighbours on the wheel.
//
// Two of them are not free choices: red for Compliance and amber for
// Maintenance match what red and amber already mean everywhere else in the
// portal (failed, and due soon).

export const CATEGORIES = [
  { value: 'compliance',  label: 'Compliance',  dot: 'bg-red-500',      chip: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'maintenance', label: 'Maintenance', dot: 'bg-amber-500',    chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'meeting',     label: 'Meeting',     dot: 'bg-indigo-400',   chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  { value: 'financial',   label: 'Financial',   dot: 'bg-fuchsia-400',  chip: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30' },
  { value: 'contractor',  label: 'Contractor',  dot: 'bg-sky-400',      chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { value: 'seasonal',    label: 'Seasonal',    dot: 'bg-lime-400',     chip: 'bg-lime-500/15 text-lime-300 border-lime-500/30' },
  { value: 'other',       label: 'Other',       dot: 'bg-slate-400',    chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
];

const BY_VALUE = new Map(CATEGORIES.map(c => [c.value, c]));

/** The category record, or a neutral one — never undefined at a render site. */
export function categoryOf(value) {
  return BY_VALUE.get(value) ?? { value: null, label: 'Uncategorised', dot: 'bg-slate-600',
                                  chip: 'bg-slate-700/40 text-slate-400 border-slate-600/40' };
}
