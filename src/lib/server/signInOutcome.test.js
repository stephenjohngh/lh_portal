// src/lib/server/signInOutcome.test.js
// Only a wrong password counts towards the lockout and reads as one; every
// other Supabase error says the password was not checked (2026-10-02).

import { describe, it, expect } from 'vitest';
import { signInOutcome, WRONG_CREDENTIALS } from './signInOutcome.js';

describe('signInOutcome', () => {
  it('a wrong password counts, with the generic message', () => {
    const o = signInOutcome({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' });
    expect(o).toMatchObject({ countsAsFailure: true, status: 401, message: WRONG_CREDENTIALS });
  });

  it('recognises a wrong password from older GoTrue, which sends no code', () => {
    expect(signInOutcome({ status: 400, message: 'Invalid login credentials' }).countsAsFailure).toBe(true);
    expect(signInOutcome({ message: 'Invalid login credentials' }).countsAsFailure).toBe(true);
  });

  // The incident: Email provider switched off, every sign-in refused with 422,
  // and the admin told their password was wrong.
  it('email logins switched off: not counted, says so, and says the password was not checked', () => {
    const o = signInOutcome({ status: 422, code: 'email_provider_disabled', message: 'Email logins are disabled' });
    expect(o.countsAsFailure).toBe(false);
    expect(o.message).not.toBe(WRONG_CREDENTIALS);
    expect(o.message).toMatch(/switched off/i);
    expect(o.message).toMatch(/not checked/i);
    expect(o.reason).toBe('email_provider_disabled');
  });

  it('Supabase down or unreachable: not counted, not a wrong password', () => {
    for (const err of [
      { status: 500, code: 'unexpected_failure', message: 'boom' },
      { status: 503, message: 'Service Unavailable' },
      { status: 0, name: 'AuthRetryableFetchError', message: 'fetch failed' },
      new Error('socket hang up'),
      null,
    ]) {
      const o = signInOutcome(err);
      expect(o.countsAsFailure).toBe(false);
      expect(o.status).toBe(503);
      expect(o.message).not.toBe(WRONG_CREDENTIALS);
      expect(o.message).toMatch(/not checked/i);
    }
  });

  it('Supabase rate limiting: not counted, answered as 429', () => {
    const o = signInOutcome({ status: 429, code: 'over_request_rate_limit', message: 'Too many requests' });
    expect(o).toMatchObject({ countsAsFailure: false, status: 429 });
  });

  it('an unconfirmed or disabled account is told so, and not counted', () => {
    expect(signInOutcome({ status: 400, code: 'email_not_confirmed' })).toMatchObject({ countsAsFailure: false, status: 403 });
    expect(signInOutcome({ status: 400, code: 'user_banned' })).toMatchObject({ countsAsFailure: false, status: 403 });
  });

  // The safe direction for anything unrecognised: never lock an owner out for
  // a fault that is not theirs. A guesser's wrong passwords still come back as
  // invalid_credentials and still count.
  it('treats an unrecognised error as not checked rather than as a wrong password', () => {
    const o = signInOutcome({ status: 400, code: 'something_new', message: 'Something new' });
    expect(o.countsAsFailure).toBe(false);
    expect(o.message).toMatch(/something_new/);
  });
});
