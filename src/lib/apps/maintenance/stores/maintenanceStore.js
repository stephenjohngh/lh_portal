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
  const { subscribe, update } = writable({
    jobs:          [],    // maintenance_jobs enriched with .rag
    allDocs:       [],    // ALL maintenance_documents with job info embedded
    docsByJob:     {},    // { [jobId]: maintenance_documents[] } — lazy per-job cache
    jobComponents: {},    // { [jobId]: maintenance_job_components[] }
    systems:       [],    // building_systems
    types:         [],    // component_types
    regime:        [],    // maintenance_regime (flat)
    contractors:   [],    // profiles[] where is_contractor=true (for job assignment)
    isContractor:  false, // true when the current user is a contractor
    loading:       false,
    error:         null,
  });

  // ── Load ───────────────────────────────────────────────────────────────────

  async function load() {
    update(s => ({ ...s, loading: true, error: null }));
    try {
      // Detect current user's contractor status
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      let isContractor = false;
      if (userId) {
        try {
          const profile = await api.getById('profiles', userId, 'is_contractor');
          isContractor = profile?.is_contractor ?? false;
        } catch { /* profile fetch failure is non-fatal */ }
      }

      const [jobs, systems, types, regime, allDocs, contractors] = await Promise.all([
        api.get('maintenance_jobs', {
          select:    '*, regime:maintenance_regime(id, task_name, frequency_days, type_id)',
          orderBy:   'scheduled_date',
          ascending: true,
        }),
        api.get('building_systems',  { orderBy: 'name' }),
        api.get('component_types',   { orderBy: 'name' }),
        api.get('maintenance_regime', { orderBy: 'task_name' }),
        api.get('maintenance_documents', {
          select:    '*, job:maintenance_jobs(id, title, scope_label, scheduled_date)',
          orderBy:   'created_at',
          ascending: false,
        }),
        // Contractor profiles for job assignment selector
        api.get('profiles', {
          select:    'id, full_name, email',
          filters:   { is_contractor: true },
          orderBy:   'full_name',
        }).catch(() => []),   // graceful fallback if column not yet migrated
      ]);

      update(s => ({
        ...s,
        jobs:         jobs.map(enrichJob),
        allDocs,
        systems,
        types,
        regime,
        contractors,
        isContractor,
        loading: false,
      }));
      logger('✅ Loaded', jobs.length, 'jobs,', allDocs.length, 'docs,', contractors.length, 'contractors');
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
    const userId  = requireUserId();
    const ts      = Date.now();
    const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
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

    // Enrich with job context for allDocs
    const s       = get({ subscribe });
    const jobInfo = s.jobs.find(j => j.id === jobId);
    const enriched = {
      ...doc,
      job: jobInfo
        ? { id: jobInfo.id, title: jobInfo.title, scope_label: jobInfo.scope_label, scheduled_date: jobInfo.scheduled_date }
        : null,
    };

    update(st => ({
      ...st,
      docsByJob: { ...st.docsByJob, [jobId]: [doc, ...(st.docsByJob[jobId] ?? [])] },
      allDocs:   [enriched, ...st.allDocs],
    }));

    logAudit('create', 'maintenance_document', doc.id, file.name, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
      afterData: { jobId, docType, filename: file.name },
    });

    logger('✅ Uploaded document:', file.name);
    return doc;
  }

  async function deleteDocument(docId, storagePath) {
    await supabase.storage.from('maintenance-docs').remove([storagePath]);
    await api.delete('maintenance_documents', docId);

    update(s => {
      const nextByJob = { ...s.docsByJob };
      for (const [jid, docs] of Object.entries(nextByJob)) {
        nextByJob[jid] = docs.filter(d => d.id !== docId);
      }
      return {
        ...s,
        docsByJob: nextByJob,
        allDocs:   s.allDocs.filter(d => d.id !== docId),
      };
    });

    logAudit('delete', 'maintenance_document', docId, storagePath, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
    });
  }

  // ── Job components ─────────────────────────────────────────────────────────

  async function loadJobComponents(jobId) {
    const comps = await api.get('maintenance_job_components', {
      select:  '*, component:components(id, asset_id, name, label, type_code)',
      filters: { job_id: jobId },
      orderBy: 'created_at',
    });
    update(s => ({ ...s, jobComponents: { ...s.jobComponents, [jobId]: comps } }));
    return comps;
  }

  async function saveJobComponents(jobId, components) {
    // Delete existing, then re-insert all non-empty results
    await api.deleteMany('maintenance_job_components', { job_id: jobId });

    const rows = components
      .filter(c => c.result)
      .map(c => ({
        job_id:       jobId,
        component_id: c.component_id,
        result:       c.result,
        notes:        c.notes?.trim() || null,
      }));

    if (rows.length > 0) {
      await api.createMany('maintenance_job_components', rows, false);
    }

    await loadJobComponents(jobId);
    logger('✅ Saved', rows.length, 'component results for job', jobId);
  }

  /**
   * Load components in scope for per-component result entry.
   * Returns an array — does NOT update the store.
   */
  async function loadScopeComponents(scopeType, scopeId) {
    if (!scopeId || scopeType === 'building' || scopeType === 'component') return [];
    const filterKey = scopeType === 'system' ? 'system_id' : 'type_id';
    return api.get('components', {
      select:  'id, asset_id, name, label, type_code, primary_attribute',
      filters: { [filterKey]: scopeId },
      orderBy: 'asset_id',
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
   * Close a job.
   * payload.nextJobDate (string YYYY-MM-DD) overrides the calculated recurrence date.
   * payload.components ([{component_id, result, notes}]) saves per-component results.
   */
  async function completeJob(id, payload) {
    const userId = requireUserId();
    const {
      result, completedDate, completionNotes,
      contractorName, engineerName, referenceNumber,
      createNextJob = true,
      nextJobDate   = null,   // hard expiry override (YYYY-MM-DD)
      components    = [],     // per-component results
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

    // Save per-component results if provided
    if (components.length > 0) {
      await saveJobComponents(id, components);
    }

    let nextJob = null;
    if (createNextJob && updated.regime_id) {
      const s      = get({ subscribe });
      const regime = s.regime.find(r => r.id === updated.regime_id);
      if (regime) {
        const calculatedDate = toDateString(addDays(new Date(completedDate + 'T00:00:00'), regime.frequency_days));
        const scheduledDate  = nextJobDate || calculatedDate;

        nextJob = await api.create('maintenance_jobs', {
          regime_id:      updated.regime_id,
          scope_type:     updated.scope_type,
          scope_id:       updated.scope_id,
          scope_label:    updated.scope_label,
          title:          updated.title,
          description:    updated.description,
          scheduled_date: scheduledDate,
          status:         'scheduled',
          created_by:     userId,
        }, true);

        await api.update('maintenance_jobs', id, { next_job_id: nextJob.id, updated_by: userId });
        updated.next_job_id = nextJob.id;
        logger('✅ Created next recurrence:', scheduledDate);
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
    update(s => ({
      ...s,
      jobs:    s.jobs.filter(j => j.id !== id),
      allDocs: s.allDocs.filter(d => d.job?.id !== id),
    }));
    logAudit('delete', 'maintenance_job', id, id, {
      appId: 'maintenance', eventCategory: 'maintenance', severity: 'warn',
    });
    logger('✅ Deleted job:', id);
  }

  // ── Bulk job generator ─────────────────────────────────────────────────────

  /**
   * Generate jobs for selected regimes within a date range.
   * selections: [{ regime_id, title, scope_type, scope_id, scope_label }]
   * fromDate / toDate: YYYY-MM-DD strings
   * Skips dates where a job for that regime + scope already exists.
   */
  async function generateJobs(selections, fromDate, toDate) {
    const userId  = requireUserId();
    const created = [];
    const s       = get({ subscribe });

    for (const sel of selections) {
      const regime = s.regime.find(r => r.id === sel.regime_id);
      if (!regime) continue;

      // All existing scheduled_dates for this regime+scope combo
      const existingDates = new Set(
        s.jobs
          .filter(j =>
            j.regime_id   === sel.regime_id  &&
            j.scope_type  === sel.scope_type &&
            j.scope_id    === (sel.scope_id ?? null)
          )
          .map(j => j.scheduled_date)
      );

      // Start from fromDate, or from day after the last existing job's date
      const existingArr = [...existingDates].sort();
      let nextDate = fromDate;
      if (existingArr.length > 0) {
        const afterLast = toDateString(
          addDays(new Date(existingArr[existingArr.length - 1] + 'T00:00:00'), regime.frequency_days)
        );
        if (afterLast > nextDate) nextDate = afterLast;
      }

      while (nextDate <= toDate) {
        if (!existingDates.has(nextDate)) {
          const job = await api.create('maintenance_jobs', {
            regime_id:      sel.regime_id,
            scope_type:     sel.scope_type,
            scope_id:       sel.scope_id || null,
            scope_label:    sel.scope_label,
            title:          sel.title || regime.task_name,
            status:         'scheduled',
            scheduled_date: nextDate,
            created_by:     userId,
          }, true);
          created.push(enrichJob(job));
          existingDates.add(nextDate);
        }
        nextDate = toDateString(
          addDays(new Date(nextDate + 'T00:00:00'), regime.frequency_days)
        );
      }
    }

    if (created.length > 0) {
      update(st => ({
        ...st,
        jobs: [...st.jobs, ...created].sort((a, b) =>
          a.scheduled_date.localeCompare(b.scheduled_date)
        ),
      }));
      logAudit('create', 'maintenance_job', 'bulk', `${created.length} jobs`, {
        appId: 'maintenance', eventCategory: 'maintenance', severity: 'info',
        afterData: { count: created.length, fromDate, toDate },
      });
    }

    logger('✅ Generated', created.length, 'jobs');
    return created;
  }

  return {
    subscribe, load,
    loadJobDocuments, uploadDocument, deleteDocument,
    loadJobComponents, saveJobComponents, loadScopeComponents,
    createJob, updateJob, completeJob, cancelJob, reopenJob, deleteJob,
    generateJobs,
  };
}

export const maintenanceStore = createMaintenanceStore();
