// src/lib/utils/textScan/cameraHelp.js
//
// What to tell a person whose camera could not be opened (2026-10-10). Pure:
// takes the browser's error name and the user agent, returns the words.
//
// ⚠ The steps name the browsers' own menus as they are in late 2026. They
// change between releases, so each says what to look for as well as where.

/** @typedef {{ title: string, steps: string[], retry: boolean }} CameraHelp */

/**
 * Which phone and browser, as far as the user agent says.
 * iPadOS reports itself as a Mac, so a Mac with a touch screen is an iPad.
 * @param {string} ua @param {number} [touchPoints]
 * @returns {'ios-safari'|'ios-other'|'android-chrome'|'android-other'|'other'}
 */
export function cameraPlatform(ua, touchPoints = 0) {
  const s = String(ua ?? '');
  const ios = /iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && touchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS/.test(s) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(s)) return /Chrome\//.test(s) && !/EdgA|SamsungBrowser|Firefox/.test(s) ? 'android-chrome' : 'android-other';
  return 'other';
}

const ALLOW_STEPS = {
  'ios-safari': [
    'In Safari, tap the page settings button at the left of the address bar (it shows “aA”, or a small icon on newer iPhones).',
    'Tap Website Settings, then Camera, and choose Allow.',
    'If Camera is not there or is greyed out: open the iPhone’s Settings app → Apps → Safari → Camera, and choose Ask or Allow.',
    'Come back here and tap Try again.',
  ],
  'ios-other': [
    'Open the iPhone’s Settings app → Apps → find this browser (for example Chrome) → turn Camera on.',
    'Come back here and tap Try again. If it still refuses, close this tab and open the page again.',
  ],
  'android-chrome': [
    'In Chrome, tap the icon at the left of the address bar (it looks like two sliders or a padlock).',
    'Tap Permissions (or Site settings), then Camera, and choose Allow.',
    'If Camera is blocked for Chrome itself: open the phone’s Settings → Apps → Chrome → Permissions → Camera → Allow.',
    'Come back here and tap Try again.',
  ],
  'android-other': [
    'Tap the icon at the left of the address bar and look for Permissions or Site settings → Camera → Allow.',
    'If it is blocked for the browser itself: open the phone’s Settings → Apps → this browser → Permissions → Camera → Allow.',
    'Come back here and tap Try again.',
  ],
  other: [
    'Click the icon at the left of the address bar, find Camera for this site and choose Allow.',
    'Then click Try again.',
  ],
};

/**
 * @param {string|undefined} errorName  the DOMException name from getUserMedia
 * @param {string} ua @param {number} [touchPoints]
 * @returns {CameraHelp}
 */
export function cameraHelp(errorName, ua, touchPoints = 0) {
  if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
    return { title: 'The camera is not allowed for this site.', steps: ALLOW_STEPS[cameraPlatform(ua, touchPoints)], retry: true };
  }
  if (errorName === 'PolicyBlocked') {
    return { title: 'The portal has the live camera switched off.', steps: ['This is a setting of the portal, not of your phone — changing the phone’s settings will not help. Please tell whoever looks after the portal.'], retry: false };
  }
  if (errorName === 'InsecureContext') {
    return { title: 'The camera only works on the portal’s secure (https) address.', steps: ['Open the portal at its usual https:// address, not a local or http:// one.'], retry: false };
  }
  if (errorName === 'NotReadableError' || errorName === 'AbortError') {
    return { title: 'The camera is in use by something else.', steps: ['Close any other app or tab using the camera, then tap Try again.'], retry: true };
  }
  if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') {
    return { title: 'No camera was found on this device.', steps: [], retry: false };
  }
  return { title: 'The camera could not be opened.', steps: [], retry: true };
}
