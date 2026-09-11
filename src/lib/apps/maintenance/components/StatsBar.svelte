<!-- src/lib/apps/maintenance/components/StatsBar.svelte -->
<!-- Summary counts: Overdue / Due Soon / Scheduled / Completed / Certificates -->
<script>
  import { certificateExpirySummary } from '../utils/maintenanceHelpers.js';

  export let jobs = [];
  /** All maintenance_documents, for the certificate card (M5). */
  export let docs = [];

  $: overdue   = jobs.filter(j => j.rag === 'overdue').length;
  $: dueSoon   = jobs.filter(j => j.rag === 'due_soon').length;
  $: scheduled = jobs.filter(j => j.rag === 'scheduled' || j.rag === 'in_progress').length;
  $: completed = jobs.filter(j => j.rag === 'completed').length;

  // M5. An expiring certificate used to be visible only to someone who opened
  // the Documents tab and read the badges.
  $: certs = certificateExpirySummary(docs);
</script>

<div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">

  <div class="stat-card border-red-800/40 bg-red-900/10">
    <div class="stat-dot bg-red-500"></div>
    <div>
      <div class="stat-num text-red-300">{overdue}</div>
      <div class="stat-label">Overdue</div>
    </div>
  </div>

  <div class="stat-card border-amber-800/40 bg-amber-900/10">
    <div class="stat-dot bg-amber-400"></div>
    <div>
      <div class="stat-num text-amber-300">{dueSoon}</div>
      <div class="stat-label">Due within 30 days</div>
    </div>
  </div>

  <div class="stat-card border-green-800/40 bg-green-900/10">
    <div class="stat-dot bg-green-500"></div>
    <div>
      <div class="stat-num text-green-300">{scheduled}</div>
      <div class="stat-label">Scheduled</div>
    </div>
  </div>

  <div class="stat-card border-slate-700 bg-slate-800/30">
    <div class="stat-dot bg-slate-400"></div>
    <div>
      <div class="stat-num text-slate-300">{completed}</div>
      <div class="stat-label">Completed</div>
    </div>
  </div>

  <!-- Certificates. "0 expiring" out of nothing tracked is not good news, so
       a building with no expiry dates recorded says so instead of showing a
       reassuring zero. -->
  {#if certs.tracked === 0}
    <div class="stat-card border-slate-700 bg-slate-800/30" title="No maintenance document carries an expiry date">
      <div class="stat-dot bg-slate-600"></div>
      <div>
        <div class="stat-num text-slate-400">—</div>
        <div class="stat-label">No certificate dates held</div>
      </div>
    </div>
  {:else}
    <div class="stat-card {certs.expired > 0
           ? 'border-red-800/40 bg-red-900/10'
           : certs.attention > 0 ? 'border-amber-800/40 bg-amber-900/10'
                                 : 'border-green-800/40 bg-green-900/10'}"
         title="{certs.tracked} certificate{certs.tracked === 1 ? '' : 's'} with an expiry date">
      <div class="stat-dot {certs.expired > 0 ? 'bg-red-500'
                          : certs.attention > 0 ? 'bg-amber-400' : 'bg-green-500'}"></div>
      <div>
        <div class="stat-num {certs.expired > 0 ? 'text-red-300'
                            : certs.attention > 0 ? 'text-amber-300' : 'text-green-300'}">
          {certs.attention}
        </div>
        <div class="stat-label">
          {#if certs.expired > 0}
            Certificates — {certs.expired} expired
          {:else if certs.attention > 0}
            Certificates expiring
          {:else}
            Certificates in date
          {/if}
        </div>
      </div>
    </div>
  {/if}

</div>

<style>
  .stat-card {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.875rem 1rem; border-radius: 10px;
    border: 1px solid;
  }
  .stat-dot   { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .stat-num   { font-size: 1.5rem; font-weight: 700; line-height: 1; }
  .stat-label { font-size: 0.7rem; color: rgb(148 163 184); margin-top: 0.2rem; }
</style>
