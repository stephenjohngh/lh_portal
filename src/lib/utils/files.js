// src/lib/utils/files.js
// Shared file-related formatting helpers used by multiple apps.

/**
 * Format a byte count into a human-readable string.
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
export function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k     = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Return a simple emoji icon character for a MIME type.
 * @param {string|null|undefined} mimeType
 * @returns {string}
 */
export function mimeIcon(mimeType) {
  if (!mimeType)                                                  return '📎';
  if (mimeType === 'application/pdf')                             return '📄';
  if (mimeType.startsWith('image/'))                              return '🖼';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel'))   return '📊';
  if (mimeType.startsWith('text/'))                               return '📃';
  return '📎';
}
