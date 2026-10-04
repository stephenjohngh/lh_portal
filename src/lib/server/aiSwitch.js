// src/lib/server/aiSwitch.js
//
// Whether an admin has switched the AI suggestions off (Admin → Other Config →
// Portal), for the routes that call Anthropic. $lib/utils/aiSwitch.js says why
// it is a setting; the one-minute cache is $lib/server/settingsCache.js.

import { cachedSetting } from '$lib/server/settingsCache.js';
import { AI_ENABLED_KEY, aiEnabledFrom } from '$lib/utils/aiSwitch.js';

let enabled = true;
const load = cachedSetting(AI_ENABLED_KEY, (value) => { enabled = aiEnabledFrom(value); });

/** True unless an admin has switched the AI suggestions off. */
export async function aiSwitchedOn() {
  await load();
  return enabled;
}
