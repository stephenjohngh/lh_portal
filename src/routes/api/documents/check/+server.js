// POST /api/documents/check — does each listed document still stand for
// something? (Admin → Document Demo → Check files, 2026-09-27.)
//
// Body: { ids: string[] } — the documents on screen, at most 200.
// Returns { results: { [id]: { owner, file, fileDetail? } }, checkedAt }.
//
// Admin only, like deleting a library document: it reads every app's records
// with the service role. ⛔ It changes nothing; see $lib/server/documentCheck.js.
import { json }               from '@sveltejs/kit';
import { checkDocumentsById } from '$lib/server/documentLibrary';
import { requireAdmin }       from '$lib/server/requireAuth';

const MAX_IDS = 200;   // the most Document Demo lists at once

export async function POST({ request }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Expected a JSON body.' }, { status: 400 }); }

  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter((x) => typeof x === 'string' && x))] : [];
  if (ids.length > MAX_IDS) {
    return json({ error: `Check at most ${MAX_IDS} documents at a time.` }, { status: 400 });
  }

  try {
    const results = await checkDocumentsById(ids);
    return json({ results, checkedAt: new Date().toISOString() });
  } catch (/** @type {any} */ err) {
    return json({ error: `The check could not finish: ${err?.message ?? err}` }, { status: 500 });
  }
}
