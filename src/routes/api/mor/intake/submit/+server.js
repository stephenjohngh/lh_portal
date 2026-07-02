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
//   photos            { url, mimeType }[]  (optional, from /api/mor/intake/upload)
//
// Returns: { success: true, reference: 'MOR-2026-000001' }

import { json }                       from '@sveltejs/kit';
import { createClient }               from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL }        from '$env/static/public';
import { env } from '$env/dynamic/private';
import { checkRateLimit }             from '$lib/server/publicRateLimit.js';
import { isSameOrigin,
         isTrustedStorageUrl }        from '$lib/server/verifyOrigin.js';
import { verifyUrlSignature }         from '$lib/server/urlSignature.js';
import { generateVerificationCode,
         formatVerificationCode }      from '$lib/utils/morVerificationCode';
import { logAudit,
         getIpAddress,
         getUserAgent }                from '$lib/server/auditLogger';
import { getLogger }                  from '$lib/utils/logger';

const logger = getLogger('mor/intake/submit');

const MAX_PHOTOS = 5;

let _svc = null;
function getSvc() {
  _svc ??= createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return _svc;
}

export async function POST({ request, url }) {

  // ── Same-origin / Referer check ─────────────────────────────────────────
  if (!isSameOrigin(request, url)) {
    logger('Cross-origin submit rejected');
    return json({ error: 'Cross-origin requests are not permitted.' }, { status: 403 });
  }

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
    location_text    = null,
    urgency          = false,
    is_anonymous     = false,
    reporter_name    = null,
    reporter_contact = null,
    photos           = [],
  } = body ?? {};

  // ── Validate description ─────────────────────────────────────────────────
  if (!description || typeof description !== 'string' || description.trim().length < 20) {
    return json(
      { error: 'Please provide a description of at least 20 characters.' },
      { status: 400 }
    );
  }

  // ── Validate photos array shape and URLs ─────────────────────────────────
  if (!Array.isArray(photos)) {
    return json({ error: 'Invalid photos field.' }, { status: 400 });
  }
  if (photos.length > MAX_PHOTOS) {
    return json({ error: `Maximum ${MAX_PHOTOS} photos per report.` }, { status: 400 });
  }
  const cleanPhotos = [];
  for (const p of photos) {
    if (!p || typeof p !== 'object') continue;
    const photoUrl  = typeof p.url === 'string' ? p.url : '';
    const mimeType  = typeof p.mimeType === 'string' ? p.mimeType : 'image/jpeg';
    // Two gates (M4): the host must belong to a storage provider, AND the URL
    // must carry the HMAC our upload endpoint issued — so only files that went
    // through the upload pipeline (size cap, magic bytes, SafeSearch) can be
    // attached, not merely anything Google-hosted.
    if (!isTrustedStorageUrl(photoUrl) || !verifyUrlSignature(photoUrl, p.sig)) {
      logger('⚠ Rejected unverified photo URL on intake');
      return json(
        { error: 'One of the photo references could not be verified. Please re-upload.' },
        { status: 400 }
      );
    }
    cleanPhotos.push({ url: photoUrl, mimeType });
  }

  const svc = getSvc();
  const now = new Date().toISOString();

  // Verification code paired with the reference for the public status page.
  const verificationCode = generateVerificationCode();

  // ── Insert case ──────────────────────────────────────────────────────────
  // `reference` is omitted — the DB DEFAULT (mor_next_reference(), migration
  // 150) stamps MOR-YYYY-NNNNNN atomically, GT-style; the old client-side
  // count(*)+1 raced under concurrent submissions (M3).
  let caseRow;
  try {
    const { data, error } = await svc
      .from('mor_cases')
      .insert({
        verification_code:   verificationCode,
        status:              'submitted',
        mechanism:           'unknown',
        urgency:             urgency === true,
        description:         description.trim(),
        location_text:       typeof location_text === 'string' ? (location_text.trim() || null) : null,
        channel:             'online',
        // Public submissions default to 'unknown' so triage staff can
        // re-classify accurately — not every public reporter is a resident.
        reporter_type:       is_anonymous ? 'anonymous' : 'unknown',
        reporter_name:       is_anonymous ? null : (typeof reporter_name === 'string' ? (reporter_name.trim() || null) : null),
        reporter_contact:    is_anonymous ? null : (typeof reporter_contact === 'string' ? (reporter_contact.trim() || null) : null),
        is_anonymous:        is_anonymous === true,
        identification_date: now,
        received_date:       now,
        created_at:          now,
        updated_at:          now,
        created_by:          null,
        updated_by:          null,
      })
      .select('id, reference')
      .single();

    if (error) throw error;
    caseRow = data;
  } catch (err) {
    logger('❌ mor_cases insert failed:', err.message);
    return json({ error: 'Could not create case. Please try again.' }, { status: 500 });
  }

  // ── Attach photos (media_attachments) — best-effort ──────────────────────
  if (cleanPhotos.length > 0) {
    const photoRows = cleanPhotos.map(p => ({
      entity_type: 'mor_case',
      entity_id:   caseRow.id,
      storage_url: p.url,
      mime_type:   p.mimeType,
      created_at:  now,
      created_by:  null,
    }));
    const { error: pErr } = await svc.from('media_attachments').insert(photoRows);
    if (pErr) logger('⚠ media_attachments insert failed:', pErr.message);
    // Non-fatal — the case row already exists.
  }

  // ── Append timeline entry ────────────────────────────────────────────────
  try {
    const { error: tErr } = await svc.from('mor_timeline_entries').insert({
      case_id:     caseRow.id,
      entry_type:  'status_change',
      content:     `Case submitted via public intake form.${
                     cleanPhotos.length > 0 ? ` ${cleanPhotos.length} photo(s) attached.` : ''
                   }`,
      author_id:   null,
      author_name: 'Public submission',
      from_status: null,
      to_status:   'submitted',
      created_at:  now,
    });
    if (tErr) logger('⚠ timeline insert failed:', tErr.message);
  } catch (err) {
    logger('⚠ timeline insert exception:', err.message);
  }

  // ── Server-side audit log entry ──────────────────────────────────────────
  // userId is null (anonymous), but userEmail is required by logAudit so we
  // pass a synthetic sentinel that the audit-log viewer can recognise.
  await logAudit({
    userId:        null,
    userEmail:     'public-intake@mor.local',
    ipAddress:     getIpAddress(request),
    userAgent:     getUserAgent(request),
    eventType:     'create',
    eventCategory: 'mor',
    eventAction:   'public_intake',
    targetType:    'mor_case',
    targetId:      caseRow.id,
    targetName:    caseRow.reference,
    appId:         'mor',
    changes:       { after: { reference: caseRow.reference, channel: 'online', is_anonymous: !!is_anonymous } },
    severity:      'info',
  });

  logger('✅ Public MOR case created:', caseRow.reference);

  return json({
    success:           true,
    reference:         caseRow.reference,   // stamped by the DB DEFAULT
    verificationCode:  formatVerificationCode(verificationCode), // pretty form for display
  });
}
