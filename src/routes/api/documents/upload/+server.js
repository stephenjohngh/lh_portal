// POST /api/documents/upload — upload a file to storage + index it
import { json }                 from '@sveltejs/kit';
import { uploadDocument }       from '$lib/server/documentLibrary';
import { requireAuth }          from '$lib/server/requireAuth';
import { friendlyStorageError } from '$lib/server/storage/storageErrors';
import { resolveMimeType } from '$lib/utils/mimeTypes';

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST({ request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const file     = formData.get('file');

    if (!file || typeof file === 'string') {
      return json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return json({ error: 'File exceeds 50 MB limit' }, { status: 413 });
    }

    const buffer   = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    // Browsers leave File.type empty often enough to matter (no OS
    // association, some drag-and-drop paths, some mobile pickers). Storing the
    // blank as octet-stream is what Drive then records, and what the media
    // proxy later serves — so a good PDF arrives as an anonymous download.
    const mimeType = resolveMimeType(file.type, filename);

    // Metadata from form fields
    const meta = {
      display_name:    formData.get('display_name')    || filename,
      doc_type:        formData.get('doc_type')        || 'other',
      category:        formData.get('category')        || null,
      entity_type:     formData.get('entity_type')     || null,
      entity_id:       formData.get('entity_id')       || null,
      title:           formData.get('title')           || null,
      description:     formData.get('description')     || null,
      document_date:   formData.get('document_date')   || null,
      expiry_date:     formData.get('expiry_date')     || null,
      reference_number:formData.get('reference_number')|| null,
      issuer:          formData.get('issuer')          || null,
      folder_path:     formData.get('folder_path')     || '',
      tags:            JSON.parse(formData.get('tags') || '[]'),
    };

    // Trusted uploader id from verified session, never from form data
    const doc = await uploadDocument(buffer, filename, mimeType, meta, auth.user.id);
    return json(doc, { status: 201 });
  } catch (err) {
    return json({ error: friendlyStorageError(err) }, { status: 500 });
  }
}
