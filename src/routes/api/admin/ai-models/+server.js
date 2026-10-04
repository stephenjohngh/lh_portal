// src/routes/api/admin/ai-models/+server.js
// GET /api/admin/ai-models — the Claude models Anthropic offers now (its Models
// API, read live), the model an admin has chosen, and the one actually in use.
// The Admin → Portal panel offers this list, so no model is named in code: a
// new model appears here the day Anthropic offers it, and a retired one stops
// being offered (§6ccc item 5, 2026-10-03).
//
// Admin only: it spends a call on the deploy's Anthropic key.

import { json }         from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/requireAuth.js';
import { listAvailableModels, readSavedModel } from '#lib/server/aiModel.js';
import { chooseModel }  from '#lib/utils/aiModels.js';
import { errMessage }   from '#lib/utils/errors.js';
import * as env from '$app/env/private';

export async function GET({ request, url }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  // Whether the deploy has an Anthropic key at all — a secret stays in the
  // environment, so the panel can only say whether one is there.
  const keyConfigured = !!env.ANTHROPIC_API_KEY;

  let saved;
  try { saved = await readSavedModel(); }
  catch (err) { return json({ error: `Could not read the saved choice: ${errMessage(err)}` }, { status: 500 }); }

  let models;
  try {
    models = await listAvailableModels({ fresh: url.searchParams.get('fresh') === '1' });
  } catch (err) {
    // Said, not hidden: without the list the panel cannot offer a choice, and
    // the suggestions fall back to using the saved model as it is.
    return json({ keyConfigured, saved, models: [], using: saved, error: `Could not read Anthropic's list of models: ${errMessage(err)}` });
  }

  const choice = chooseModel(saved, models);
  return json({ keyConfigured, saved, models, using: choice.model, substituted: choice.substituted, reason: choice.reason });
}
