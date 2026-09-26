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
import { ownerOf }              from '$lib/server/storage/index.js';
import { isStorageId }          from '$lib/server/storage/storageRef.js';
import { providersForFileIds } from '$lib/server/documentLibrary.js';
import { friendlyStorageError } from '$lib/server/storage/storageErrors.js';
import { requireAuth }          from '$lib/server/requireAuth.js';
import { readSheetPreview, MAX_SHEET_BYTES } from '$lib/server/sheetReader.js';

export async function GET({ params, request, url }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { fileId } = params;
  // Which storage holds it comes from the document's row. A file id that is
  // not in the library is not a shelf file, and is not read.
  let provider;
  try {
    const owners = await providersForFileIds([String(fileId ?? '')]);
    if (!owners.has(fileId)) return json({ error: 'File not found or inaccessible' }, { status: 404 });
    provider = owners.get(fileId);
  } catch {
    return json({ error: 'File not found or inaccessible' }, { status: 404 });
  }
  // A malformed id never reaches the storage provider.
  if (!isStorageId(fileId, provider)) {
    return json({ error: 'Invalid file ID' }, { status: 400 });
  }

  let data;
  try {
    ({ data } = await ownerOf(provider).getFileStream(fileId));
  } catch (err) {
    console.error('[SheetPreview] fetch failed for', fileId, '—',
      friendlyStorageError(err), err?.code ?? '');
    return json({ error: 'File not found or inaccessible' }, { status: 404 });
  }

  if (data.length > MAX_SHEET_BYTES) {
    return json({ error: 'This spreadsheet is too large to preview.' }, { status: 413 });
  }

  try {
    return json({
      preview: await readSheetPreview(data, { rows: url.searchParams.get('rows') }),
    });
  } catch (err) {
    // .xls and .ods land here: exceljs reads neither. Say so plainly — the
    // block falls back to a file card, which still opens correctly.
    console.error('[SheetPreview] parse failed for', fileId, '—', err?.message ?? err);
    return json(
      { error: 'This file could not be read as a spreadsheet. Try saving it as .xlsx or .csv.' },
      { status: 422 });
  }
}
