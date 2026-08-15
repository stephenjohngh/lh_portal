// src/routes/api/dossier/archive/[packId]/+server.js
// GET /api/dossier/archive/:packId — the author's offline copy of a pack.
//
// An authoring feature, and deliberately only that. There is no equivalent
// behind a publication token: a recipient reads the pack, prints it, and
// downloads the individual files a page refers to. Handing over the whole pack
// in one request is a different act from reading it.
//
// It archives the LIVE pack rather than a publication, so a pack that has never
// been published can still be kept — which is most of the point of an archive.
//
// Authorisation asks the database rather than re-implementing Dossier's
// owner-scoping: can the CALLER, with their own token, read this pack's row?
// Packs are owner-scoped, so that is the whole test.

import { json }             from '@sveltejs/kit';
import { createClient }     from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }              from '$env/dynamic/private';
import { requireAuth }      from '$lib/server/requireAuth.js';
import { canListDocuments, bearerToken } from '$lib/server/documentAccess.js';
import { checkKeyRateLimit } from '$lib/server/publicRateLimit.js';
import { listDocuments }    from '$lib/server/documentLibrary.js';
import { buildPackArchive } from '$lib/server/packArchiveBuilder.js';

/**
 * The notice that travels with the material — the same words the recipient
 * sees. An archive is precisely the copy most likely to outlive the link and be
 * passed on, so it must not be the copy that arrives without terms.
 */
const CONFIDENTIALITY_NOTICE =
  'This document package contains proprietary and confidential information '
  + 'intended strictly for the designated recipient. Please do not copy, '
  + 'forward, or distribute these materials without prior written consent.';

const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

export async function GET({ params, request }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  // Building a zip reads every file in the pack, so it is metered per user.
  const allowed = await checkKeyRateLimit(`user:${auth.user.id}`, 'pack_archive');
  if (!allowed) {
    return json({ error: 'Too many archive downloads just now. Try again shortly.' },
      { status: 429 });
  }

  const packId = String(params.packId ?? '');
  const permitted = await canListDocuments(
    { entity_type: 'dossier_pack', entity_id: packId },
    { isAdmin: auth.isAdmin, token: bearerToken(request) });
  if (!permitted.ok) return json({ error: permitted.message }, { status: permitted.status });

  // Read with the service role, AFTER the check above has established that this
  // caller may see the pack. Same shape as the publication reader.
  const [{ data: pack }, { data: docs }, { data: datasets }] = await Promise.all([
    db.from('dossier_packs').select('id, title, description').eq('id', packId).maybeSingle(),
    db.from('dossier_docs')
      .select('id, slug, title, parent_doc_id, order_index, blocks')
      .eq('pack_id', packId).order('order_index', { ascending: true }),
    db.from('dossier_datasets').select('id, key, title')
      .eq('pack_id', packId).order('created_at', { ascending: true }),
  ]);

  if (!pack) return json({ error: 'Not found.' }, { status: 404 });

  const datasetIds = (datasets ?? []).map(d => d.id);
  const { data: records } = datasetIds.length
    ? await db.from('dossier_records')
        .select('id, dataset_id, fields, position, document_id, doc_id')
        .in('dataset_id', datasetIds).order('position', { ascending: true })
    : { data: [] };

  const files = await listDocuments({
    entity_type: 'dossier_pack', entity_id: packId,
  }).catch(() => []);

  const result = await buildPackArchive({
    content: {
      pack: { title: pack.title, description: pack.description },
      docs: docs ?? [], datasets: datasets ?? [], records: records ?? [],
    },
    files: (files ?? []).map(f => ({
      document_id:      f.id,
      provider_file_id: f.provider_file_id,
      display_name:     f.display_name,
      filename:         f.filename,
      file_size:        f.file_size,
    })),
    notice: CONFIDENTIALITY_NOTICE,
  });

  if (!result.ok) return json({ error: result.message }, { status: 413 });

  return new Response(result.zip, {
    headers: {
      'Content-Type':   'application/zip',
      'Content-Length': String(result.zip.length),
      'Content-Disposition':
        `attachment; filename="${result.filename.replace(/[^\x20-\x7e]/g, '_')}"; `
        + `filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
