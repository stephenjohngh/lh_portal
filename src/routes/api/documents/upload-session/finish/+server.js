// POST /api/documents/upload-session/finish — turn a finished upload into a document.
//
// The folder, name, size and record come from the signed receipt, not the request.
// The file is removed if it cannot be recorded, so nothing is left in storage with
// no row naming it.

import { json }                 from '@sveltejs/kit';
import { requireAuth }          from '#lib/server/requireAuth.js';
import { recordStoredFile }     from '#lib/server/documentLibrary.js';
import { storageProvider }      from '#lib/server/storage/index.js';
import { friendlyStorageError } from '#lib/server/storage/storageErrors.js';
import { canAttachDocument, bearerToken } from '#lib/server/documentAccess.js';
import { readTicket }           from '#lib/server/uploadTicket.js';

const SHA256 = /^[0-9a-f]{64}$/;

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { receipt, checksum, meta = {} } = await request.json();
  const done = readTicket(receipt, 'receipt', auth.user.id);
  if (!done) return json({ error: 'This upload has expired. Please start it again.' }, { status: 403 });

  const record = {
    display_name:     meta.display_name     || done.filename,
    doc_type:         meta.doc_type         || undefined,
    category:         meta.category         || null,
    title:            meta.title            || null,
    description:      meta.description      || null,
    document_date:    meta.document_date    || null,
    expiry_date:      meta.expiry_date      || null,
    reference_number: meta.reference_number || null,
    issuer:           meta.issuer           || null,
    tags:             Array.isArray(meta.tags) ? meta.tags : [],
    entity_type:      done.entityType,
    entity_id:        done.entityId,
    folder_path:      done.folderPath,
  };

  try {
    const allowed = await canAttachDocument(record, { isAdmin: auth.isAdmin, token: bearerToken(request) });
    if (!allowed.ok) throw Object.assign(new Error('Not permitted.'), { status: 403 });
    if (!SHA256.test(String(checksum)) || (done.sha256 && done.sha256 !== checksum)) {
      throw Object.assign(new Error('The stored file does not match the one sent, so it was removed.'), { status: 422 });
    }
    const doc = await recordStoredFile(
      storageProvider.storedFile(done.fileId, done.folderId),
      { filename: done.filename, mimeType: done.mimeType, size: done.size, checksum },
      record, auth.user.id,
    );
    return json(doc, { status: 201 });
  } catch (/** @type {any} */ err) {
    await storageProvider.deleteFile(done.fileId).catch(() => {});
    return json({ error: err.status ? err.message : friendlyStorageError(err) }, { status: err.status ?? 500 });
  }
}
