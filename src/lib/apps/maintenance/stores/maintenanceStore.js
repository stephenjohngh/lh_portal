// src/lib/apps/maintenance/stores/maintenanceStore.js
// State store for the Maintenance app.
// Tables: maintenance_jobs, maintenance_documents, maintenance_job_components
// Lookup data loaded independently: building_systems, component_types, maintenance_regime

import { writable, get } from 'svelte/store';
import { getLogger }     from '$lib/utils/logger';
import { logAudit }      from '$lib/utils/auditLogger';
import { api }           from '$lib/utils/api';
import { supabase }      from '$lib/supabaseClient';
import { jobRag, addDays, toDateString } from '../utils/maintenanceHelpers.js';

const logger = getLogger('maintenanceStore');

function requireUserId() {
  // Pull auth state from localStorage (same pattern as other stores)
  const raw = localStorage.getItem('sb-' + (import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0] ?? '') + '-auth-token');
  if (raw) {
    try { return JSON.parse(raw)?.user?.id ?? null; } catch { return null; }
  }
  return null;
}

function enrichJob(job) {
  return { ...job, rag: jobRag(job) };
}

function createMaintenanceStore() {
  const { subscribe, update, set } = writable({
    jobs:      [],     // maintenance_jobs enriched with .rag
    docsByJob: {},     // { [jobId]: maintenance_documents[] } — lazy loaded
    systems:   [],     // building_systems
    types:     [],     // component_types
    regime:    [],     // maintenance_regime (flat)
    loading:   false,
    error:     null,
  });

  // ── Load ───────────────────────────────────────────────────────────────────

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      const [jobs, systems, types, regime] = await Promise.all([
        api.get('maintenance_jobs', {
          select:    '*, regime:maintenance_regime(id, task_name, frequency_days, type_id)',
          orderBy:   'scheduled_date',
          ascending: true,
        }),
        api.get('building_systems',  { orderBy: 'name' }),
        api.get('component_types',   { orderBy: 'name' }),
        api.get('maintenance_regime', { orderBy: 'task_name' }),
      ]);

      update(s => ({
        ...s,
        jobs:    jobs.map(enrichJob),
        systems,
        types,
        regime,
        loading: false,
      }));
      logger('✅ Loaded', jobs.length, 'jobs');
    } catch (err) {
      logger('❌ Load failed:', err.message);
      update(s => ({ ...s, loading: false, error: err.message }));
      throw err;
    }
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  async function loadJobDocuments(jobId) {
    const docs = await api.get('maintenance_documents', {
      filters:   { job_id: jobId },
      orderBy:   'created_at',
      ascending: false,
    });
    update(s => ({ ...s, docsByJob: { ...s.docsByJob, [jobId]: docs } }));
    return docs;
  }

  async function uploadDocument(jobId, file, docType, expiryDate = null) {
    const userId = requireUserId();
    const ext    = file.name.split('.').pop().toLowerCase();
    const ts     = Date.now();
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${jobId}/${docType}/${ts}_${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('maintenance-docs')
      .upload(storagePath, file, { contentType: file.type, upsert: false });

    if (uploadErr) throw new Error('Upload failed: ' + uploadErr.message);

    const doc = await api.create('maintenance_documents', {
      job_id:       jobId,
      doc_type:     docType,
      filename:     file.name,
      storage_path: storagePath,
      file_size:    file.size,
      mime_type:    file.type,
      expiry_date:  expiryDate || null,
      uploaded_by:  userId,
    }, true);

    update(s => {
      const existing = s.docsByJob[jobId] ?? [];
      return { ...s, docsByJob: { ...s.docsByJob, [jobId]: [doc, ...existing] } };
    });

    logAudit('create', 'maintenance_document', doc.id, file.name, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
      afterData: { jobId, docType, filename: file.name },
    });

    logger('✅ Uploaded document:', file.name);
    return doc;
  }

  async function deleteDocument(docId, storagePath) {
    const userId = requireUserId();

    await supabase.storage.from('maintenance-docs').remove([storagePath]);
    await api.delete('maintenance_documents', docId);

    update(s => {
      const next = { ...s.docsByJob };
      for (const [jobId, docs] of Object.entries(next)) {
        next[jobId] = docs.filter(d => d.id !== docId);
      }
      return { ...s, docsByJob: next };
    });

    logAudit('delete', 'maintenance_document', docId, storagePath, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
    });
  }

  // ── Job CRUD ───────────────────────────────────────────────────────────────

  async function createJob(data) {
    const userId = requireUserId();
    const job = await api.create('maintenance_jobs', {
      ...data,
      status:     'scheduled',
      created_by: userId,
    }, true);

    const enriched = enrichJob(job);
    update(s => ({
      ...s,
      jobs: [...s.jobs, enriched].sort((a, b) =>
        a.scheduled_date.localeCompare(b.scheduled_date)
      ),
    }));

    logAudit('create', 'maintenance_job', job.id, job.title, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
      afterData: { title: job.title, scheduled_date: job.scheduled_date },
    });

    logger('✅ Created job:', job.title);
    return enriched;
  }

  async function updateJob(id, data) {
    const userId  = requireUserId();
    const updated = await api.update('maintenance_jobs', id, {
      ...data,
      updated_by: userId,
    }, true);

    const enriched = enrichJob(updated);
    update(s => ({
      ...s,
      jobs: s.jobs.map(j => j.id === id ? enriched : j)
        .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    }));

    logAudit('update', 'maintenance_job', id, updated.title, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
      afterData: data,
    });

    logger('✅ Updated job:', id);
    return enriched;
  }

  /**
   * Close a job. If the job has a regime_id, auto-create the next recurrence.
   */
  async function completeJob(id, payload) {
    const userId = requireUserId();
    const {
      result, completedDate, completionNotes,
      contractorName, engineerName, referenceNumber,
      createNextJob = true,
    } = payload;

    const updated = await api.update('maintenance_jobs', id, {
      status:           'completed',
      completed_date:   completedDate,
      result,
      completion_notes: completionNotes  || null,
      contractor_name:  contractorName   || null,
      engineer_name:    engineerName     || null,
      reference_number: referenceNumber  || null,
      updated_by:       userId,
    }, true);

    let nextJob = null;

    // Auto-create next recurrence if linked to a regime
    if (createNextJob && updated.regime_id) {
      const s       = get({ subscribe });
      const regime  = s.regime.find(r => r.id === updated.regime_id);
      if (regime) {
        const nextDate = toDateString(addDays(new Date(completedDate), regime.frequency_days));
        nextJob = await api.create('maintenance_jobs', {
          regime_id:    updated.regime_id,
          scope_type:   updated.scope_type,
          scope_id:     updated.scope_id,
          scope_label:  updated.scope_label,
          title:        updated.title,
          description:  updated.description,
          scheduled_date: nextDate,
          status:       'scheduled',
          created_by:   userId,
        }, true);

        // Link completed job → next job
        await api.update('maintenance_jobs', id, { next_job_id: nextJob.id, updated_by: userId });
        updated.next_job_id = nextJob.id;
        logger('✅ Created next recurrence:', nextDate);
      }
    }

    update(s => {
      const jobs = s.jobs.map(j => j.id === id ? enrichJob(updated) : j);
      if (nextJob) jobs.push(enrichJob(nextJob));
      return { ...s, jobs: jobs.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)) };
    });

    logAudit('update', 'maintenance_job', id, updated.title, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
      afterData: { status: 'completed', result, completedDate },
    });

    logger('✅ Completed job:', id, '| result:', result);
    return enrichJob(updated);
  }

  async function cancelJob(id) {
    const userId  = requireUserId();
    const updated = await api.update('maintenance_jobs', id, {
      status:     'cancelled',
      updated_by: userId,
    }, true);

    update(s => ({ ...s, jobs: s.jobs.map(j => j.id === id ? enrichJob(updated) : j) }));

    logAudit('update', 'maintenance_job', id, updated.title, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
      afterData: { status: 'cancelled' },
    });
    logger('✅ Cancelled job:', id);
  }

  async function reopenJob(id) {
    const userId  = requireUserId();
    const updated = await api.update('maintenance_jobs', id, {
      status:         'scheduled',
      completed_date: null,
      result:         null,
      updated_by:     userId,
    }, true);
    update(s => ({ ...s, jobs: s.jobs.map(j => j.id === id ? enrichJob(updated) : j) }));
    logger('✅ Reopened job:', id);
  }

  async function deleteJob(id) {
    await api.delete('maintenance_jobs', id);
    update(s => ({ ...s, jobs: s.jobs.filter(j => j.id !== id) }));
    logAudit('delete', 'maintenance_job', id, id, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'warn',
    });
    logger('✅ Deleted job:', id);
  }

  return {
    subscribe, load,
    loadJobDocuments, uploadDocument, deleteDocument,
    createJob, updateJob, completeJob, cancelJob, reopenJob, deleteJob,
  };
}

export const maintenanceStore = createMaintenanceStore();
