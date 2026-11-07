// src/lib/server/storage/openStoredFile.js
//
// Open a stored file to pass straight on to a browser, a little at a time.
//
// ⛔ A route that serves a file must use this, never getFileStream, which reads the
// WHOLE file into memory. Northflank's container has about 100 MB to spare, and on
// 2026-11-07 opening the 30 MB Spartafire report through the file proxy stopped the
// server for everyone ("Connection refused"). openStoredFile.test.js fails a serving
// route that goes back to it.
//
// A provider without openFileStream still works: its bytes are read whole, as before.

/**
 * @param {import('./storageProvider.js').StorageProvider} provider
 * @param {string} fileId
 * @returns {Promise<{ body: ReadableStream|Uint8Array, size: number|null, mimeType: string }>}
 */
export async function openStoredFile(provider, fileId) {
  if (provider.openFileStream) return provider.openFileStream(fileId);
  const { data, mimeType } = await provider.getFileStream(fileId);
  return { body: data, size: data.length, mimeType };
}
