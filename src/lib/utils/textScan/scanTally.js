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

/**
 * @typedef {{ value: string, distance: number, exact: boolean, [k: string]: any }} Match
 * @typedef {{ t: number, matches: Match[], reading: string|null }} Frame
 */

/**
 * @param {{ windowMs?: number, minVotes?: number, minConfidence?: number }} [opts]
 */
export function createScanTally({ windowMs = 5000, minVotes = 2, minConfidence = 30 } = {}) {
  /** @type {Frame[]} */
  let frames = [];
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
     * @returns {{ matches: Array<Match & { votes: number }>, reading: string|null }}
     */
    view(now) {
      frames = frames.filter((f) => now - f.t <= windowMs);
      /** @type {Map<string, Match & { votes: number }>} */
      const bySlot = new Map();
      for (const f of frames) {
        for (const m of f.matches) {
          const slot = slotOf(m);
          const prior = bySlot.get(slot);
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
      return { matches: offered.map((o) => o.m), reading: best >= minVotes ? reading : null };
    },

    reset() { frames = []; shownSince.clear(); },
  };
}
