// POST /api/golden-thread/share-pack
// Generate a regulator-ready BSR share pack (ZIP) of the CURRENT register:
// every current gt_document's file(s) under files/<reference>/, plus a
// manifest.json (with stored + recomputed SHA-256 checksums) and a README.
//
// Admin-only (a whole-register export is a governance action). Builds the ZIP
// in memory — fine for a single building's register; revisit streaming if a
// register ever grows very large. The user must have GT access; admin is the
// stricter gate here.

import { json }          from '@sveltejs/kit';
import { Buffer }        from 'node:buffer';
import { createHash }    from 'node:crypto';
import { createClient }  from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env }           from '$env/dynamic/private';
import { requireAdmin }  from '$lib/server/requireAuth';
import { storageProvider } from '$lib/server/storage/index.js';
import { buildZip }      from '$lib/server/zip.js';
import { buildManifest, renderReadme, packPath } from '$lib/server/gtSharePack.js';
import { getLogger }     from '$lib/utils/logger';

const logger = getLogger('GtSharePack');
const db = createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY ?? '');

export async function POST({ request }) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  try {
    // Current register documents, reference order.
    const { data: docs, error: dErr } = await db
      .from('gt_documents')
      .select('id, reference, title, document_type, schedule1_category, status, effective_from, review_due, safety_critical, file_checksum')
      .eq('status', 'current')
      .order('reference', { ascending: true });
    if (dErr) throw dErr;

    const ids = (docs ?? []).map((d) => d.id);

    // Their attached files (shared document_library, entity_type='gt_document').
    const libByDoc = new Map();
    if (ids.length) {
      const { data: lib, error: lErr } = await db
        .from('document_library')
        .select('id, entity_id, provider_file_id, filename, mime_type, file_checksum')
        .eq('entity_type', 'gt_document')
        .in('entity_id', ids);
      if (lErr) throw lErr;
      for (const row of lib ?? []) {
        const arr = libByDoc.get(row.entity_id) ?? [];
        arr.push(row);
        libByDoc.set(row.entity_id, arr);
      }
    }

    // Schedule-1 completeness (applicable categories) for the manifest/README.
    const { data: cats } = await db
      .from('gt_schedule1_categories')
      .select('code, name')
      .eq('applicable', true)
      .order('code', { ascending: true });
    const countByCat = new Map();
    for (const d of docs ?? []) countByCat.set(d.schedule1_category, (countByCat.get(d.schedule1_category) ?? 0) + 1);
    const completeness = (cats ?? []).map((c) => {
      const currentCount = countByCat.get(c.code) ?? 0;
      return { code: c.code, name: c.name, currentCount, satisfied: currentCount > 0 };
    });

    // Fetch each file, checksum it, and collect zip entries + manifest rows.
    const seen = new Set();
    /** @type {Array<{name:string,data:Buffer}>} */
    const fileEntries  = [];
    const manifestDocs = [];
    for (const d of docs ?? []) {
      const files = [];
      for (const l of (libByDoc.get(d.id) ?? [])) {
        const path = packPath(d.reference, l.filename ?? `${d.reference}.bin`, seen);
        try {
          const { data } = await storageProvider.getFileStream(l.provider_file_id);
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const computed = createHash('sha256').update(buf).digest('hex');
          const stored   = l.file_checksum ?? d.file_checksum ?? null;
          fileEntries.push({ name: path, data: buf });
          files.push({
            path,
            filename: l.filename,
            mime_type: l.mime_type,
            size_bytes: buf.length,
            stored_checksum: stored,
            computed_checksum: computed,
            checksum_ok: stored ? stored === computed : null,
          });
        } catch (err) {
          logger('file fetch failed:', l.provider_file_id, err instanceof Error ? err.message : String(err));
          files.push({ path, filename: l.filename, error: 'file could not be retrieved' });
        }
      }
      manifestDocs.push({ document: d, files });
    }

    const generatedAt = new Date().toISOString();
    const manifest = buildManifest({
      generatedAt,
      generatedBy: auth.user.email,
      documents: manifestDocs,
      completeness,
    });

    const zip = buildZip([
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') },
      { name: 'README.txt',    data: Buffer.from(renderReadme(manifest), 'utf8') },
      ...fileEntries,
    ]);

    const stamp = generatedAt.slice(0, 10);
    return new Response(zip, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="golden-thread-share-pack-${stamp}.zip"`,
        'Content-Length': String(zip.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    logger('share pack failed:', err instanceof Error ? err.message : String(err));
    return json({ error: err instanceof Error ? err.message : 'Share pack generation failed' }, { status: 500 });
  }
}
