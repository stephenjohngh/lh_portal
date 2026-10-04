// src/lib/server/wording.js
//
// The wording an admin set (Admin → Other Config → Wording), for documents and
// pages built on the server: the MOR letters, the Dossier confidentiality
// notice. See #lib/utils/wording.js; the cache is #lib/server/settingsCache.js.

import { cachedSetting } from '#lib/server/settingsCache.js';
import { WORDING_KEY, setWording, wording, wordingText } from '#lib/utils/wording.js';

/** Make sure the wording in force is no more than a minute old. */
export const loadServerWording = cachedSetting(WORDING_KEY, setWording);

/** An entry's text in force, tokens filled. @param {string} key @param {Record<string, string|null|undefined>} [vars] */
export async function serverWording(key, vars) {
  await loadServerWording();
  return wording(key, vars);
}

/** An entry's text in force, tokens unfilled. @param {string} key */
export async function serverWordingText(key) {
  await loadServerWording();
  return wordingText(key);
}
