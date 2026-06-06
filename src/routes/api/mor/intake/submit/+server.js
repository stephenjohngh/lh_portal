// src/routes/api/mor/intake/submit/+server.js
// POST /api/mor/intake/submit
//
// Unauthenticated case creation endpoint for the public MOR intake form.
// Creates a mor_cases row (status: submitted, channel: online, created_by: null)
// and media_attachments rows for any uploaded photos.
//
// Body (JSON):
//   description       string  (required, min 20 chars)
//   location_text     string  (optional)
//   urgency           boolean (optional, default false)
//   is_anonymous      boolean (optional, default false)
//   reporter_name     string  (optional)
//   reporter_contact  string  (optional)
//   photo_urls        string[] (optional, URLs from /api/mor/intake/upload)
//
// Returns: { success: true, reference: 'MOR-2026-000001' }

import { json }               from '@sveltejs/kit';
import { createClient }       from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }      from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { checkRateLimit }     from '$lib/server/publicRateLimit.js';
import { getLogger }          from '$lib/utils/logger';

const logger = getLogger('mor/intake/submit');

// Service role client — bypasses RLS for case creation
let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

/** Generate the next MOR-YYYY-NNNNNN reference (same logic as morStore.js) */
async function generateReference(svc) {
  const year = new Date().getFullYear();
  const { count, error } = await svc
    .from('mor_cases')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${year}-01-01T00:00:00Z`)
    .lt('created_at',  `${year + 1}-01-01T00:00:00Z`);
  if (error) throw error;
  return `MOR-${year}-${String((count ?? 0) + 1).padStart(6, '0')}`;
}

export async function POST({ request }) {

  // ── Rate limiting ────────────────────────────────────────────────────────
  const allowed = await checkRateLimit(request, 'case_submit');
  if (!allowed) {
    return json(
      { error: 'Too many submissions. Please wait before trying again.' },
      { status: 429 }
    );
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const {
    description,
    location_text  = null,
    urgency        = false,
    is_anonymous   = false,
    reporter_name  = null,
    reporter_contact = null,
    photo_urls     = [],
  } = body ?? {};

  // ── Validate ─────────────────────────────────────────────────────────────
  if (!description || typeof description !== 'string' || description.trim().length < 20) {
    return json(
      { error: 'Please provide a description of at least 20 characters.' },
      { status: 400 }
    );
  }
  if (photo_urls.length > 5) {
    return json({ error: 'Maximum 5 photos per report.' }, { status: 400 });
  }

  const svc = getSvc();
  const now = new Date().toISOString();

  // ── Create case ───────────────────────────────────────────────────────────
  let reference;
  try {
    reference = await generateReference(svc);
  } catch (err) {
    logger('❌ generateReference failed:', err.message);
    return json({ error: 'Could not create case. Please try again.' }, { status: 500 });
  }

  let caseRow;
  try {
    const { data, error } = await svc
      .from('mor_cases')
      .insert({
        reference,
        status:             'submitted',
        mechanism:          'unknown',
        urgency:            urgency === true,
        description:        description.trim(),
        location_text:      location_text?.trim() || null,
        channel:            'online',
        reporter_type:      is_anonymous ? 'anonymous' : 'resident',
        reporter_name:      is_anonymous ? null : (reporter_name?.trim() || null),
        reporter_contact:   is_anonymous ? null : (reporter_contact?.trim() || null),
        is_anonymous:       is_anonymous === true,
        identification_date: now,
        received_date:      now,
        created_at:         now,
        updated_at:         now,
        created_by:         null, // anonymous public submission
        updated_by:         null,
      })
      .select('id, reference')
      .single();

    if (error) throw error;
    caseRow = data;
  } catch (err) {
    logger('❌ mor_cases insert failed:', err.message);
    return json({ error: 'Could not create case. Please try again.' }, { status: 500 });
  }

  // ── Create media_attachments for photos ──────────────────────────────────
  if (photo_urls.length > 0) {
    const photoRows = photo_urls.map(url => ({
      entity_type:      'mor_case',
      entity_id:        caseRow.id,
      storage_url:      url,
      mime_type:        'image/jpeg',
      created_at:       now,
      created_by:       null,
    }));
    const { error: pErr } = await svc.from('media_attachments').insert(photoRows);
    if (pErr) logger('⚠ media_attachments insert failed:', pErr.message);
    // Non-fatal — case is already created; photos can be re-attached manually
  }

  // ── Timeline entry ────────────────────────────────────────────────────────
  await svc.from('mor_timeline_entries').insert({
    case_id:     caseRow.id,
    entry_type:  'status_change',
    content:     `Case submitted via public intake form.${photo_urls.length > 0 ? ` ${photo_urls.length} photo(s) attached.` : ''}`,
    author_id:   null,
    author_name: 'Public submission',
    from_status: null,
    to_status:   'submitted',
    created_at:  now,
  });

  logger('✅ Public MOR case created:', reference);

  return json({ success: true, reference });
}
