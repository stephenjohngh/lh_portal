// src/lib/apps/guides/public.js
//
// PUBLIC INTERFACE of the Guides app — what other apps may read from it.
// Other apps import from HERE and nowhere else inside `guides/`
// (guidesBoundaryGuard.test.js). The data flows one way: an app asks Guides what
// applies to the screen it is showing; Guides never reads another app back. A link
// names another app's record by id — a pointer, no foreign key.
//
// Nothing here writes. Nothing here throws on a missing guide: a guide that is not
// readable (retired, staff-only to a contractor, deleted) is silence on the walker's
// screen. A failed READ is different and is allowed to reject, so the caller can say
// "guides are not available" instead of showing nothing and implying there is none.

import { api } from '#lib/utils/api.js';
import { LINK_TARGETS, matchGuides, stepsFor } from './utils/guideModel.js';
import { saveBundle, loadBundle, cachePhotos, cachedPhotoUrl } from './utils/guideOffline.js';

/**
 * @typedef {{ guideId: string, title: string, version: number, specificity: number,
 *   summary: string|null, youNeed: string|null, minutes: number|null,
 *   steps: Array<{ id: string, position: number, kind: string, title: string,
 *                  body: string|null, photos: Array<{ id: string, url: string, filename: string|null }> }> }} WalkGuide
 * @typedef {{ links: any[], guides: any[], versions: any[] }} Bundle  everything needed to decide, with no further reads
 */

const present = (/** @type {any} */ v) => v !== null && v !== undefined && v !== '';

/**
 * Read the links naming ANY of the given values, and the published guides and frozen
 * versions behind them: a BUNDLE from which any context inside those values can be
 * resolved without another read — which is what makes a walk work with no signal.
 * @param {Partial<Record<string, string[]>>} values  link target -> the ids to look for
 * @returns {Promise<Bundle>}
 */
async function fetchBundle(values) {
  const keys = LINK_TARGETS.filter((k) => (values[k] ?? []).filter(present).length);
  if (keys.length === 0) return { links: [], guides: [], versions: [] };
  const batches = await Promise.all(keys.map((k) =>
    api.getAllIn('guide_links', k, /** @type {string[]} */ (values[k]).filter(present), { orderBy: 'created_at', tiebreak: false })));
  const links = [...new Map(batches.flat().map((l) => [l.id, l])).values()];
  if (links.length === 0) return { links: [], guides: [], versions: [] };

  const guides = (await api.getAllIn('guides', 'id', [...new Set(links.map((l) => l.guide_id))]))
    .filter((g) => g.status === 'published' && g.version >= 1);
  const versions = guides.length ? await api.getAllIn('guide_versions', 'guide_id', guides.map((g) => g.id)) : [];
  return { links, guides, versions };
}

/**
 * Decide which guides of a bundle apply to a context, and shape them for the screen.
 * @param {Bundle} bundle @param {Record<string, string|null|undefined>} context
 * @param {{ requireTarget?: string|null }} [opts]
 * @returns {WalkGuide[]}
 */
export function resolveGuides(bundle, context, { requireTarget = null } = {}) {
  // `requireTarget`: only guides with a link that NAMES that target (a check-level bar must not
  // repeat the walk-level guides, which match the same context).
  const links = requireTarget ? bundle.links.filter((l) => present(l[requireTarget])) : bundle.links;
  if (!links.length) return [];
  const byId = Object.fromEntries(bundle.guides.map((g) => [g.id, g]));
  const matches = matchGuides(links, context, byId);
  const latest = new Map(bundle.versions.map((v) => [`${v.guide_id}:${v.version}`, v]));

  /** @type {WalkGuide[]} */
  const out = [];
  for (const m of matches) {
    const v = latest.get(`${m.guideId}:${m.guide.version}`);
    if (!v) continue;                                   // no frozen copy to show: silence, not an error
    const steps = stepsFor(v.snapshot, m.stepIds);
    if (steps.length === 0) continue;
    out.push({
      guideId: m.guideId, title: m.guide.title, version: m.guide.version, specificity: m.specificity,
      summary: m.guide.summary ?? null, youNeed: v.snapshot?.you_need ?? null, minutes: v.snapshot?.minutes ?? null,
      steps: steps.map((s) => ({
        id: s.id, position: s.position, kind: s.kind, title: s.title, body: s.body ?? null,
        photos: (s.photos ?? []).map((p) => ({ id: p.id, url: p.url, filename: p.filename ?? null })),
      })),
    });
  }
  return out;
}

/**
 * The guides that apply to a screen, most specific first, each with the steps to show
 * from its latest PUBLISHED version.
 *
 * `context` keys are the link targets: obligation_id, component_type_id,
 * type_attribute_id, component_id, space_id, planner_series_id, workflow_key. Give
 * every value you know; a guide linked to several of them applies only where all match.
 *
 * @param {Record<string, string|null|undefined>} context
 * @returns {Promise<WalkGuide[]>}
 */
export async function guidesFor(context) {
  /** @type {Record<string, string[]>} */
  const values = {};
  for (const k of LINK_TARGETS) if (present(context[k])) values[k] = [/** @type {string} */ (context[k])];
  return resolveGuides(await fetchBundle(values), context);
}

const walkKey = (/** @type {string|null|undefined} */ obligationId) => `walk:${obligationId || 'none'}`;

/**
 * The same as guidesFor, for the inspection walk: with a signal it reads live; with none
 * (or a failed read) it answers from the copy `prepareGuidesForWalk` saved, and says so.
 * Photos come from the device's guide-photo cache when they are there.
 * Rejects only when there is neither a live read nor a saved copy — so the screen can say
 * "guides are not available" rather than imply there are none.
 *
 * @param {Record<string, string|null|undefined>} context
 * @param {{ requireTarget?: string|null }} [opts]
 * @returns {Promise<{ guides: WalkGuide[], fromCache: boolean }>}
 */
export async function guidesForWalk(context, { requireTarget = null } = {}) {
  // A check-level bar is asked for once per check on a screen: answer from the copy "get ready"
  // saved (no read per check), and only go live when there is none.
  if (requireTarget) {
    const saved = await loadBundle(walkKey(context.obligation_id));
    if (saved) return { guides: await withLocalPhotos(resolveGuides(saved, context, { requireTarget })), fromCache: false };
  }
  try {
    /** @type {Record<string, string[]>} */
    const values = {};
    for (const k of LINK_TARGETS) if (present(context[k])) values[k] = [/** @type {string} */ (context[k])];
    return { guides: resolveGuides(await fetchBundle(values), context, { requireTarget }), fromCache: false };
  } catch (liveError) {
    const saved = await loadBundle(walkKey(context.obligation_id));
    if (!saved) throw liveError;
    return { guides: await withLocalPhotos(resolveGuides(saved, context, { requireTarget })), fromCache: true };
  }
}

/** Point each photo at the copy held on the device, where there is one. @param {WalkGuide[]} guides */
async function withLocalPhotos(guides) {
  for (const g of guides) for (const st of g.steps) for (const p of st.photos) {
    const local = await cachedPhotoUrl(p.url);
    if (local) p.url = local;
  }
  return guides;
}

/**
 * "Get this walk ready": with a signal, read every guide that could apply anywhere in the
 * walk (its obligation, the types of its components, its components) and keep them — and
 * their photos — on the device for a walk with no signal. Safe to repeat.
 *
 * @param {{ obligationId?: string|null, typeIds?: string[], attributeIds?: string[], componentIds?: string[] }} walk
 * @returns {Promise<{ guides: number, photos: number, photosMissed: number }>}
 */
export async function prepareGuidesForWalk({ obligationId = null, typeIds = [], attributeIds = [], componentIds = [] }) {
  const bundle = await fetchBundle({
    obligation_id: obligationId ? [obligationId] : [],
    component_type_id: [...new Set(typeIds.filter(present))],
    type_attribute_id: [...new Set(attributeIds.filter(present))],
    component_id: [...new Set(componentIds.filter(present))],
  });
  await saveBundle(walkKey(obligationId), bundle);
  const urls = [...new Set(bundle.versions.flatMap((v) => (v.snapshot?.steps ?? []).flatMap((/** @type {any} */ s) => (s.photos ?? []).map((/** @type {any} */ p) => p.url))))];
  const { saved, missed } = await cachePhotos(urls);
  return { guides: bundle.guides.length, photos: saved, photosMissed: missed };
}
