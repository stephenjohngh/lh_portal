import { describe, it, expect } from 'vitest';
import { createScanTally } from './scanTally.js';
import { matchScan, readingsFrom } from './scanMatch.js';

const PERMITS = [{ value: 'ABC 123', label: 'road permit' }, { value: 'XY70 ZZZ', label: 'road permit' }];

/** Feed what the camera read, frame by frame, half a second apart. */
function run(tally, texts, { start = 0, conf = 70 } = {}) {
  let t = start;
  for (const text of texts) {
    tally.add(t, { matches: matchScan(text, PERMITS, 'registration'), reading: readingsFrom(text, 'registration')[0] ?? null, confidence: conf });
    tally.view(t);                                   // as the scanner does after every frame
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

  it('moving to another car: the new plate replaces the old once it is definite', () => {
    const tally = createScanTally({ windowMs: 3000 });
    let t = run(tally, ['ABC 123', 'ABC 123', 'ABC 123']);
    expect(tally.view(t)).toMatchObject({ held: true });
    t = run(tally, ['XY70 ZZZ'], { start: t });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123']);   // one read is not definite
    t = run(tally, ['XY70 ZZZ', 'XY70 ZZZ'], { start: t });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['XY70 ZZZ']);
  });

  it('reads the reader is unsure of do not vote', () => {
    const tally = createScanTally({ minConfidence: 30 });
    const t = run(tally, ['ABC 123', 'ABC 123', 'ABC 123'], { conf: 12 });
    expect(tally.view(t)).toEqual({ matches: [], reading: null, held: false });
  });
});

describe('holding a definite answer', () => {
  it('a definite answer stays through wild guesses and any amount of time', () => {
    const tally = createScanTally({ windowMs: 3000 });
    let t = run(tally, ['ABC 123', 'ABC 123']);           // exact twice: definite
    expect(tally.view(t)).toMatchObject({ held: true, matches: [expect.objectContaining({ value: 'ABC 123' })] });
    t = run(tally, ['W7 KQ', 'C 12', 'XZ', 'A8 1', 'Q', 'KK7', 'M 4 P', '7 7'], { start: t });
    t += 60_000;                                          // and a minute later
    const v = tally.view(t);
    expect(v.held).toBe(true);
    expect(v.matches.map((m) => m.value)).toEqual(['ABC 123']);
    expect(v.reading).toBe('ABC123');
  });

  it('a held plate is not pushed aside by text read off half of it', () => {
    const tally = createScanTally();
    let t = run(tally, ['ABC 123', 'ABC 123']);
    t = run(tally, ['ABC 1', 'ABC 1', 'ABC 1', 'ABC 1'], { start: t });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123']);
  });

  it('a held plate gives way to a different car read definitely, even one on no list', () => {
    const tally = createScanTally({ windowMs: 3000 });
    let t = run(tally, ['ABC 123', 'ABC 123']);
    t = run(tally, ['KL55 MNP', 'KL55 MNP'], { start: t + 4000 });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123']);   // twice: not yet definite
    t = run(tally, ['KL55 MNP'], { start: t });
    expect(tally.view(t)).toMatchObject({ matches: [], reading: 'KL55MNP', held: true });
  });

  it('straight after moving on, the new car wins — never the old plate beside the new text', () => {
    const tally = createScanTally();                     // 5 s window: the old plate is still in it
    let t = run(tally, ['ABC 123', 'ABC 123', 'ABC 123']);
    t = run(tally, ['KL55 MNP', 'KL55 MNP', 'KL55 MNP'], { start: t });
    expect(tally.view(t)).toMatchObject({ matches: [], reading: 'KL55MNP', held: true });
  });

  it('a held reading on no list is replaced by a known plate, or by a different definite reading', () => {
    const tally = createScanTally({ windowMs: 3000 });
    let t = run(tally, ['KL55 MNP', 'KL55 MNP', 'KL55 MNP']);
    expect(tally.view(t)).toMatchObject({ held: true, matches: [], reading: 'KL55MNP' });
    t = run(tally, ['MM11 AAA', 'MM11 AAA', 'MM11 AAA'], { start: t + 4000 });
    expect(tally.view(t)).toMatchObject({ matches: [], reading: 'MM11AAA' });
    t = run(tally, ['ABC 123', 'ABC 123'], { start: t + 4000 });
    expect(tally.view(t).matches.map((m) => m.value)).toEqual(['ABC 123']);
  });

  it('the same car read with one letter different does not flip the held reading', () => {
    const tally = createScanTally();
    let t = run(tally, ['KL55 MNP', 'KL55 MNP', 'KL55 MNP']);
    t = run(tally, ['KL55 MNF', 'KL55 MNF', 'KL55 MNF', 'KL55 MNF', 'KL55 MNF'], { start: t });
    expect(tally.view(t).reading).toBe('KL55MNP');
  });

  it('before anything is definite, the tentative view is shown as before', () => {
    const tally = createScanTally();
    const t = run(tally, ['ABC I23', 'ABC I23']);         // close match twice: offered, not yet definite
    const v = tally.view(t);
    expect(v.held).toBe(false);
    expect(v.matches.map((m) => m.value)).toEqual(['ABC 123']);
  });

  it('reset forgets the held answer', () => {
    const tally = createScanTally();
    const t = run(tally, ['ABC 123', 'ABC 123']);
    tally.reset();
    expect(tally.view(t + 1)).toEqual({ matches: [], reading: null, held: false });
  });
});
