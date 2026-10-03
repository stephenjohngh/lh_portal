// src/lib/server/aiModel.js
//
// The Claude model an admin chose for Management's AI suggestions, read on
// every call so a change takes effect at once. Both AI routes used to carry
// their own copy of this reader and of the model list (§6ccc item 5); the list
// is $lib/utils/aiModels.js, shared with the Admin panel.

import { createClient }        from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }                 from '$env/dynamic/private';
import { DEFAULT_AI_MODEL, resolveAiModel } from '$lib/utils/aiModels.js';
import { getLogger }           from '$lib/utils/logger';

const logger = getLogger('aiModel');

let _db = null;
const db = () => (_db ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? ''));

/**
 * The configured model, or the default when there is no setting, it is not on
 * the list, or it cannot be read. Falling back is right here: a suggestion from
 * the default model is still a correct suggestion, and the reason is logged.
 * @returns {Promise<string>}
 */
export async function getConfiguredModel() {
  try {
    const { data, error } = await db()
      .from('portal_settings').select('value').eq('key', 'ai_model').maybeSingle();
    if (error) throw error;
    return resolveAiModel(data?.value);
  } catch (/** @type {any} */ err) {
    logger('⚠ could not read the ai_model setting; using the default:', err?.message);
    return DEFAULT_AI_MODEL;
  }
}
