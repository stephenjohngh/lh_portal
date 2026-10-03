// src/lib/utils/aiModels.js
//
// The Claude models an admin may choose for Management's AI suggestions
// (Admin → Other Config → Portal, stored in portal_settings.ai_model). ONE
// list: it used to be written three times — the Admin panel and both AI
// routes — and a model added to one copy only would have been offered on
// screen and silently replaced by the default in the route (2026-10-03,
// §6ccc item 5). Imports nothing, so the browser and the server share it.
//
// Ordered cheapest → most expensive.

export const AI_MODELS = Object.freeze([
  {
    value: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    tagline: 'Fast and inexpensive',
    description: 'Default. Fits short property-management comments well. ~$0.0006 per suggestion after the prompt cache warms.',
  },
  {
    value: 'claude-sonnet-4-5',
    label: 'Sonnet 4.5',
    tagline: 'Balanced quality and cost',
    description: 'Better at nuance and ambiguous comments. Roughly 10× more expensive than Haiku per call.',
  },
  {
    value: 'claude-opus-4-5',
    label: 'Opus 4.5',
    tagline: 'Highest quality, most expensive',
    description: 'Strongest reasoning. Slowest and most expensive — usually overkill for one-line action suggestions.',
  },
]);

export const DEFAULT_AI_MODEL = 'claude-haiku-4-5';

/**
 * The model to use for a stored value: the value itself when it is on the
 * list, otherwise the default — so a typo or a stale row cannot break a route.
 * @param {unknown} value
 * @returns {string}
 */
export function resolveAiModel(value) {
  return AI_MODELS.some((m) => m.value === value) ? /** @type {string} */ (value) : DEFAULT_AI_MODEL;
}
