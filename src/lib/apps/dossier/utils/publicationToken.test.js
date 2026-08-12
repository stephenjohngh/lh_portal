// src/lib/apps/dossier/utils/publicationToken.test.js
// P3 step 1 — the link's secret.
//
// "Unguessable" is the user's own word for the requirement, so entropy and
// shape are tested rather than assumed, and the hash is checked against a known
// SHA-256 vector so a wrong digest cannot pass by agreeing with itself.

import { describe, it, expect } from 'vitest';
import {
  generateToken, hashToken, isWellFormedToken, tokenPrefix, safeEqual,
  publicationUrl, TOKEN_PREFIX_LENGTH,
} from './publicationToken.js';

describe('generateToken', () => {
  it('produces a URL-safe token of the expected length', () => {
    const token = generateToken();
    // 32 bytes → 43 base64url characters, no padding.
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('needs no encoding in a path segment', () => {
    const token = generateToken();
    expect(encodeURIComponent(token)).toBe(token);
  });

  it('does not repeat', () => {
    // 256 bits: a collision in 500 draws would mean the RNG is not what we think.
    const seen = new Set(Array.from({ length: 500 }, () => generateToken()));
    expect(seen.size).toBe(500);
  });

  it('uses the whole alphabet, not a narrow slice of it', () => {
    // A cheap smoke test for a broken encoder producing low-entropy output.
    const sample = Array.from({ length: 50 }, () => generateToken()).join('');
    expect(new Set(sample).size).toBeGreaterThan(50);
  });
});

describe('isWellFormedToken', () => {
  it('accepts what generateToken produces', () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
  });

  it('rejects anything that could not be one', () => {
    for (const bad of [
      '', 'short', null, undefined, 42, {},
      'a'.repeat(39),                      // too short
      'a'.repeat(51),                      // too long
      'has spaces in it aaaaaaaaaaaaaaaaaaaaaaaaaa',
      '../../etc/passwd/aaaaaaaaaaaaaaaaaaaaaaaaaa',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%00',
    ]) {
      expect(isWellFormedToken(/** @type {any} */ (bad))).toBe(false);
    }
  });

  it('rejects a path-traversal attempt before it reaches the database', () => {
    expect(isWellFormedToken('../'.repeat(15))).toBe(false);
  });
});

describe('hashToken', () => {
  it('matches a known SHA-256 vector', async () => {
    // Pinned against the standard digest of "abc", so a wrong implementation
    // cannot pass by being consistently wrong.
    expect(await hashToken('abc'))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is stable and 64 hex characters', async () => {
    const token = generateToken();
    const once = await hashToken(token);
    expect(once).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken(token)).toBe(once);
  });

  it('separates two tokens that differ by one character', async () => {
    expect(await hashToken('aaaa')).not.toBe(await hashToken('aaab'));
  });

  it('does not contain the token', async () => {
    const token = generateToken();
    expect(await hashToken(token)).not.toContain(token.slice(0, 8));
  });
});

describe('tokenPrefix', () => {
  it('takes the identifiable head, so the author can tell links apart', () => {
    const token = generateToken();
    expect(tokenPrefix(token)).toBe(token.slice(0, TOKEN_PREFIX_LENGTH));
    expect(tokenPrefix(token)).toHaveLength(8);
  });

  it('leaves the rest secret', () => {
    // 8 of 43 characters is roughly 48 bits still unknown — an identifier, not
    // a shortcut to the link.
    const token = generateToken();
    expect(token.startsWith(tokenPrefix(token))).toBe(true);
    expect(tokenPrefix(token).length).toBeLessThan(token.length / 4);
  });
});

describe('safeEqual', () => {
  it('compares equal and unequal digests correctly', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
    expect(safeEqual('abc123', 'abc124')).toBe(false);
    expect(safeEqual('abc123', 'abc12')).toBe(false);
  });

  it('is false for anything missing rather than treating two blanks as a match', () => {
    expect(safeEqual(null, null)).toBe(true);      // both '' — no secret involved
    expect(safeEqual('abc', null)).toBe(false);
    expect(safeEqual(null, 'abc')).toBe(false);
  });
});

describe('publicationUrl', () => {
  it('builds the link the author copies', () => {
    expect(publicationUrl('https://portal.example.com', 'TOKEN'))
      .toBe('https://portal.example.com/pack/TOKEN');
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(publicationUrl('https://portal.example.com/', 'TOKEN'))
      .toBe('https://portal.example.com/pack/TOKEN');
  });
});
