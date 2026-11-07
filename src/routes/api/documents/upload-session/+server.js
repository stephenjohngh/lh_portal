// /api/documents/upload-session — upload a file too large for one request.
//
// POST starts it, after the same permission check as /api/documents/upload.
// PUT sends one piece, or asks where the upload has got to (X-Upload-Status).
// The last piece answers with a receipt, which /finish turns into a document.
//
// Pieces pass through this server rather than going straight to Google, so this
// needs no change to the site's content security policy and no reliance on how
// Google answers another site. A piece is held in memory only while it is sent.

import { json }                 from '@sveltejs/kit';
import { requireAuth }          from '#lib/server/requireAuth.js';
import { uploadFolderFor }      from '#lib/server/documentLibrary.js';
import { storageProvider }      from '#lib/server/storage/index.js';
import { friendlyStorageError } from '#lib/server/storage/storageErrors.js';
import { canAttachDocument, bearerToken } from '#lib/server/documentAccess.js';
import { serverPolicy }         from '#lib/server/policies.js';
import { makeTicket, readTicket } from '#lib/server/uploadTicket.js';
import { resolveMimeType }      from '#lib/utils/mimeTypes.js';
import { UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_UNIT } from '#lib/utils/uploadChunks.js';

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  if (!storageProvider.startResumableUpload) {
    return json({ error: 'This storage takes a file in one piece.' }, { status: 501 });
  }

  try {
    const { filename, size, mimeType, meta = {} } = await request.json();
    if (!filename || !Number.isSafeInteger(size) || size < 1) {
      return json({ error: 'No file provided' }, { status: 400 });
    }
    const maxMb = await serverPolicy('documentMaxMb');
    if (size > maxMb * 1024 * 1024) {
      return json({ error: `File exceeds the ${maxMb} MB limit` }, { status: 413 });
    }
    const allowed = await canAttachDocument(meta, { isAdmin: auth.isAdmin, token: bearerToken(request) });
    if (!allowed.ok) return json({ error: 'Not permitted.' }, { status: 403 });

    const mime     = resolveMimeType(mimeType, filename);
    const folderId = await uploadFolderFor(meta.folder_path);
    const address  = await storageProvider.startResumableUpload({ filename, mimeType: mime, size, folderId });
    const ticket   = makeTicket('session', {
      userId: auth.user.id, address, filename, mimeType: mime, size, folderId,
      folderPath: meta.folder_path ?? '', entityType: meta.entity_type ?? null, entityId: meta.entity_id ?? null,
    });
    return json({ ticket }, { status: 201 });
  } catch (err) {
    return json({ error: friendlyStorageError(err) }, { status: 500 });
  }
}

export async function PUT({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const session = readTicket(request.headers.get('x-upload-ticket'), 'session', auth.user.id);
  if (!session) return json({ error: 'This upload has expired. Please start it again.' }, { status: 403 });

  try {
    let answer;
    if (request.headers.get('x-upload-status')) {
      answer = await storageProvider.uploadProgress(session.address, session.size);
    } else {
      const offset = Number(request.headers.get('x-upload-offset'));
      const bytes  = new Uint8Array(await request.arrayBuffer());
      const last   = offset + bytes.byteLength === session.size;
      const fits   = Number.isSafeInteger(offset) && offset >= 0 && bytes.byteLength > 0
        && bytes.byteLength <= UPLOAD_CHUNK_BYTES && offset + bytes.byteLength <= session.size
        && (last || bytes.byteLength % UPLOAD_CHUNK_UNIT === 0);
      if (!fits) return json({ error: 'That part of the file does not fit this upload.' }, { status: 400 });
      answer = await storageProvider.sendUploadChunk(session.address, { bytes, offset, total: session.size });
    }

    if (!answer.done) return json({ received: answer.received });
    if (answer.size !== session.size) {
      await storageProvider.deleteFile(answer.fileId);
      return json({ error: 'The stored file is not the size that was sent, so it was removed.' }, { status: 422 });
    }
    const receipt = makeTicket('receipt', {
      userId: auth.user.id, fileId: answer.fileId, sha256: answer.sha256,
      filename: session.filename, mimeType: session.mimeType, size: session.size,
      folderId: session.folderId, folderPath: session.folderPath,
      entityType: session.entityType, entityId: session.entityId,
    });
    return json({ receipt, received: session.size });
  } catch (err) {
    return json({ error: friendlyStorageError(err) }, { status: 502 });
  }
}
