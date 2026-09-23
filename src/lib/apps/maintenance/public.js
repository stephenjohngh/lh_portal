// src/lib/apps/maintenance/public.js
//
// PUBLIC INTERFACE of the Maintenance app — the cross-app contract for jobs and
// their certificate documents. Other apps (above all Golden Thread) read/act
// through here instead of touching maintenance_jobs / maintenance_documents.
// Stateless, like the other apps' public.js.

import { api } from '$lib/utils/api';
import { registerExistingArtifact, findDocumentBySource } from '$lib/apps/golden_thread/public.js';

/** Read a maintenance job by id. */
export function getJob(id) {
  return api.getById('maintenance_jobs', id);
}

/**
 * Jobs falling in a date window — what the Planner shows on the year.
 *
 * Read-only by design, and the Planner is told so: a job ticked off in two
 * places is two sources of truth for "done". Completing one stays here, in the
 * app that owns the work.
 *
 * Completed jobs are included, dated by when they were DONE rather than when
 * they were scheduled, because a planner looking back at last spring wants what
 * actually happened.
 *
 * @param {string} from ISO date
 * @param {string} to   ISO date
 */
export async function listScheduledWork(from, to) {
  const rows = await api.getAll('maintenance_jobs', {
    // `title`, not `task_name`: that column belongs to maintenance_regime, and
    // asking PostgREST for it fails the whole request. The Planner catches a
    // failed source and shows the rest, so this went unnoticed — maintenance
    // jobs simply never appeared on the year.
    select: 'id, title, scheduled_date, completed_date, status, contractor_name',
  });

  // Filtered here rather than in the query: a job is placed on the date it was
  // completed when it has one, and PostgREST cannot express "whichever of these
  // two columns is set" without a view.
  return rows.filter((row) => {
    const date = row.completed_date ?? row.scheduled_date;
    return date && date >= from && date <= to;
  });
}

/**
 * Every job, as COMPLIANCE EVIDENCE — what a planned obligation can point at to
 * say it was discharged.
 *
 * ⭐ Why this exists rather than the reader subscribing to `maintenanceStore`:
 * the compliance position report used to live in this app, so it read the
 * store's `jobs` for free. It moved to the Compliance app (C3), which makes
 * this a cross-app read — and the convention is that those go through an
 * accessor here, so that reading this file still tells you every consumer.
 *
 * ⚠ `getAll`, not `get`. `listWalkSessions` carries the same note and the same
 * reason: the report derives "last completed" from these, so a read truncated
 * at PostgREST's 1,000-row cap would print "Never · In breach" against a duty
 * that was genuinely discharged — a silent lie in a document handed to an
 * assessor. There are zero jobs today and 57 of the 80 planned obligations are
 * evidenced this way, so this table is about to stop being small.
 *
 * Columns are named rather than `*`: these are exactly what `jobEventsFromJobs`
 * reads, and a joined-or-narrow select makes an unasked-for field simply absent
 * at the far end instead of silently wrong.
 */
export function listJobEvidence() {
  return api.getAll('maintenance_jobs', {
    select: 'id, title, obligation_id, status, scheduled_date, completed_date, '
          + 'hard_expiry_date, result, engineer_name, contractor_name, '
          + 'reference_number, completion_notes',
  });
}

/**
 * Every certificate with an expiry date, soonest first — for the Planner.
 *
 * The same rows Maintenance's Due work tab reads for its certificate band (M5),
 * so the two cannot disagree about what is expiring. ⚠ Read-only, and the M5
 * decision stands: an expiry does NOT move any job's date.
 *
 * Not windowed below: an expiry that has already passed is the most urgent one.
 *
 * @param {string} to  ISO date — nothing expiring after this is returned
 */
export async function listCertificateExpiries(to) {
  const rows = await api.get('maintenance_documents', {
    select: 'id, filename, doc_type, expiry_date, job:maintenance_jobs(id, title)',
    orderBy: 'expiry_date',
  });
  return (rows ?? []).filter((r) => r.expiry_date && r.expiry_date <= to);
}

/**
 * Create a job from something the Planner was holding.
 *
 * The Planner cannot write `maintenance_jobs` itself, so this is the door — and
 * it is deliberately narrow: one job, on one date, scoped to the building.
 *
 * ⚠ What this changes, and what the caller must tell the user: a planner series
 * is ANCHORED (every March, whatever happened last year), and maintenance
 * scheduling DRIFTS (the next one is due `frequency_days` after this one is
 * completed). Promoting a recurring planner event therefore hands its recurrence
 * to a different set of rules. One job is created here, not a series; a repeating
 * regime is set up in Maintenance, where regimes live.
 *
 * @param {{title: string, description?: string, scheduled_date: string,
 *          contractor_name?: string, source_id: string}} event
 * @param {string} userId
 */
export function createJobFromPlanner(event, userId) {
  return api.create('maintenance_jobs', {
    title:          event.title,
    // The planner event's id is written into the job's description rather than
    // into a column of its own: maintenance_jobs has no notion of a planner, and
    // adding one would put knowledge of the Planner inside Maintenance. The
    // pointer that matters is held the other way round, on planner_events.
    description:    event.description ?? null,
    scheduled_date: event.scheduled_date,
    // Building scope: a planner event describes something the building does,
    // not a component. Narrowing it is a job for Maintenance, which has the
    // asset tree to narrow it against.
    scope_type:     'building',
    scope_label:    'Building',
    status:         'scheduled',
    contractor_name: event.contractor_name ?? null,
    created_by:     userId,
    updated_by:     userId,
  }, true);
}

/** A job's certificate/documents, newest first. */
export function listJobDocuments(jobId) {
  return api.get('maintenance_documents', { filters: { job_id: jobId }, orderBy: 'created_at', ascending: false });
}

// Maintenance doc_type → Golden Thread document_type (Master Document List).
// Falls back to a generic certificate type.
const DOC_TYPE_TO_GT = {
  certificate:   'Test / inspection certificate',
  test:          'Test / inspection certificate',
  inspection:    'Test / inspection certificate',
  service:       'Operation & maintenance (O&M) manual',
  report:        'Test / inspection certificate',
  fire:          'Fire risk assessment',
};
function gtDocumentType(docType) {
  return DOC_TYPE_TO_GT[String(docType ?? '').toLowerCase()] ?? 'Test / inspection certificate';
}

/**
 * Register a maintenance certificate into the Golden Thread register (Stage B).
 * The certificate must live in document_library (library_doc_id set — i.e.
 * uploaded since unified storage). Creates a DRAFT gt_document that copies the
 * certificate file, linked 'produced_by' back to this maintenance_document.
 *
 * @param {string} maintDocId  maintenance_documents.id
 * @param {{ schedule1_category?: number, document_type?: string, title?: string, safety_critical?: boolean }} [opts]
 * @param {string} userId
 * @returns {Promise<object>} the created gt_document draft
 */
export async function registerCertificateToGoldenThread(maintDocId, opts = {}, userId) {
  const doc = await api.getById('maintenance_documents', maintDocId);
  if (!doc?.library_doc_id) {
    throw new Error('This certificate predates unified storage — re-upload it to register it in the Golden Thread.');
  }
  return registerExistingArtifact(
    {
      sourceDocId:        doc.library_doc_id,
      schedule1_category: opts.schedule1_category ?? 10, // "planned maintenance/repairs & inspection reports"
      document_type:      opts.document_type ?? gtDocumentType(doc.doc_type),
      title:              opts.title ?? doc.filename,
      safety_critical:    opts.safety_critical ?? false,
    },
    { producedBy: { type: 'maintenance_document', id: maintDocId } },
    userId,
  );
}

/**
 * The Golden Thread register document produced from a maintenance certificate,
 * or null — drives the "Registered (GT-…)" state and blocks double-registration.
 * @param {string} maintDocId
 */
export function findRegisteredCertificate(maintDocId) {
  return findDocumentBySource('maintenance_document', maintDocId);
}
