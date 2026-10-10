import { describe, it, expect } from 'vitest';
import { createScanTally } from './scanTally.js';
import { matchScan, readingsFrom } from './scanMatch.js';

const PERMITS = [{ value: 'ABC 123', label: 'road permit' }, { value: 'XY70 ZZZ', label: 'road permit' }];

/** Feed what the camera read, frame by frame, half a second apart. */
function run(tally, texts, { start = 0, conf = 70 } = {}) {
  let t = start;
  for (const text of texts) {
    tally.add(t, { matches: matchScan(text, PERMITS, 'registration'), reading: readingsFrom(text, 'registration')[0] ?? null, confidence: conf });
    t += 500;
  }
  return t;
}

describe('steadying the live read', () => {
  it('one good frame is not enough; two are', () => {
    const tally = createScanTally();
    let t = run(tally, ['ABC 123']);
    expect(tally.view(t).matches).toEqual([]);
    t = run(tally, ['ABC 123'], { start: t });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123']);
  });

  it('the reported jumping — plate, half, nonsense, nothing — keeps the plate on screen', () => {
    const tally = createScanTally();
    const t = run(tally, ['ABC 123', 'ABC I23', 'C 12', 'W7 KQ', '', 'AB 1', 'ABC 123']);
    const v = tally.view(t);
    expect(v.matches.map((m) => m.value)).toEqual(['ABC 123']);
    expect(v.matches[0].votes).toBeGreaterThanOrEqual(3);
    expect(v.reading).toBe('ABC123');               // the most frequent reading, not the last fragment
  });

  it('a one-frame misread never appears', () => {
    const tally = createScanTally();
    const t = run(tally, ['ABC 123', 'XY70 ZZZ', 'ABC 123', 'ABC 123']);
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123']);
  });

  it('moving to another car: the new plate arrives, the old one ages out', () => {
    const tally = createScanTally({ windowMs: 3000 });
    let t = run(tally, ['ABC 123', 'ABC 123', 'ABC 123']);
    t = run(tally, ['XY70 ZZZ', 'XY70 ZZZ'], { start: t });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123', 'XY70 ZZZ']);   // steady order: first offered first
    t = run(tally, ['XY70 ZZZ', 'XY70 ZZZ', 'XY70 ZZZ', 'XY70 ZZZ'], { start: t });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['XY70 ZZZ']);
  });

  it('reads the reader is unsure of do not vote', () => {
    const tally = createScanTally({ minConfidence: 30 });
    const t = run(tally, ['ABC 123', 'ABC 123', 'ABC 123'], { conf: 12 });
    expect(tally.view(t)).toEqual({ matches: [], reading: null });
  });
});
