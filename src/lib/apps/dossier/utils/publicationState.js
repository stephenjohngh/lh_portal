// src/lib/apps/dossier/utils/publicationState.js
// Whether a publication link still works — pure, Type-1 testable.
//
// Used in TWO places that must agree exactly: the author's publication list,
// and the public reader's gate. If they ever disagree the author is looking at
// a lie — a link they believe is dead but which still serves a pack, or the
// reverse. That is why this is one function rather than an `if` in each place.
//
// Time is injected everywhere. A gate that reads the clock itself cannot be
// tested at its own boundary, and the boundary is the only interesting part.

/** @typedef {'live'|'expired'|'revoked'} PublicationState */

/**
 * @param {{ revoked_at?: string|null, expires_at?: string|null }} publication
 * @param {Date|number} [now]
 * @returns {PublicationState}
 */
export function publicationState(publication, now = Date.now()) {
  // Revocation beats expiry: a link the author killed deliberately should say
  // so, not report itself as merely lapsed.
  if (publication?.revoked_at) return 'revoked';

  const expires = publication?.expires_at ? new Date(publication.expires_at).getTime() : null;
  if (expires !== null && !Number.isNaN(expires)) {
    // Expiry is inclusive of the instant: at exactly expires_at the link is
    // done. An off-by-one here means a link outliving its stated life.
    if (toMillis(now) >= expires) return 'expired';
  }
  return 'live';
}

function toMillis(now) {
  return now instanceof Date ? now.getTime() : Number(now);
}

/**
 * True only when a reader should be served. The single gate.
 *
 * Fails closed on a missing publication. The reader path passes whatever the
 * token lookup returned, and that is `null` for the most important case of all
 * — a token nobody issued. A gate that reads `null` as "no revocation, no
 * expiry, therefore live" would serve on a made-up link.
 */
export function isServable(publication, now = Date.now()) {
  if (!publication) return false;
  return publicationState(publication, now) === 'live';
}

/**
 * How a state reads to the AUTHOR. The recipient is told far less — see
 * READER_REFUSAL.
 */
export const STATE_LABEL = {
  live:    'Live',
  expired: 'Expired',
  revoked: 'Revoked',
};

export const STATE_BADGE = {
  live:    'bg-green-600',
  expired: 'bg-slate-600',
  revoked: 'bg-red-600',
};

/**
 * What the RECIPIENT is told when a link does not work.
 *
 * Deliberately identical for every cause, including "no such token". A caller
 * probing links must not be able to tell a wrong token from a revoked one from
 * an expired one: the difference confirms that a pack exists, which is exactly
 * the fact an unguessable link is meant to hide.
 */
export const READER_REFUSAL =
  'This link is not available. It may have expired or been withdrawn. '
  + 'Please contact the person who sent it to you.';

/**
 * Days until expiry, or null when it never expires. Negative once past.
 * @param {{ expires_at?: string|null }} publication
 */
export function daysUntilExpiry(publication, now = Date.now()) {
  if (!publication?.expires_at) return null;
  const expires = new Date(publication.expires_at).getTime();
  if (Number.isNaN(expires)) return null;
  return Math.ceil((expires - toMillis(now)) / 86_400_000);
}

/**
 * A short line for the author's list — the state plus what is about to happen.
 *
 * "Expires tomorrow" is the thing an author needs to see without doing date
 * arithmetic; a bare timestamp is not.
 */
export function describePublication(publication, now = Date.now()) {
  const state = publicationState(publication, now);
  if (state !== 'live') return STATE_LABEL[state];

  const days = daysUntilExpiry(publication, now);
  if (days === null) return 'Live — no expiry';
  if (days <= 0)     return 'Expires today';
  if (days === 1)    return 'Expires tomorrow';
  if (days <= 14)    return `Expires in ${days} days`;
  return 'Live';
}

/** Expiry options offered when publishing. Null = never. */
export const EXPIRY_CHOICES = [
  { days: 7,    label: '7 days' },
  { days: 30,   label: '30 days' },
  { days: 90,   label: '90 days' },
  { days: null, label: 'No expiry' },
];

/**
 * Turn a chosen number of days into a timestamp.
 * @param {number|null} days
 * @param {Date|number} [now]
 * @returns {string|null} ISO timestamp, or null for no expiry
 */
export function expiryFromDays(days, now = Date.now()) {
  if (days == null) return null;
  return new Date(toMillis(now) + days * 86_400_000).toISOString();
}
