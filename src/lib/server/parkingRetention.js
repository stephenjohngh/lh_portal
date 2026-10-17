// src/lib/server/parkingRetention.js
// The admin's "Delete outdated records" for Parking (migrations 226, 227).
//
// The rule and its periods live in the database function
// `parking_apply_retention`. ⛔ It no longer runs on a timetable: the nightly
// job was switched off by the user on 2026-09-27 (migration 230), so this
// route is the ONLY way anything is removed. The function cannot remove
// an agreement that still has a signed licence attached, because the licence's
// FILE is in storage, which SQL cannot reach — and deleting only the row would
// strand the file where nothing names it. So this does the part SQL cannot:
//
//   1. ask the function what is due, including the documents in the way
//   2. delete each of those documents, file first, then its row
//   3. the same for unauthorised-parking photos (migration 246): each photo's
//      file, then its media_attachments row
//   4. run the function for real, which now removes those agreements and
//      sightings too
//
// ⛔ A document that fails to delete is left, and so is its agreement: the
// function still sees the row and holds the agreement back. Failing safe means
// keeping personal data longer, never stranding a file.

/**
 * @param {any} db  a SERVICE-ROLE client
 * @param {{ deleteDocument: (id: string) => Promise<void>,
 *           deleteStoredFile: (url: string, provider: string|null) => Promise<{ ok: boolean, error?: string }>,
 *           runBy: string }} deps
 */
export async function runParkingRetention(db, { deleteDocument, deleteStoredFile, runBy }) {
  const due = await call(db, { p_dry_run: true });
  let removed = 0;
  let failed = 0;
  for (const id of due?.documents_due ?? []) {
    try {
      await deleteDocument(id);
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  // A sighting's photos: the file, then the row naming it. ⛔ A file that
  // cannot go keeps its row, so the function keeps the sighting.
  let photosRemoved = 0;
  let photosFailed = 0;
  for (const p of due?.photos_due ?? []) {
    const done = await deleteStoredFile(p.url, p.provider ?? null);
    if (!done.ok) { photosFailed += 1; continue; }
    const { error } = await db.from('media_attachments').delete().eq('id', p.id);
    if (error) photosFailed += 1; else photosRemoved += 1;
  }
  const result = await call(db, { p_dry_run: false, p_run_by: runBy });
  // documents_due and photos_due are lists for this route, not for anybody to read.
  const { documents_due, photos_due, ...counts } = result ?? {};
  return { ...counts, documents_removed: removed, documents_failed: failed,
    photos_removed: photosRemoved, photos_failed: photosFailed };
}

async function call(db, params) {
  const { data, error } = await db.rpc('parking_apply_retention', params);
  if (error) throw new Error(error.message);
  return data;
}
