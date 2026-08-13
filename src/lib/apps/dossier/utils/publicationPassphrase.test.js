// src/lib/apps/dossier/utils/publicationPassphrase.test.js
// P3 step 5 — the optional second factor.
//
// The bug that matters here is the one that turns an optional factor into no
// factor: a publication with no passphrase being unlockable by supplying an
// empty one. It has its own test, first.

import { describe, it, expect } from 'vitest';
import {
  hashPassphrase, verifyPassphrase, needsPassphrase, safeEqualHex,
} from './publicationPassphrase.js';

describe('verifyPassphrase — failing closed', () => {
  it('refuses everything when there is no stored hash', async () => {
    // A publication with no passphrase must not be "unlockable" at all. The
    // caller gates on needsPassphrase; this is the second line of defence.
    expect(await verifyPassphrase('anything', null, null)).toBe(false);
    expect(await verifyPassphrase('anything', '', '')).toBe(false);
    expect(await verifyPassphrase('', null, null)).toBe(false);
  });

  it('refuses an empty passphrase against a real hash', async () => {
    const { hash, salt } = await hashPassphrase('correct horse');
    expect(await verifyPassphrase('', hash, salt)).toBe(false);
    expect(await verifyPassphrase(null, hash, salt)).toBe(false);
    expect(await verifyPassphrase(undefined, hash, salt)).toBe(false);
  });

  it('refuses a hash with the wrong salt', async () => {
    const a = await hashPassphrase('correct horse');
    const b = await hashPassphrase('correct horse');
    // Same passphrase, different salt — the stored pair must be used together.
    expect(await verifyPassphrase('correct horse', a.hash, b.salt)).toBe(false);
  });
});

describe('hashPassphrase / verifyPassphrase', () => {
  it('round-trips the right passphrase', async () => {
    const { hash, salt } = await hashPassphrase('correct horse battery staple');
    expect(await verifyPassphrase('correct horse battery staple', hash, salt)).toBe(true);
  });

  it('rejects a wrong one, including a near miss', async () => {
    const { hash, salt } = await hashPassphrase('correct horse');
    expect(await verifyPassphrase('correct horsE', hash, salt)).toBe(false);
    expect(await verifyPassphrase('correct hors', hash, salt)).toBe(false);
    expect(await verifyPassphrase('Correct horse', hash, salt)).toBe(false);
  });

  it('salts, so the same passphrase stores differently every time', async () => {
    // Without this, two packs sharing a passphrase are visibly the same in the
    // database, and one cracked hash breaks both.
    const a = await hashPassphrase('same');
    const b = await hashPassphrase('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('does not store the passphrase in any recoverable form', async () => {
    const { hash, salt } = await hashPassphrase('sekrit-passphrase');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain('sekrit');
    expect(salt).not.toContain('sekrit');
  });

  it('handles a passphrase with spaces and non-ASCII characters', async () => {
    const phrase = 'Rendez-vous à 14h — château';
    const { hash, salt } = await hashPassphrase(phrase);
    expect(await verifyPassphrase(phrase, hash, salt)).toBe(true);
    expect(await verifyPassphrase('Rendez-vous a 14h - chateau', hash, salt)).toBe(false);
  });
});

describe('needsPassphrase', () => {
  it('is true only when BOTH halves are stored', () => {
    expect(needsPassphrase({ passphrase_hash: 'h', passphrase_salt: 's' })).toBe(true);
    // A half-written row must not be treated as protected — the gate would let
    // nobody in at all, including the intended recipient.
    expect(needsPassphrase({ passphrase_hash: 'h', passphrase_salt: null })).toBe(false);
    expect(needsPassphrase({ passphrase_hash: null, passphrase_salt: 's' })).toBe(false);
    expect(needsPassphrase({})).toBe(false);
    expect(needsPassphrase(null)).toBe(false);
  });
});

describe('safeEqualHex', () => {
  it('compares equal and unequal digests correctly', () => {
    expect(safeEqualHex('abc123', 'abc123')).toBe(true);
    expect(safeEqualHex('abc123', 'abc124')).toBe(false);
    expect(safeEqualHex('abc123', 'abc12')).toBe(false);
  });
});
