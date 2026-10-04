// src/routes/api/dossier/sheet-preview/[fileId]/+server.js
// GET /api/dossier/sheet-preview/:fileId — a bounded grid preview of a
// spreadsheet on a pack's shelf. The parse itself is #lib/server/sheetReader.
//
// Authenticated by bearer token, and — since the security review (2026-09-27) —
// only for a caller who may read the DOCUMENT the file belongs to. It EXTRACTS
// content and returns it as structured JSON. Published packs have their own
// token-scoped route; a sheet preview there should import readSheetPreview()
// rather than duplicate it.

import { json }                 from '@sveltejs/kit';
import { ownerOf }              from '#lib/server/storage/index.js';
import { isStorageId }          from '#lib/server/storage/storageRef.js';
import { getDocumentByFileId }  from '#lib/server/documentLibrary.js';
import { canAccessDocument, bearerToken } from '#lib/server/documentAccess.js';
import { friendlyStorageError } from '#lib/server/storage/storageErrors.js';
import { requireAuth }          from '#lib/server/requireAuth.js';
import { readSheetPreview, MAX_SHEET_BYTES } from '#lib/server/sheetReader.js';

export async function GET({ params, request, url }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { fileId } = params;
  // Which storage holds it comes from the document's row. A file id that is
  // not in the library is not a shelf file, and is not read.
  // ⛔ And the caller must be able to read THAT document (security review,
  // 2026-09-27) — it used to be enough that the file was in the library at
  // all, which let any signed-in user preview a parking licence spreadsheet.
  let provider;
  try {
    const doc = await getDocumentByFileId(String(fileId ?? ''));
    if (!doc) return json({ error: 'File not found or inaccessible' }, { status: 404 });
    const allowed = await canAccessDocument(doc, { isAdmin: auth.isAdmin, token: bearerToken(request) });
    if (!allowed.ok) return json({ error: 'File not found or inaccessible' }, { status: 404 });
    provider = doc.provider;
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
