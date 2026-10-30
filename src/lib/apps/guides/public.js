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

/**
 * The guides that apply to a screen, most specific first, each with the steps to show
 * from its latest PUBLISHED version.
 *
 * `context` keys are the link targets: obligation_id, component_type_id,
 * type_attribute_id, component_id, space_id, planner_series_id, workflow_key. Give
 * every value you know; a guide linked to several of them applies only where all match.
 *
 * @param {Record<string, string|null|undefined>} context
 * @returns {Promise<Array<{ guideId: string, title: string, version: number, specificity: number,
 *                           summary: string|null, youNeed: string|null, minutes: number|null,
 *                           steps: Array<{ id: string, position: number, kind: string, title: string,
 *                                          body: string|null, photos: Array<{ id: string, url: string, filename: string|null }> }> }>>}
 */
export async function guidesFor(context) {
  const known = LINK_TARGETS.filter((k) => context[k] !== null && context[k] !== undefined && context[k] !== '');
  if (known.length === 0) return [];

  // Every link that names ANY of the context's values, then narrowed by the matcher.
  const batches = await Promise.all(known.map((k) =>
    api.getAllIn('guide_links', k, [/** @type {string} */ (context[k])], { orderBy: 'created_at', tiebreak: false })));
  const links = [...new Map(batches.flat().map((l) => [l.id, l])).values()];
  if (links.length === 0) return [];

  const guideIds = [...new Set(links.map((l) => l.guide_id))];
  const guides = await api.getAllIn('guides', 'id', guideIds);
  const published = guides.filter((g) => g.status === 'published' && g.version >= 1);
  const byId = Object.fromEntries(published.map((g) => [g.id, g]));

  const matches = matchGuides(links, context, byId);
  if (matches.length === 0) return [];

  const versions = await api.getAllIn('guide_versions', 'guide_id', matches.map((m) => m.guideId));
  const latest = new Map(versions.map((v) => [`${v.guide_id}:${v.version}`, v]));

  /** @type {any[]} */
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
