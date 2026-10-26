// src/lib/utils/textScan/ukPlate.js
// Put a misread number plate right by the shape UK plates come in (user,
// 2026-10-13): a reader cannot tell I from 1 or O from 0 by the letter alone,
// but a plate's format says which a position holds. "OE2I XXD" is the current
// format — two letters, two digits, three letters — so the I in a digit slot is
// a 1. Pure; imports nothing.
//
// The four formats (L a letter, D a digit; spaces are ignored):
//   current   2001–   LL DD LLL        BD51 SMR
//   prefix    1983–2001  L D{1,3} LLL  A123 ABC
//   suffix    1963–1983  LLL D{1,3} L  ABC 123A
//   N Ireland           L{1,3} D{1,4}  AIL 1234
// A reading that fits none (a private plate, a foreign one) is left as read.

/** A digit a reader gives where the letter is meant, and the letter. */
const TO_LETTER = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 8: 'B' };
/** A letter a reader gives where the digit is meant, and the digit. */
const TO_DIGIT = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', J: '1', T: '1', Z: '2', A: '4', S: '5', G: '6', B: '8' };

/** Letters with no single digit they stand for: tried in this order, the age
 *  identifier (below) choosing among them — E read where a 6 is, usually. */
const TO_DIGIT_ALT = { E: '683', F: '7', H: '4', K: '4', N: '1', P: '9' };

/** A current-format age identifier: 02–25 and 51–75 to 2025, 26 and 76 since March 2026. */
const validAge = (d) => { const n = Number(d); return (n >= 2 && n <= 26) || (n >= 51 && n <= 76); };

/** For an age identifier that cannot be real (an 8 or 9 in the tens, say: VK85
 *  where the plate says VK65), the digits a reader mixes up with each digit, most
 *  likely first. Only used when the reading as it stands is impossible. */
const DIGIT_LOOKALIKES = { 0: '86', 1: '7', 2: '7', 3: '85', 4: '1', 5: '63', 6: '85', 7: '12', 8: '6035', 9: '80' };

/**
 * An impossible age identifier put right: the valid one needing fewest
 * lookalike swaps (ties: the likelier swap), or null when none is within two.
 * @param {string} d  two digits
 */
function fixAge(d) {
  let best = null;
  for (const a of d[0] + (DIGIT_LOOKALIKES[d[0]] ?? '')) for (const b of d[1] + (DIGIT_LOOKALIKES[d[1]] ?? '')) {
    if (!validAge(a + b)) continue;
    const swaps = (a !== d[0] ? 1 : 0) + (b !== d[1] ? 1 : 0);
    if (!best || swaps < best.swaps) best = { digits: a + b, swaps };
  }
  return best;
}

const isLetter = (c) => c >= 'A' && c <= 'Z';
const isDigit = (c) => c >= '0' && c <= '9';

/** Each format as letter/digit patterns for one length, in the order preferred on a tie. */
function patternsFor(n) {
  const out = [];
  const D = (k) => 'D'.repeat(k);
  if (n === 7) out.push({ format: 'current', pattern: 'LLDDLLL' });
  for (let k = 1; k <= 3; k++) if (k + 4 === n) out.push({ format: 'prefix', pattern: `L${D(k)}LLL` });
  for (let k = 1; k <= 3; k++) if (k + 4 === n) out.push({ format: 'suffix', pattern: `LLL${D(k)}L` });
  for (let a = 1; a <= 3; a++) for (let k = 1; k <= 4; k++) if (a + k === n) out.push({ format: 'northern-ireland', pattern: 'L'.repeat(a) + D(k) });
  return out;
}

/**
 * The reading put right by the UK plate formats, or null when it fits none.
 * Of the formats it can be made to fit, the one needing fewest changes wins
 * (ties in the order above); a character that is not a known lookalike of what
 * its position needs rules the format out — this corrects misreads, it does not
 * invent a plate.
 * @param {string} raw  letters and digits, spaces ignored
 * @returns {{ value: string, format: string, changes: number } | null}
 */
export function fixUkPlate(raw) {
  const v = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let best = null;
  for (const { format, pattern } of patternsFor(v.length)) {
    let out = '', changes = 0, ok = true;
    /** @type {Record<number, string>} position → the digits it may be */
    const choices = {};
    for (let i = 0; i < v.length && ok; i++) {
      const c = v[i];
      if (pattern[i] === 'L') {
        // Q is never issued in a current-format plate (the age and area letters
        // and the three at the end), so a Q there is an O the reader closed up.
        if (c === 'Q' && format === 'current') { out += 'O'; changes += 0.25; }   // nearly free: it cannot be a Q
        else if (isLetter(c)) out += c;
        else if (TO_LETTER[c]) { out += TO_LETTER[c]; changes++; } else ok = false;
      } else if (isDigit(c)) out += c;
      else if (TO_DIGIT[c]) { out += TO_DIGIT[c]; changes++; }
      else if (TO_DIGIT_ALT[c] && format === 'current' && (i === 2 || i === 3)) { choices[i] = TO_DIGIT_ALT[c]; out += TO_DIGIT_ALT[c][0]; changes += 1.5; }
      else ok = false;
    }
    if (ok && format === 'current' && Object.keys(choices).length) {
      // Several digits could be meant: take the first making a real age identifier.
      let found = false;
      pick: for (const a of choices[2] ?? out[2]) for (const b of choices[3] ?? out[3]) {
        if (validAge(a + b)) { out = out.slice(0, 2) + a + b + out.slice(4); found = true; break pick; }
      }
      if (!found) ok = false;
    }
    if (ok && format === 'current' && !validAge(out.slice(2, 4))) {
      // 85, 93… cannot be an age identifier: a lookalike digit is meant (VK65).
      const fix = fixAge(out.slice(2, 4));
      if (fix) { out = out.slice(0, 2) + fix.digits + out.slice(4); changes += fix.swaps * 0.25; }   // nearly free: the age was impossible as read
    }
    if (ok && (!best || changes < best.changes)) best = { value: out, format, changes };
  }
  return best;
}
