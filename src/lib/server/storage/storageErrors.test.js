// src/lib/server/storage/storageErrors.test.js
//
// Characterisation tests for the storage-error translator.
//
// These pin BEHAVIOUR, not wording: each case asserts that a given provider
// error is recognised and that the message points at the runbook, rather than
// asserting the sentence verbatim — otherwise improving the wording breaks the
// suite for no reason. What must not change is that an opaque OAuth code never
// reaches a user unexplained, which is the whole reason this module exists.

import { describe, it, expect } from 'vitest';
import { friendlyStorageError } from './storageErrors.js';

describe('friendlyStorageError', () => {
  it('explains invalid_grant, the one that actually happens', () => {
    // Drive's refresh token expiring is the common real failure, and
    // `invalid_grant` on its own tells a user nothing.
    const msg = friendlyStorageError(new Error('invalid_grant'));
    expect(msg).toMatch(/expired or been revoked/i);
    expect(msg).toContain('google_drive_storage_setup.md');
  });

  it('explains a bad OAuth client, both spellings Google uses', () => {
    for (const code of ['invalid_client', 'unauthorized_client']) {
      const msg = friendlyStorageError(new Error(code));
      expect(msg).toMatch(/credentials are invalid/i);
      expect(msg).toContain('google_drive_storage_setup.md');
    }
  });

  it('explains missing credentials', () => {
    const msg = friendlyStorageError(new Error('Credentials not configured'));
    expect(msg).toMatch(/not configured/i);
  });

  it('matches case-insensitively and inside a longer message', () => {
    // Providers wrap their codes in prose; the match must survive that.
    const msg = friendlyStorageError(new Error('Request failed: INVALID_GRANT (400)'));
    expect(msg).toMatch(/expired or been revoked/i);
  });

  it('passes an unrecognised message through unchanged', () => {
    // Deliberate: inventing an explanation for an error we do not recognise
    // would be worse than showing the original.
    expect(friendlyStorageError(new Error('Disk quota exceeded')))
      .toBe('Disk quota exceeded');
  });

  it('never returns an empty string, whatever it is handed', () => {
    // The caller puts this straight into an API response, so a blank message
    // would surface as a failure with no stated reason.
    for (const input of [null, undefined, '', new Error(''), {}, 0]) {
      expect(friendlyStorageError(input).length).toBeGreaterThan(0);
    }
  });

  it('accepts a plain string as well as an Error', () => {
    expect(friendlyStorageError('invalid_grant')).toMatch(/expired or been revoked/i);
  });

  it('does not throw on an object with a non-string message', () => {
    expect(() => friendlyStorageError({ message: { nested: true } })).not.toThrow();
  });
});
