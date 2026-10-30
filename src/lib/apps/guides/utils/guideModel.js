// src/lib/apps/guides/utils/guideModel.js
// The pure rules of a how-to guide — no database, no screen. Everything here is
// Type-1 tested (guideModel.test.js) BEFORE any UI exists (build plan S1).
//
// Three jobs:
//   1. what a guide or a step may contain (limits, kinds) and whether a draft can be
//      published — the same rules the database enforces in guide_publish(), so the
//      editor can say WHY before anything is pressed;
//   2. `matchGuides` — given the screen the walker is on, which guide links apply and
//      which step(s) to show, most specific first. This is the "right part at the right
//      place" rule (proposal §3) and it is written against WALK contexts from the start;
//   3. `diffVersions` — what changed between two published copies, for the editor.
//
// ⚠ The database copy (CHECKs, guide_publish) ENFORCES and cannot move; this copy
// PREDICTS. dbRulesParity.test.js holds the value lists together.

export const STEP_KINDS = ['step', 'caution', 'stop', 'good', 'bad'];
export const AUDIENCES = ['anyone', 'caretaker', 'cleaner'];
export const GUIDE_STATUSES = ['draft', 'published', 'retired'];

/** Words for the kinds, as an author and a reader see them. */
export const KIND_LABEL = {
  step: 'Step',
  caution: 'Caution',
  stop: 'Stop — call someone',
  good: 'What good looks like',
  bad: 'What bad looks like',
};

export const LIMITS = {
  photosPerStep: 4,
  titleChars: 80,
  bodyChars: 600,        // a step stays short; a second step is better than a longer one
  minutesMax: 600,
};

/** The places a link can name, in the order they are mentioned. */
export const LINK_TARGETS = [
  'obligation_id', 'component_type_id', 'type_attribute_id',
  'component_id', 'space_id', 'planner_series_id', 'workflow_key',
];

const present = (/** @type {any} */ v) => v !== null && v !== undefined && v !== '';

/**
 * Problems with one step (as the author typed it). Empty = fine.
 * @param {{ kind?: string, title?: string, body?: string|null, photos?: unknown[] }} step
 * @returns {string[]}
 */
export function stepProblems(step) {
  const out = [];
  const title = (step.title ?? '').trim();
  const body = (step.body ?? '').trim();
  if (!STEP_KINDS.includes(step.kind ?? 'step')) out.push('This kind of step is not one of the options.');
  if (!title) out.push('Give the step a title.');
  else if (title.length > LIMITS.titleChars) out.push(`Keep the title to ${LIMITS.titleChars} characters.`);
  if (body.length > LIMITS.bodyChars) out.push(`Keep the text to ${LIMITS.bodyChars} characters — split it into two steps.`);
  if (step.kind === 'stop' && !body) out.push('A "stop — call someone" step must say who to call and what to do instead.');
  if ((step.photos?.length ?? 0) > LIMITS.photosPerStep) out.push(`A step can have at most ${LIMITS.photosPerStep} photos.`);
  return out;
}

/**
 * Why a draft cannot be published yet — the editor's list, mirroring guide_publish().
 * @param {{ title?: string, status?: string, minutes?: number|null }} guide
 * @param {Array<{ kind?: string, title?: string, body?: string|null, photos?: unknown[] }>} steps
 * @returns {string[]}
 */
export function publishProblems(guide, steps) {
  const out = [];
  if (!(guide.title ?? '').trim()) out.push('Give the guide a title.');
  if (guide.status === 'retired') out.push('A retired guide cannot be published — make a new one.');
  if (present(guide.minutes) && (!Number.isInteger(guide.minutes) || /** @type {number} */ (guide.minutes) < 1 || /** @type {number} */ (guide.minutes) > LIMITS.minutesMax))
    out.push(`How long it takes must be 1 to ${LIMITS.minutesMax} minutes.`);
  if (steps.length === 0) out.push('A guide needs at least one step before it can be published.');
  steps.forEach((s, i) => stepProblems(s).forEach((p) => out.push(`Step ${i + 1}: ${p}`)));
  return out;
}

/**
 * Put steps in order and number them 1..n with no gaps (what the table's unique
 * (guide_id, position) expects after a reorder or a delete).
 * @template {{ position?: number }} T
 * @param {T[]} steps
 * @returns {Array<T & { position: number }>}
 */
export function renumber(steps) {
  return [...steps]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((s, i) => ({ ...s, position: i + 1 }));
}

/**
 * Move step `index` up (-1) or down (+1); returns a renumbered copy, or the same
 * order if it is already at the end.
 * @template {{ position?: number }} T
 * @param {T[]} steps
 * @param {number} index
 * @param {-1|1} by
 */
export function moveStep(steps, index, by) {
  const list = renumber(steps);
  const to = index + by;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  [list[index], list[to]] = [list[to], list[index]];
  return list.map((s, i) => ({ ...s, position: i + 1 }));
}

// ── Which guide applies on this screen ────────────────────────────────────────

/**
 * How many of a link's targets are set — its SPECIFICITY.
 * @param {Record<string, any>} link
 */
export function specificity(link) {
  return LINK_TARGETS.reduce((n, k) => n + (present(link[k]) ? 1 : 0), 0);
}

/**
 * Does one link apply to this context? A link applies when EVERY target it sets
 * equals the context's value for that target. A link that sets nothing never
 * applies (the table refuses it, but data is read defensively).
 *
 * Context keys are the same names as the link's: obligation_id, component_type_id,
 * type_attribute_id, component_id, space_id, planner_series_id, workflow_key.
 * @param {Record<string, any>} link
 * @param {Record<string, any>} context
 */
export function linkApplies(link, context) {
  let set = 0;
  for (const k of LINK_TARGETS) {
    if (!present(link[k])) continue;
    set++;
    if (!present(context[k]) || String(link[k]) !== String(context[k])) return false;
  }
  return set > 0;
}

/**
 * The guides to show for a screen, most specific first.
 *
 *   links    : guide_links rows (one per guide, or several per guide)
 *   context  : what the walker is looking at, e.g. { obligation_id, component_type_id,
 *              type_attribute_id, component_id }
 *   guideById: Map/obj of guideId → { id, title, … } for guides that are readable.
 *              A link to a guide not in it (retired, staff-only, deleted) is dropped —
 *              a missing guide is silence, never an error on the walker's screen.
 *
 * One guide matched by several links appears ONCE, at its most specific match, with
 * the UNION of the steps those links name (a link naming no steps means the whole guide).
 *
 * @param {Array<Record<string, any>>} links
 * @param {Record<string, any>} context
 * @param {Record<string, any> | Map<string, any>} guideById
 * @returns {Array<{ guideId: string, guide: any, specificity: number, stepIds: string[]|null, links: any[] }>}
 */
export function matchGuides(links, context, guideById) {
  const get = (/** @type {string} */ id) => (guideById instanceof Map ? guideById.get(id) : guideById[id]);
  /** @type {Map<string, { guideId: string, guide: any, specificity: number, stepIds: string[]|null, links: any[] }>} */
  const found = new Map();
  for (const link of links) {
    if (!linkApplies(link, context)) continue;
    const guide = get(link.guide_id);
    if (!guide) continue;
    const spec = specificity(link);
    const cur = found.get(link.guide_id);
    if (!cur) {
      found.set(link.guide_id, {
        guideId: link.guide_id, guide, specificity: spec,
        stepIds: link.step_ids && link.step_ids.length ? [...link.step_ids] : null,
        links: [link],
      });
    } else {
      cur.specificity = Math.max(cur.specificity, spec);
      cur.links.push(link);
      // whole guide wins over a part; two parts are united
      if (cur.stepIds === null || !(link.step_ids && link.step_ids.length)) cur.stepIds = null;
      else cur.stepIds = [...new Set([...cur.stepIds, ...link.step_ids])];
    }
  }
  return [...found.values()].sort((a, b) =>
    b.specificity - a.specificity || String(a.guide.title ?? '').localeCompare(String(b.guide.title ?? '')));
}

/**
 * The steps of a frozen version that a match shows, in guide order. `stepIds` null = all.
 * A step id the version no longer has is ignored (the guide was edited and republished).
 * @param {{ steps?: Array<{ id: string, position: number }> }} snapshot
 * @param {string[]|null} stepIds
 */
export function stepsFor(snapshot, stepIds) {
  const steps = [...(snapshot?.steps ?? [])].sort((a, b) => a.position - b.position);
  if (!stepIds) return steps;
  const want = new Set(stepIds);
  return steps.filter((s) => want.has(s.id));
}

/**
 * What changed between two frozen copies — for the editor's "since the last version".
 * @param {{ steps?: Array<{ id: string, title?: string, body?: string|null, kind?: string, photos?: unknown[] }>, title?: string }} before
 * @param {{ steps?: Array<{ id: string, title?: string, body?: string|null, kind?: string, photos?: unknown[] }>, title?: string }} after
 * @returns {{ added: string[], removed: string[], changed: string[], titleChanged: boolean }}
 */
export function diffVersions(before, after) {
  const a = new Map((before?.steps ?? []).map((s) => [s.id, s]));
  const b = new Map((after?.steps ?? []).map((s) => [s.id, s]));
  const added = [], removed = [], changed = [];
  for (const [id, s] of b) {
    const o = a.get(id);
    if (!o) added.push(s.title ?? id);
    else if ((o.title ?? '') !== (s.title ?? '') || (o.body ?? '') !== (s.body ?? '') || o.kind !== s.kind
      || (o.photos?.length ?? 0) !== (s.photos?.length ?? 0)) changed.push(s.title ?? id);
  }
  for (const [id, s] of a) if (!b.has(id)) removed.push(s.title ?? id);
  return { added, removed, changed, titleChanged: (before?.title ?? '') !== (after?.title ?? '') };
}

/**
 * Does a draft differ from what is published? The editor says "unpublished changes".
 * @param {{ updated_at?: string|null }} guide
 * @param {{ published_at?: string|null }|null|undefined} latestVersion
 */
export function hasUnpublishedChanges(guide, latestVersion) {
  if (!latestVersion?.published_at) return true;
  return !!guide.updated_at && new Date(guide.updated_at).getTime() > new Date(latestVersion.published_at).getTime() + 1000;
}

// ── The reader: one screen at a time ──────────────────────────────────────────

/**
 * The screens of a guide, in order: an intro (what it is, what you will need, how long),
 * one per step, then a closing screen. Pure, so the reader and its tests share it.
 * @param {{ steps?: Array<{ id: string, position?: number }> }|null|undefined} snapshot
 * @returns {Array<{ type: 'intro' } | { type: 'step', index: number, step: any } | { type: 'done' }>}
 */
export function readerScreens(snapshot) {
  const steps = [...(snapshot?.steps ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return [{ type: 'intro' }, ...steps.map((step, index) => ({ type: /** @type {const} */ ('step'), index, step })), { type: 'done' }];
}

/** Move within [0, count): never past either end. @param {number} at @param {number} by @param {number} count */
export const stepBy = (at, by, count) => Math.max(0, Math.min(count - 1, at + by));

/** Which way a horizontal swipe goes: +1 next, -1 back, 0 too small or mostly vertical. */
export function swipeDirection(dx, dy, min = 50) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
