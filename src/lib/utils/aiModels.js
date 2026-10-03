// src/lib/utils/aiModels.js
//
// Which Claude model Management's AI suggestions use — ⛔ WITH NO MODEL NAMED
// IN CODE. The portal is deployed and run, not edited: an admin chooses from
// the models Anthropic offers TODAY (its Models API, read live), and the choice
// is stored in portal_settings.ai_model (user, 2026-10-03: "its supposed to be
// an app we can deploy. not one that needs to have code changes").
//
// A list written here went stale the way every list of models does: on
// 2026-09-30 Anthropic deprecated Sonnet 4.5, which the portal still offered,
// and every suggestion would have failed from its retirement until someone
// edited a file. Now:
//   · a chosen model that Anthropic no longer offers is replaced by the newest
//     model of the SAME family (a retired Sonnet → the newest Sonnet), keeping
//     the admin's intent; the substitution is audited and shown in Admin;
//   · nothing chosen yet → the newest Haiku, the fastest and cheapest family.
//
// Pure: imports nothing, so the browser and the server share it.

/** The family a model belongs to: claude-sonnet-5-5 is a sonnet. */
export function modelFamily(id) {
  return String(id ?? '').match(/^claude-([a-z]+)-/)?.[1] ?? null;
}

/** The family used when nothing has been chosen: the fastest and cheapest. */
export const FALLBACK_FAMILY = 'haiku';

/**
 * Newest first, by release date then id.
 * @param {Array<{ id: string, created_at?: string }>} models
 */
export function newestFirst(models) {
  return [...(models ?? [])].sort((a, b) =>
    String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) || b.id.localeCompare(a.id));
}

/**
 * The model to use, given what is saved and what Anthropic offers now.
 * @param {string|null|undefined} saved  portal_settings.ai_model
 * @param {Array<{ id: string, created_at?: string }>} available  the Models API list
 * @returns {{ model: string|null, substituted: boolean, reason: string|null }}
 *   `model` is null only when there is nothing at all to use.
 */
export function chooseModel(saved, available) {
  const list = newestFirst(available);
  if (saved && list.some((m) => m.id === saved)) return { model: saved, substituted: false, reason: null };

  const family = modelFamily(saved) ?? FALLBACK_FAMILY;
  const sameFamily = list.find((m) => modelFamily(m.id) === family);
  const pick = sameFamily ?? list.find((m) => modelFamily(m.id) === FALLBACK_FAMILY) ?? list[0] ?? null;
  if (!pick) return { model: saved || null, substituted: false, reason: saved ? null : 'No models are available.' };

  if (!saved) return { model: pick.id, substituted: false, reason: null };
  return {
    model: pick.id,
    substituted: true,
    reason: `${saved} is no longer offered by Anthropic, so ${pick.id} is being used instead.`,
  };
}
