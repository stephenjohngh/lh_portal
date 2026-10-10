// src/lib/utils/textScan/scanTally.js
//
// Steadying the live camera read (2026-10-10). Pure.
//
// Reported on a real phone: reading frame by frame, the answer jumped — the
// plate, then half of it, then nothing like it — so a matched permit appeared
// and vanished under the person's finger. One frame is a poor witness: a
// slight blur, a reflection or a hand turns a good read into a bad one.
//
// So frames VOTE. A match is offered only once it has been seen in at least
// `minVotes` recent frames, and stays offered while it is still being seen
// now and then — a bad frame or two no longer removes it. Moving to another
// plate: the old one ages out after `windowMs`, and the new one arrives after
// its votes. "Use what was read" is the reading seen most often, not the
// latest. Reads the reader itself is unsure of (`minConfidence`) do not vote.
//
// ⭐ And a DEFINITE answer is HELD (2026-10-10, again from a real phone: held
// still, it read the right plate between a lot of wild guesses, and the right
// plate kept going). Definite = a known value read exactly `exactVotes` times,
// or close-matched `definiteVotes` times, or text read the same way
// `definiteVotes` times, within the window. Once held it stays — no time limit,
// no amount of wild guessing removes it — until a DIFFERENT definite answer
// replaces it. Text that is PART of a held known value (half the same plate)
// never replaces it; a different car, read definitely, does — even one on no
// list, or the old plate would still be offered while pointing at another car.

import { scanDistance } from './scanMatch.js';

/**
 * @typedef {{ value: string, distance: number, exact: boolean, [k: string]: any }} Match
 * @typedef {{ t: number, matches: Match[], reading: string|null }} Frame
 */

/**
 * @param {{ windowMs?: number, minVotes?: number, minConfidence?: number }} [opts]
 */
export function createScanTally({ windowMs = 5000, minVotes = 2, minConfidence = 30, definiteVotes = 3, exactVotes = 2 } = {}) {
  /** @type {Frame[]} */
  let frames = [];
  /** The held answer: what is shown until a different definite one arrives. */
  /** @type {{ matches: Array<Match & { votes: number }>, reading: string|null }|null} */
  let held = null;
  /** slot → when it was first offered (keeps the list in a steady order) */
  const shownSince = new Map();

  const slotOf = (/** @type {Match} */ m) => (m.id != null ? `${m.value}#${m.id}` : m.value);

  return {
    /**
     * One frame's read.
     * @param {number} now
     * @param {{ matches: Match[], reading: string|null, confidence: number }} read
     * @returns {boolean} whether it counted
     */
    add(now, { matches, reading, confidence }) {
      frames = frames.filter((f) => now - f.t <= windowMs);
      if (confidence < minConfidence || (!reading && !matches.length)) return false;
      frames.push({ t: now, matches, reading });
      return true;
    },

    /**
     * What to show now.
     * @param {number} now
     * @returns {{ matches: Array<Match & { votes: number }>, reading: string|null, held: boolean }}
     */
    view(now) {
      frames = frames.filter((f) => now - f.t <= windowMs);
      /** @type {Map<string, Match & { votes: number }>} */
      const bySlot = new Map();
      /** slot → the last frame it was read in */
      const lastSeen = new Map();
      for (const f of frames) {
        for (const m of f.matches) {
          const slot = slotOf(m);
          const prior = bySlot.get(slot);
          lastSeen.set(slot, f.t);
          if (!prior) bySlot.set(slot, { ...m, votes: 1 });
          else {
            prior.votes++;
            if (m.distance < prior.distance) Object.assign(prior, { distance: m.distance, exact: m.exact });
          }
        }
      }
      // Offered once it has its votes; kept while it is seen at all.
      const offered = [];
      for (const [slot, m] of bySlot) {
        if (m.votes >= minVotes || shownSince.has(slot)) {
          if (!shownSince.has(slot)) shownSince.set(slot, now);
          offered.push({ slot, m });
        }
      }
      for (const slot of [...shownSince.keys()]) if (!bySlot.has(slot)) shownSince.delete(slot);
      offered.sort((a, b) =>
        Number(b.m.exact) - Number(a.m.exact)
        || /** @type {number} */ (shownSince.get(a.slot)) - /** @type {number} */ (shownSince.get(b.slot))
        || a.m.distance - b.m.distance);

      // The reading seen most often (ties: the more recent).
      const counts = new Map();
      for (const f of frames) if (f.reading) counts.set(f.reading, (counts.get(f.reading) ?? 0) + 1);
      let reading = null, best = 0;
      for (const f of [...frames].reverse()) {
        const c = f.reading ? counts.get(f.reading) : 0;
        if (c > best) { best = c; reading = f.reading; }
      }
      const tentative = { matches: offered.map((o) => o.m), reading: best >= minVotes ? reading : null };

      // Definite answers in this window. If two plates are definite at once
      // (the camera has just moved on), the one read most recently wins;
      // values matched in the same frame (door 12 on two floors) stay together.
      const definite = [...bySlot.entries()]
        .filter(([, m]) => m.votes >= definiteVotes || (m.exact && m.votes >= exactVotes));
      const latest = Math.max(-Infinity, ...definite.map(([slot]) => lastSeen.get(slot)));
      const sure = definite
        .filter(([slot]) => lastSeen.get(slot) === latest)
        .sort((a, b) => b[1].votes - a[1].votes || a[1].distance - b[1].distance);
      const sureReading = best >= definiteVotes ? reading : null;
      const keyOf = (/** @type {Array<any>} */ ms) => ms.map((m) => slotOf(m)).sort().join('|');
      const flat = (/** @type {string} */ v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      // Is this reading a piece of (or the whole of) a held known value?
      const partOfHeld = (/** @type {string} */ r) => !!held?.matches.some((m) => flat(m.value).includes(flat(r)) || flat(r).includes(flat(m.value)));
      // The same car read with one character different (P for F) is not a new car:
      // keep what is held rather than flip between the two.
      const nearHeldReading = (/** @type {string} */ r) => !!held?.reading && !held.matches.length
        && scanDistance(r, held.reading) <= 1 && Math.abs(r.length - held.reading.length) <= 1;

      const ms = sure.map(([, m]) => ({ ...m }));
      // A reading belongs with matched values only if it is (part of) one of them.
      const fits = (/** @type {string|null} */ r, /** @type {Array<any>} */ list) =>
        !!r && list.some((m) => flat(m.value).includes(flat(r)) || flat(r).includes(flat(m.value)));
      let readingLast = -Infinity;
      for (const f of frames) if (f.reading === sureReading) readingLast = Math.max(readingLast, f.t);

      if (sureReading && !fits(sureReading, ms) && readingLast > latest) {
        // The newest definite thing read is a different car (on no list, or not yet matched).
        if (sureReading !== held?.reading || held?.matches.length) {
          if (!partOfHeld(sureReading) && !nearHeldReading(sureReading)) held = { matches: [], reading: sureReading };
        }
      } else if (ms.length) {
        const own = [sureReading, tentative.reading].find((r) => fits(r, ms))
          ?? (held && keyOf(held.matches) === keyOf(ms) ? held.reading : null)
          ?? flat(ms[0].value);
        held = { matches: ms, reading: own };
      } else if (sureReading && sureReading !== held?.reading && !partOfHeld(sureReading) && !nearHeldReading(sureReading)) {
        held = { matches: [], reading: sureReading };
      }

      return held ? { ...held, held: true } : { ...tentative, held: false };
    },

    reset() { frames = []; shownSince.clear(); held = null; },
  };
}
