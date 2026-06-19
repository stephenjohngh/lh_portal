// src/lib/server/storage/storageErrors.js
// Maps low-level storage-provider errors into clear, actionable messages for
// API responses. Google's OAuth layer returns terse codes such as
// `invalid_grant` when the Drive refresh token has expired or been revoked;
// surfaced verbatim these are opaque to users and slow to diagnose. See
// docs/google_drive_storage_setup.md (troubleshooting table).

/**
 * Translate a storage / provider error into a user-facing message.
 * Returns the original message unchanged for unrecognised errors.
 * @param {unknown} err
 * @returns {string}
 */
export function friendlyStorageError(err) {
  const raw = (err && typeof err === 'object' && 'message' in err)
    ? String(/** @type {{ message: unknown }} */ (err).message ?? '')
    : String(err ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('invalid_grant')) {
    return 'Document storage authentication failed — the Google Drive token has '
      + 'expired or been revoked and needs renewing. See '
      + 'docs/google_drive_storage_setup.md (troubleshooting: "invalid_grant").';
  }
  if (lower.includes('invalid_client') || lower.includes('unauthorized_client')) {
    return 'Document storage authentication failed — the Google Drive OAuth client '
      + 'credentials are invalid. See docs/google_drive_storage_setup.md.';
  }
  if (lower.includes('credentials not configured')) {
    return 'Document storage is not configured — no Google Drive credentials are set. '
      + 'See docs/google_drive_storage_setup.md.';
  }
  return raw || 'Unknown storage error';
}
