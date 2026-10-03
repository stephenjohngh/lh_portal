// src/lib/server/aiModel.js
//
// The Claude model for Management's AI suggestions: what the admin chose
// (portal_settings.ai_model), checked against what Anthropic offers now (its
// Models API). No model is named in code — see $lib/utils/aiModels.js for why
// and for the rule when the chosen one has gone.

import Anthropic                 from '@anthropic-ai/sdk';
import { createClient }          from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }   from '$env/static/public';
import { env }                   from '$env/dynamic/private';
import { chooseModel, newestFirst } from '$lib/utils/aiModels.js';
import { getLogger }             from '$lib/utils/logger';

const logger = getLogger('aiModel');

let _db = null;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

const CACHE_MS = 60 * 60 * 1000;   // the list changes a few times a year
let cache = /** @type {{ at: number, models: any[] } | null} */ (null);

/**
 * The models Anthropic offers now, newest first: { id, display_name, created_at }.
 * Cached for an hour. Throws if it cannot be read.
 * @param {{ fresh?: boolean }} [opts]
 */
export async function listAvailableModels({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.models;
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in the deploy environment.');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const models = [];
  for await (const m of client.models.list({ limit: 100 })) {
    models.push({ id: m.id, display_name: m.display_name, created_at: m.created_at });
  }
  cache = { at: Date.now(), models: newestFirst(models) };
  return cache.models;
}

/** Forget the cached list — after Anthropic refused a model it listed. */
export function forgetAvailableModels() { cache = null; }

/** What the admin chose, or null. Throws if the setting cannot be read. */
export async function readSavedModel() {
  const { data, error } = await db()
    .from('portal_settings').select('value').eq('key', 'ai_model').maybeSingle();
  if (error) throw error;
  return typeof data?.value === 'string' && data.value ? data.value : null;
}

/**
 * The model to use now, and whether it is the one chosen.
 * ⚠ If the Models API cannot be read, the saved choice is used as it is — the
 * call itself will then say whether it still exists.
 * @returns {Promise<{ model: string|null, saved: string|null, substituted: boolean, reason: string|null }>}
 */
export async function resolveModel() {
  const saved = await readSavedModel();
  let available = [];
  try {
    available = await listAvailableModels();
  } catch (/** @type {any} */ err) {
    logger('⚠ could not read the Models API; using the saved model as it is:', err?.message);
  }
  return { saved, ...chooseModel(saved, available) };
}

/** Did the Messages API refuse this call because the model does not exist? */
export function isUnknownModelError(err) {
  return err?.status === 404 || err?.error?.error?.type === 'not_found_error';
}

/**
 * Make one Messages call with the model to use now. If Anthropic refuses the
 * model as unknown (retired since the list was cached), forget the list,
 * choose again and retry ONCE with the replacement.
 * @template T
 * @param {(model: string) => Promise<T>} call
 * @returns {Promise<{ result: T, model: string, saved: string|null, substituted: boolean, reason: string|null }>}
 */
export async function callWithModel(call) {
  let choice = await resolveModel();
  if (!choice.model) throw new Error('No AI model is available. Choose one in Admin → Other Config → Portal.');
  try {
    return { result: await call(choice.model), ...choice };
  } catch (/** @type {any} */ err) {
    if (!isUnknownModelError(err)) throw err;
    forgetAvailableModels();
    const retry = await resolveModel();
    if (!retry.model || retry.model === choice.model) throw err;
    logger('⚠ model refused as unknown; retrying with', retry.model);
    return {
      result: await call(retry.model), ...retry,
      substituted: true,
      reason: retry.reason ?? `${choice.model} was refused by Anthropic, so ${retry.model} was used instead.`,
    };
  }
}
