// src/lib/server/publicationGrant.test.js
// P3 step 5 — the grant cookie a recipient carries after answering.
//
// The property worth testing hardest: a grant is scoped to ONE publication.
// Answering the passphrase for one pack must not open a second, and a grant
// must not be forgeable by anyone who has merely seen one.

import { describe, it, expect, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
  env: { DOSSIER_LINK_SECRET: 'test-secret-value' },
}));

const {
  mintGrant, verifyGrant, hasGrant, grantCookieName, grantCookieOptions,
  GRANT_TTL_MS,
} = await import('./publicationPassphrase.js');

const NOW = new Date('2026-08-12T12:00:00.000Z').getTime();
const PROTECTED = { id: 'pub1', passphrase_hash: 'h', passphrase_salt: 's' };
const OPEN = { id: 'pub2' };

/** A cookie jar shaped like SvelteKit's. */
const jar = (entries = {}) => ({ get: (name) => entries[name] });

describe('mintGrant / verifyGrant', () => {
  it('accepts a grant it just minted', () => {
    expect(verifyGrant(mintGrant('pub1', NOW), 'pub1', NOW)).toBe(true);
  });

  it('is scoped to ONE publication', () => {
    // Answering for one pack must not open a second. The id is bound into the
    // signature, so a grant simply does not verify elsewhere.
    const grant = mintGrant('pub1', NOW);
    expect(verifyGrant(grant, 'pub2', NOW)).toBe(false);
  });

  it('expires', () => {
    const grant = mintGrant('pub1', NOW);
    expect(verifyGrant(grant, 'pub1', NOW + GRANT_TTL_MS - 1000)).toBe(true);
    expect(verifyGrant(grant, 'pub1', NOW + GRANT_TTL_MS)).toBe(false);
    expect(verifyGrant(grant, 'pub1', NOW + GRANT_TTL_MS + 1)).toBe(false);
  });

  it('cannot be extended by editing the expiry', () => {
    // The expiry is signed, not merely carried. Rewriting it invalidates it —
    // otherwise the TTL would be a suggestion.
    const grant = mintGrant('pub1', NOW);
    const [, mac] = grant.split('.');
    const forged = `${NOW + 10 * GRANT_TTL_MS}.${mac}`;
    expect(verifyGrant(forged, 'pub1', NOW)).toBe(false);
  });

  it('rejects a forged or corrupted signature', () => {
    const grant = mintGrant('pub1', NOW);
    const [expiry, mac] = grant.split('.');
    expect(verifyGrant(`${expiry}.${'0'.repeat(mac.length)}`, 'pub1', NOW)).toBe(false);
    expect(verifyGrant(`${expiry}.short`, 'pub1', NOW)).toBe(false);
  });

  it('rejects rubbish rather than throwing', () => {
    for (const bad of [null, undefined, '', 'nonsense', '.', 'abc.def', 42, {}]) {
      expect(verifyGrant(/** @type {any} */ (bad), 'pub1', NOW)).toBe(false);
    }
  });

  it('carries no secret and no identity — only a scope and a deadline', () => {
    const grant = mintGrant('pub1', NOW);
    expect(grant).not.toContain('test-secret-value');
    expect(grant).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });
});

describe('hasGrant', () => {
  it('is true for a publication with no passphrase, whatever the jar holds', () => {
    // Callers gate on this unconditionally, so an unprotected pack must pass
    // without them having to remember to check needsPassphrase first.
    expect(hasGrant(jar(), OPEN, NOW)).toBe(true);
    expect(hasGrant(jar({ anything: 'x' }), OPEN, NOW)).toBe(true);
    expect(hasGrant(undefined, OPEN, NOW)).toBe(true);
  });

  it('is false for a protected publication with no cookie', () => {
    expect(hasGrant(jar(), PROTECTED, NOW)).toBe(false);
    expect(hasGrant(undefined, PROTECTED, NOW)).toBe(false);
  });

  it('is true once the right cookie is present', () => {
    const cookies = jar({ [grantCookieName('pub1')]: mintGrant('pub1', NOW) });
    expect(hasGrant(cookies, PROTECTED, NOW)).toBe(true);
  });

  it('ignores a grant for a different publication under a borrowed name', () => {
    // Putting pub2's grant under pub1's cookie name must not work: the id is
    // in the signature, not merely in the key.
    const cookies = jar({ [grantCookieName('pub1')]: mintGrant('pub2', NOW) });
    expect(hasGrant(cookies, PROTECTED, NOW)).toBe(false);
  });

  it('stops honouring an expired cookie', () => {
    const cookies = jar({ [grantCookieName('pub1')]: mintGrant('pub1', NOW) });
    expect(hasGrant(cookies, PROTECTED, NOW + GRANT_TTL_MS + 1)).toBe(false);
  });
});

describe('grantCookieName', () => {
  it('is per publication', () => {
    expect(grantCookieName('pub1')).not.toBe(grantCookieName('pub2'));
  });

  it('strips anything a cookie name cannot carry', () => {
    expect(grantCookieName('a b;c=d')).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('grantCookieOptions', () => {
  it('is HttpOnly, Secure and same-site', () => {
    // A passphrase grant has no business being readable by script, travelling
    // in the clear, or riding along on a cross-site request.
    const options = grantCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
  });

  it('expires with the grant it carries', () => {
    expect(grantCookieOptions().maxAge).toBe(Math.floor(GRANT_TTL_MS / 1000));
  });
});
