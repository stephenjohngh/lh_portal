// src/lib/apps/planner/utils/categories.js
// The palette categories are drawn from, and how a category renders.
//
// The categories themselves are the building's own and live in
// `planner_categories` (migration 179). What stays here is the PALETTE, and one
// rule the palette exists to keep.
//
// ── Colour is a key, never a hex value ──────────────────────────────────────
// Tailwind generates only the classes it can see in the source. A colour picked
// at runtime cannot become `bg-<whatever>-500`: the class would not exist and
// the dot would render as nothing. So a category stores a KEY into this table,
// which keeps every class static and scannable.
//
// ── Teal is chrome, never data ──────────────────────────────────────────────
// The portal's accent is teal, and tailwind.config.js remaps the whole
// `purple-*` scale onto it — so `purple-400` renders teal. Buttons, focus rings,
// selection and "today" are teal; a category never is. There is deliberately no
// teal, emerald or purple swatch below, which is a constraint on the palette
// rather than a matter of taste: a category in the accent colour reads as
// interface.
//
// The rest is that these have to be told apart as a dot six pixels across, on a
// dark ground, by somebody scanning a year — hence one red, one orange, one
// blue, one violet, one magenta, one yellow-green, one grey, no two neighbours
// on the wheel.

// `wash` is the same colour again at the strength a whole cell can carry.
// A dot at full strength is a mark; a cell at full strength is a shout, and
// the date printed on it stops being readable.
export const PALETTE = [
  { key: 'red',     label: 'Red',     dot: 'bg-red-500',     chip: 'bg-red-500/15 text-red-300 border-red-500/30',         wash: 'bg-red-500/25' },
  { key: 'amber',   label: 'Amber',   dot: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',   wash: 'bg-amber-500/25' },
  { key: 'lime',    label: 'Lime',    dot: 'bg-lime-400',    chip: 'bg-lime-500/15 text-lime-300 border-lime-500/30',      wash: 'bg-lime-500/25' },
  { key: 'sky',     label: 'Sky',     dot: 'bg-sky-400',     chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',         wash: 'bg-sky-500/25' },
  { key: 'indigo',  label: 'Indigo',  dot: 'bg-indigo-400',  chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30', wash: 'bg-indigo-500/25' },
  { key: 'fuchsia', label: 'Fuchsia', dot: 'bg-fuchsia-400', chip: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', wash: 'bg-fuchsia-500/25' },
  { key: 'rose',    label: 'Rose',    dot: 'bg-rose-400',    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',      wash: 'bg-rose-500/25' },
  { key: 'orange',  label: 'Orange',  dot: 'bg-orange-400',  chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30', wash: 'bg-orange-500/25' },
  { key: 'slate',   label: 'Grey',    dot: 'bg-slate-400',   chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',   wash: 'bg-slate-500/25' },
];

const BY_KEY = new Map(PALETTE.map(c => [c.key, c]));

/** A swatch, or grey — never undefined at a render site. */
export function swatch(key) {
  return BY_KEY.get(key) ?? BY_KEY.get('slate');
}

/**
 * The slugs the aggregation names.
 *
 * utils/linked.js files every foreign item under one of these, so they have to
 * exist. The database marks the same four `system` and refuses to delete them;
 * this list is what the UI uses to explain why.
 */
export const SYSTEM_SLUGS = ['compliance', 'maintenance', 'meeting', 'other'];

/**
 * How one category renders, given the list loaded from the database.
 *
 * Takes the list rather than reaching for a store, so every view that draws a
 * category is a pure function of what it was handed — and so this stays
 * testable.
 *
 * An unknown slug still renders: an event filed under a category somebody has
 * since removed shows in grey under its own slug rather than vanishing, which
 * is the difference between a visible loose end and a silent one.
 */
export function categoryOf(slug, categories = []) {
  const found = categories.find(c => c.slug === slug);
  if (found) return { ...found, ...swatch(found.colour) };

  if (!slug) {
    return { slug: null, name: 'Uncategorised', ...swatch('slate') };
  }
  return { slug, name: slug, missing: true, ...swatch('slate') };
}

/** The ones worth offering in a picker — in the order the building chose. */
export function pickable(categories = []) {
  return [...categories]
    .filter(c => !c.archived)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
}

/**
 * A slug from a name — 'Fire safety' becomes 'fire-safety'.
 *
 * Generated once, when the category is created, and never again: the slug is
 * what events are filed under, so regenerating it on a rename would orphan
 * every event using it.
 */
export function slugify(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** A slug not already taken, so two "Meetings" cannot collide. */
export function uniqueSlug(name, categories = []) {
  const base = slugify(name) || 'category';
  const taken = new Set(categories.map(c => c.slug));
  if (!taken.has(base)) return base;

  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * Day marks keyed by date, for the grids to read as they draw.
 *
 * A Map because both grids ask "is there a mark on this square" once per cell —
 * 444 times for a year — and a linear search per cell is the kind of thing that
 * is fine until somebody marks every bank holiday for five years.
 */
export function marksByDate(marks = []) {
  return new Map((marks ?? []).filter(m => m?.date).map(m => [m.date, m]));
}

/**
 * How a marked day renders: the wash, and what to call it.
 *
 * Returns null for an unmarked day so a caller can test it as a condition
 * rather than checking a shape.
 */
export function markStyle(mark) {
  if (!mark) return null;
  return { ...swatch(mark.colour), label: mark.label ?? '' };
}
