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
// Plain green IS allowed, and is not the same argument. The accent is a muted
// blue-green (#3c9683, #6db0a2 at 400); `green-400` is #4ade80 — far more
// saturated and a good deal yellower, and on a navy cell the two do not read as
// the same thing. `emerald-400` (#34d399) is very nearly the accent itself,
// which is why it stays out.
//
// The rest is that these have to be told apart as a dot eight pixels across, on
// a dark ground, by somebody scanning a year — hence one red, one orange, one
// amber, one blue, one violet, one magenta, one pink, and a yellow-green beside
// a true green.
//
// ── And nothing that sinks into the ground ──────────────────────────────────
// A cell is dark navy (slate-800 over slate-900, and a blue-tinted variant at
// weekends), so a dot in the same family disappears into it. Indigo and mid
// grey both did, which two of the seeded categories were using — the dot was
// technically drawn and practically invisible. Both are retired below: indigo
// became violet, which is brighter and further round the wheel, and grey
// stopped being a choice at all.

// `ink` is the same colour as an actual hex, for PRINT. Paper has no Tailwind,
// and a class is no use to a stylesheet that has to fill a circle — so this is
// the one place a literal colour belongs. They are the 600 shades rather than
// the screen's 400s: the light ones vanish on white.
//
// `wash` is the same colour again at the strength a whole cell can carry.
// A dot at full strength is a mark; a cell at full strength is a shout, and
// the date printed on it stops being readable.
export const PALETTE = [
  { key: 'red',     label: 'Red',     ink: '#dc2626', dot: 'bg-red-500',     chip: 'bg-red-500/15 text-red-300 border-red-500/30',         wash: 'bg-red-500/25' },
  { key: 'orange',  label: 'Orange',  ink: '#ea580c', dot: 'bg-orange-400',  chip: 'bg-orange-500/15 text-orange-300 border-orange-500/30', wash: 'bg-orange-500/25' },
  { key: 'amber',   label: 'Amber',   ink: '#d97706', dot: 'bg-amber-500',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',   wash: 'bg-amber-500/25' },
  { key: 'lime',    label: 'Lime',    ink: '#65a30d', dot: 'bg-lime-400',    chip: 'bg-lime-500/15 text-lime-300 border-lime-500/30',      wash: 'bg-lime-500/25' },
  // The one neighbour the palette allows, because a bright green is worth
  // having: lime is yellow-green (#a3e635), green is pure (#4ade80), and side
  // by side at eight pixels that difference holds. It is the only pair here
  // that has to be looked at rather than merely glanced at.
  { key: 'green',   label: 'Green',   ink: '#16a34a', dot: 'bg-green-400',   chip: 'bg-green-500/15 text-green-300 border-green-500/30',   wash: 'bg-green-500/25' },
  { key: 'sky',     label: 'Sky',     ink: '#0284c7', dot: 'bg-sky-400',     chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',         wash: 'bg-sky-500/25' },
  { key: 'violet',  label: 'Violet',  ink: '#7c3aed', dot: 'bg-violet-400',  chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30', wash: 'bg-violet-500/25' },
  { key: 'fuchsia', label: 'Fuchsia', ink: '#c026d3', dot: 'bg-fuchsia-400', chip: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', wash: 'bg-fuchsia-500/25' },
  { key: 'rose',    label: 'Rose',    ink: '#e11d48', dot: 'bg-rose-400',    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',      wash: 'bg-rose-500/25' },
];

/**
 * Where a category with no usable colour lands. NOT in the palette, so it can
 * never be chosen — it is what "uncategorised" and "a colour we no longer
 * offer" look like.
 *
 * Light rather than mid grey: its whole job is to be visible on a dark cell,
 * which is the failure the retired grey had.
 */
export const FALLBACK = {
  key: 'none', label: 'Grey',
  ink: '#64748b',
  dot: 'bg-slate-300',
  chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  wash: 'bg-slate-400/25',
};

/**
 * Colours that used to be offered, and what replaced them.
 *
 * Kept because categories in the database still store the old key, and the
 * migration that repaints them is applied on somebody else's schedule — the
 * chart has to be right before that happens, not after. A key that maps to
 * nothing falls through to FALLBACK.
 */
const RETIRED = { indigo: 'violet', slate: null };

const BY_KEY = new Map(PALETTE.map(c => [c.key, c]));

/** A swatch, or the neutral — never undefined at a render site. */
export function swatch(key) {
  const resolved = key in RETIRED ? RETIRED[key] : key;
  return BY_KEY.get(resolved) ?? FALLBACK;
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
    return { slug: null, name: 'Uncategorised', ...FALLBACK };
  }
  return { slug, name: slug, missing: true, ...FALLBACK };
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
