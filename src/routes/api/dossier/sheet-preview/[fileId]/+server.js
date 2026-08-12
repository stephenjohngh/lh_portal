// src/routes/api/dossier/sheet-preview/[fileId]/+server.js
// GET /api/dossier/sheet-preview/:fileId — a bounded grid preview of a
// spreadsheet on a pack's shelf. The parse itself is $lib/server/sheetReader.
//
// Why authenticated, unlike /api/media/file: that endpoint serves opaque bytes
// whose id is unguessable, and the caller must already know the id. This one
// EXTRACTS content and returns it as structured JSON, which is a different
// thing to leave open. P3's published packs will need a token-scoped route —
// the same piece of work as the deferred token-scoped asset endpoint, and it
// should import readSheetPreview() rather than duplicate it.

import { json }                 from '@sveltejs/kit';
import { storageProvider }      from '$lib/server/storage/index.js';
import { friendlyStorageError } from '$lib/server/storage/storageErrors.js';
import { requireAuth }          from '$lib/server/requireAuth.js';
import { readSheetPreview, MAX_SHEET_BYTES } from '$lib/server/sheetReader.js';

export async function GET({ params, request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { fileId } = params;
  // The same id guard the media proxy applies; a malformed id never reaches
  // the storage provider.
  if (!fileId || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return json({ error: 'Invalid file ID' }, { status: 400 });
  }

  let data;
  try {
    ({ data } = await storageProvider.getFileStream(fileId));
  } catch (err) {
    console.error('[SheetPreview] fetch failed for', fileId, '—',
      friendlyStorageError(err), err?.code ?? '');
    return json({ error: 'File not found or inaccessible' }, { status: 404 });
  }

  if (data.length > MAX_SHEET_BYTES) {
    return json({ error: 'This spreadsheet is too large to preview.' }, { status: 413 });
  }

  try {
    return json({ preview: await readSheetPreview(data) });
  } catch (err) {
    // .xls and .ods land here: exceljs reads neither. Say so plainly — the
    // block falls back to a file card, which still opens correctly.
    console.error('[SheetPreview] parse failed for', fileId, '—', err?.message ?? err);
    return json(
      { error: 'This file could not be read as a spreadsheet. Try saving it as .xlsx or .csv.' },
      { status: 422 });
  }
}
