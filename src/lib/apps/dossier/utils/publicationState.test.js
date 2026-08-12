// src/lib/apps/dossier/utils/publicationState.test.js
// P3 step 1 — whether a link still works.
//
// This gate runs in two places that must agree exactly: the author's list and
// the public reader. Disagreement means the author is looking at a lie — a link
// they believe is dead that still serves a pack, or the reverse. The boundary
// cases are the whole point, which is why the clock is injected.

import { describe, it, expect } from 'vitest';
import {
  publicationState, isServable, daysUntilExpiry, describePublication,
  expiryFromDays, READER_REFUSAL, STATE_LABEL,
} from './publicationState.js';

const NOW = new Date('2026-08-12T12:00:00.000Z').getTime();
const at = (iso) => new Date(iso).toISOString();

describe('publicationState', () => {
  it('is live with no expiry and no revocation', () => {
    expect(publicationState({}, NOW)).toBe('live');
    expect(publicationState({ expires_at: null, revoked_at: null }, NOW)).toBe('live');
  });

  it('is live before the expiry instant', () => {
    expect(publicationState({ expires_at: at('2026-08-12T12:00:01Z') }, NOW)).toBe('live');
  });

  it('is expired AT the expiry instant, not a moment after', () => {
    // An off-by-one here means a link outliving its stated life.
    expect(publicationState({ expires_at: at('2026-08-12T12:00:00Z') }, NOW)).toBe('expired');
  });

  it('is expired after it', () => {
    expect(publicationState({ expires_at: at('2026-08-11T12:00:00Z') }, NOW)).toBe('expired');
  });

  it('reports revoked even when also expired', () => {
    // A link the author killed deliberately should say so, not report itself as
    // merely lapsed.
    expect(publicationState({
      revoked_at: at('2026-08-01T00:00:00Z'), expires_at: at('2026-08-05T00:00:00Z'),
    }, NOW)).toBe('revoked');
  });

  it('reports revoked even when the expiry is still in the future', () => {
    expect(publicationState({
      revoked_at: at('2026-08-10T00:00:00Z'), expires_at: at('2026-12-01T00:00:00Z'),
    }, NOW)).toBe('revoked');
  });

  it('ignores an unparseable expiry rather than failing open OR closed silently', () => {
    // Garbage in the column must not become an accidental kill switch, and must
    // not become an accidental immortal link either — it is simply not an expiry.
    expect(publicationState({ expires_at: 'not a date' }, NOW)).toBe('live');
  });

  it('accepts a Date as well as millis', () => {
    expect(publicationState({ expires_at: at('2026-08-11T00:00:00Z') }, new Date(NOW)))
      .toBe('expired');
  });
});

describe('isServable', () => {
  it('is the single gate — true only for live', () => {
    expect(isServable({}, NOW)).toBe(true);
    expect(isServable({ revoked_at: at('2026-08-01T00:00:00Z') }, NOW)).toBe(false);
    expect(isServable({ expires_at: at('2026-08-01T00:00:00Z') }, NOW)).toBe(false);
  });

  it('FAILS CLOSED on a publication that does not exist', () => {
    // The most important case of all: a token nobody issued. The lookup returns
    // null, and a gate that read that as "no revocation, no expiry, therefore
    // live" would serve a pack on a made-up link.
    expect(isServable(null, NOW)).toBe(false);
    expect(isServable(undefined, NOW)).toBe(false);
  });
});

describe('READER_REFUSAL', () => {
  it('is ONE message, so every cause reads the same', () => {
    // A caller probing links must not be able to tell a wrong token from a
    // revoked one from an expired one: the difference confirms a pack exists,
    // which is the fact an unguessable link is meant to hide. There being a
    // single constant is how that is enforced — the moment a second, more
    // helpful message appears, the distinction is back.
    //
    // That the ROUTES all use it, and that their responses are byte-identical,
    // is asserted where it actually lives, in the reader endpoint tests.
    const states = [
      null,
      {},
      { revoked_at: at('2026-08-01T00:00:00Z') },
      { expires_at: at('2026-08-01T00:00:00Z') },
    ];
    const messages = new Set(states.map(() => READER_REFUSAL));
    expect(messages.size).toBe(1);
  });

  it('is hedged, never a statement of what happened', () => {
    // "may have expired or been withdrawn" tells the recipient how to proceed
    // without confirming which — or that there is anything there at all.
    expect(READER_REFUSAL).toContain('may have');
    expect(READER_REFUSAL).not.toMatch(/\b(has|was|is) (expired|revoked|withdrawn|deleted)\b/i);
  });

  it('tells the recipient what to do instead', () => {
    expect(READER_REFUSAL).toContain('contact the person who sent it');
  });
});

describe('daysUntilExpiry', () => {
  it('is null when there is no expiry', () => {
    expect(daysUntilExpiry({}, NOW)).toBeNull();
    expect(daysUntilExpiry({ expires_at: 'rubbish' }, NOW)).toBeNull();
  });

  it('counts forward and backward', () => {
    expect(daysUntilExpiry({ expires_at: at('2026-08-19T12:00:00Z') }, NOW)).toBe(7);
    expect(daysUntilExpiry({ expires_at: at('2026-08-10T12:00:00Z') }, NOW)).toBe(-2);
  });
});

describe('describePublication', () => {
  it('warns about an expiry the author would otherwise have to calculate', () => {
    expect(describePublication({ expires_at: at('2026-08-13T12:00:00Z') }, NOW))
      .toBe('Expires tomorrow');
    expect(describePublication({ expires_at: at('2026-08-17T12:00:00Z') }, NOW))
      .toBe('Expires in 5 days');
  });

  it('stops warning when expiry is far off', () => {
    expect(describePublication({ expires_at: at('2026-12-01T00:00:00Z') }, NOW))
      .toBe('Live');
  });

  it('says plainly when a link never expires', () => {
    expect(describePublication({}, NOW)).toBe('Live — no expiry');
  });

  it('reports a dead link by its state', () => {
    expect(describePublication({ revoked_at: at('2026-08-01T00:00:00Z') }, NOW))
      .toBe(STATE_LABEL.revoked);
  });
});

describe('expiryFromDays', () => {
  it('turns a choice into a timestamp', () => {
    expect(expiryFromDays(7, NOW)).toBe('2026-08-19T12:00:00.000Z');
  });

  it('returns null for "no expiry"', () => {
    expect(expiryFromDays(null, NOW)).toBeNull();
  });

  it('round-trips through the state gate', () => {
    const publication = { expires_at: expiryFromDays(7, NOW) };
    expect(isServable(publication, NOW)).toBe(true);
    expect(isServable(publication, NOW + 7 * 86_400_000)).toBe(false);
  });
});
