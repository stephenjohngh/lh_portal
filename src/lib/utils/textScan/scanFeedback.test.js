import { describe, it, expect } from 'vitest';
import { scanStatus, boxState } from './scanFeedback.js';

const base = { elapsedMs: 0, seeing: '', matched: false, reading: '', torchAvailable: false, torchOn: false };

describe('what the scanner says while it works', () => {
  it('says it is looking, then reading, from the first moment', () => {
    expect(scanStatus(base)).toMatch(/Looking/);
    expect(scanStatus({ ...base, seeing: 'AB12' })).toMatch(/Reading/);
  });

  it('the longer it goes without an answer, the more it suggests', () => {
    expect(scanStatus({ ...base, elapsedMs: 6000 })).toMatch(/move closer/);
    expect(scanStatus({ ...base, elapsedMs: 6000, seeing: 'AB' })).toMatch(/keep it steady/);
    expect(scanStatus({ ...base, elapsedMs: 12000, torchAvailable: true })).toMatch(/Light on/);
    expect(scanStatus({ ...base, elapsedMs: 12000, torchAvailable: true, torchOn: true })).toMatch(/Take a photo/);
    expect(scanStatus({ ...base, elapsedMs: 12000 })).toMatch(/Take a photo/);
  });

  it('an answer replaces the hints', () => {
    expect(scanStatus({ ...base, elapsedMs: 20000, matched: true })).toBe('Tap the one that matches');
    expect(scanStatus({ ...base, elapsedMs: 20000, reading: 'KL55MNP' })).toMatch(/use what was read/);
  });

  it('the box frame says looking, seeing or found', () => {
    expect(boxState(base)).toBe('looking');
    expect(boxState({ ...base, seeing: 'AB' })).toBe('seeing');
    expect(boxState({ ...base, seeing: 'AB', matched: true })).toBe('found');
    expect(boxState({ ...base, reading: 'KL55MNP' })).toBe('found');
  });
});
