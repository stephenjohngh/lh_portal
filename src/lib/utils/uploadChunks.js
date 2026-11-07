// src/lib/utils/uploadChunks.js
//
// The size of one piece of a large upload. Pure: the browser and the server share it.
//
// 3 MiB, for two reasons:
//   · Netlify caps a request at 6 MB, and a binary body travels there as base64,
//     which adds a third. 3 MiB goes as about 4 MB.
//   · Google Drive needs every piece but the last to be a multiple of 256 KiB.

export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

/** Drive's unit for the pieces of a resumable upload. */
export const UPLOAD_CHUNK_UNIT = 256 * 1024;

/** A file's SHA-256, so the server can tell every byte arrived. @param {Blob} file */
export async function sha256Hex(file) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
