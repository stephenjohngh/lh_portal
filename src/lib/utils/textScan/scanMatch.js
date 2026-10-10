// src/lib/utils/textScan/scanMatch.js
//
// Turning what the camera read into what the person meant (2026-10-10). Pure:
// no browser, no reader — TextScanner.svelte feeds it the reader's text.
//
// ⭐ The reader is never asked to be right on its own. A number plate read in a
// basement is often one character off (O for 0, I for 1, 8 for B), so the read
// is matched against the values the screen already knows — the car park's and
// the road permits' registrations, or the door numbers on a floor — allowing
// for the letters a reader confuses. Picking one of a known few is far more
// reliable than reading cold. What was read is always offered too, so a value
// that is on no list can still be used, or corrected by hand.

/**
 * What can be read. A profile limits the characters the reader may return
 * (fewer choices, fewer mistakes) and the length of a sensible answer.
 * @typedef {{ label: string, charset: string, minLength: number, maxLength: number, aspect: number, edgeMarks?: string[] }} ScanProfile
 * `aspect` is the camera guide box's shape, wide to 1 high. `edgeMarks` are
 * letters printed beside the value that are not part of it (a plate's GB band).
 */

/** @type {Record<string, ScanProfile>} */
export const SCAN_PROFILES = {
  // A UK registration: letters and digits, up to 7, spaces ignored.
  registration: { label: 'Number plate', charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', minLength: 2, maxLength: 8, aspect: 4.2, edgeMarks: ['GB', 'UK', 'NI', 'CYM', 'ENG', 'SCO'] },
  // A number painted or fixed on something — a door, a riser, a meter. Digits
  // and letters, plus the separators such numbers use (G.04, 3/12, B-2).
  number:       { label: 'Number', charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-', minLength: 1, maxLength: 10, aspect: 2 },
};

/** @param {string|ScanProfile} p */
export function scanProfile(p) {
  const prof = typeof p === 'string' ? SCAN_PROFILES[p] : p;
  if (!prof) throw new Error(`Unknown scan profile: ${p}`);
  return prof;
}

/**
 * A value as the matcher compares it: upper case, only the profile's
 * characters, no spaces.
 * @param {string} s @param {string|ScanProfile} profile
 */
export function normaliseScan(s, profile) {
  const { charset } = scanProfile(profile);
  let out = '';
  for (const ch of String(s ?? '').toUpperCase()) if (charset.includes(ch)) out += ch;
  return out;
}

/**
 * The plausible readings in the reader's text: each line with its spaces
 * removed, the line without its first or last word (the "GB" band on a plate,
 * a mark on the frame beside a door number), and each word on its own —
 * whichever fit the profile's lengths.
 * @param {string} text @param {string|ScanProfile} profile
 * @returns {string[]} longest first, no repeats
 */
export function readingsFrom(text, profile) {
  const prof = scanProfile(profile);
  const found = new Set();
  const add = (/** @type {string} */ raw) => {
    const v = normaliseScan(raw, prof);
    if (v.length >= prof.minLength && v.length <= prof.maxLength) found.add(v);
  };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const words = line.split(/\s+/).filter((w) => normaliseScan(w, prof));
    add(words.join(''));
    // A national band read straight into the plate ("GBAB12 CDE").
    const whole = normaliseScan(words.join(''), prof);
    for (const mark of prof.edgeMarks ?? []) if (whole.startsWith(mark)) add(whole.slice(mark.length));
    if (words.length > 2) { add(words.slice(1).join('')); add(words.slice(0, -1).join('')); }
    for (const w of words) add(w);
  }
  return [...found].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

// Characters a reader mistakes for one another on plates and signs. A swap
// within a group costs a fraction of a real difference.
const CONFUSABLE_GROUPS = ['0ODQU', '1ILJT', '2Z', '5S', '6G', '8B', '4A', 'UV', 'MN', 'HN', 'CG', 'EF', 'PR', 'KX'];
const CONFUSABLE = new Map();
for (const g of CONFUSABLE_GROUPS) for (const a of g) for (const b of g) if (a !== b) CONFUSABLE.set(a + b, true);

/** Cost of reading `a` where `b` is. */
function subCost(a, b) {
  if (a === b) return 0;
  return CONFUSABLE.has(a + b) ? 0.3 : 1;
}

/**
 * How far `target` is from the best stretch of `read`, allowing for confused
 * letters. Characters before and after the stretch are free — a plate read
 * with "GB" or a door read with the frame's edge beside it still matches.
 * @param {string} read @param {string} target
 */
export function scanDistance(read, target) {
  const n = read.length, m = target.length;
  if (!m) return n ? Infinity : 0;
  // prev[j]: best cost to align target[0..j) ending at the current read index.
  let prev = new Array(m + 1);
  prev[0] = 0;
  for (let j = 1; j <= m; j++) prev[j] = j;            // target letters with nothing read
  let best = prev[m];
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = 0;                                         // skipping read chars at the start is free
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(
        prev[j - 1] + subCost(read[i - 1], target[j - 1]),
        prev[j] + 1,                                    // an extra character read inside
        cur[j - 1] + 1,                                 // a character missed
      );
    }
    best = Math.min(best, cur[m]);                      // skipping read chars at the end is free
    prev = cur;
  }
  return best;
}

/** What each character read beyond a value's length costs it. */
const EXTRA_CHAR_COST = 0.35;

/** The most a candidate may differ and still be offered, for its length. */
export function allowedDistance(length) {
  if (length <= 3) return 0.31;   // short: only confused letters, never a different one
  if (length <= 5) return 1;
  return 1.6;
}

/**
 * The known values that what was read could be, best first.
 * @template {{ value: string }} C
 * @param {string} text           the reader's raw text
 * @param {C[]} candidates        known values; `value` is compared, the rest is passed through
 * @param {string|ScanProfile} profile
 * @param {{ limit?: number }} [opts]
 * @returns {Array<C & { distance: number, exact: boolean }>}
 */
export function matchScan(text, candidates, profile, { limit = 5 } = {}) {
  const prof = scanProfile(profile);
  const readings = readingsFrom(text, prof);
  if (!readings.length) return [];
  // Whole lines too, however long: the alignment finds a value inside one.
  const texts = [...readings];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const v = normaliseScan(line, prof);
    if (v && v.length <= 24 && !texts.includes(v)) texts.push(v);
  }
  /** @type {Map<string, C & { distance: number, exact: boolean }>} */
  const best = new Map();
  for (const c of candidates) {
    const key = normaliseScan(c.value, prof);
    if (!key) continue;
    let d = Infinity;
    // Text read beside the value is free to skip, but not free to IGNORE: a
    // door "2" must not match a door read as "12". Each extra character costs.
    for (const r of texts) d = Math.min(d, scanDistance(r, key) + EXTRA_CHAR_COST * Math.max(0, r.length - key.length));
    if (d > allowedDistance(key.length)) continue;
    const prior = best.get(key);
    if (!prior || d < prior.distance) best.set(key, { ...c, distance: d, exact: readings.includes(key) });
  }
  return [...best.values()]
    .sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value))
    .slice(0, limit);
}
