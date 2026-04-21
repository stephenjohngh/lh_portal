<!-- src/lib/apps/maintenance/components/DiaryTab.svelte -->
<!-- RAG-sorted diary view: Overdue → Due Soon → Scheduled → Completed -->
<script>
  import { permissions }   from '$lib/stores/permissions';
  import {
    ragConfig, resultConfig, scopeTypeLabel, daysRelative, frequencyLabel,
  } from '../utils/maintenanceHelpers.js';
  import { fmtDate } from '$lib/utils/dates.js';
  import JobDetailPanel       from './JobDetailPanel.svelte';
  import RecordCompletionForm from './RecordCompletionForm.svelte';

  export let jobs = [];

  $: canEdit = $permissions.isAdmin;

  // Group jobs into diary sections
  $: overdue   = jobs.filter(j => j.rag === 'overdue')
                     .sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date));
  $: dueSoon   = jobs.filter(j => j.rag === 'due_soon')
                     .sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date));
  $: upcoming  = jobs.filter(j => j.rag === 'scheduled' || j.rag === 'in_progress')
                     .sort((a,b) => a.scheduled_date.localeCompare(b.scheduled_date));
  $: completed = jobs.filter(j => j.rag === 'completed')
                     .sort((a,b) => (b.completed_date ?? '').localeCompare(a.completed_date ?? ''))
                     .slice(0, 10);

  // Section open/closed state
  let open = { overdue: true, dueSoon: true, upcoming: true, completed: false };

  let selectedJob   = null;
  let completeJob   = null;

  const SECTIONS = [
    { key: 'overdue',   label: 'Overdue',            jobs: () => overdue,   hdr: 'bg-red-900/20 border-red-800/40',    count: () => overdue.length   },
    { key: 'dueSoon',   label: 'Due within 30 days',  jobs: () => dueSoon,   hdr: 'bg-amber-900/20 border-amber-800/40', count: () => dueSoon.length   },
    { key: 'upcoming',  label: 'Upcoming',            jobs: () => upcoming,  hdr: 'bg-green-900/10 border-green-800/30', count: () => upcoming.length  },
    { key: 'completed', label: 'Recently completed',  jobs: () => completed, hdr: 'bg-slate-800/40 border-slate-700',    count: () => completed.length },
  ];
</script>

<div class="space-y-3">

  {#each SECTIONS as sec}
    {@const sJobs = sec.jobs()}
    {#if sJobs.length > 0 || sec.key === 'upcoming'}
      <div class="rounded-lg border border-slate-700 overflow-hidden">

        <!-- Section header -->
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="flex items-center justify-between px-4 py-3 cursor-pointer select-none {sec.hdr}"
          on:click={() => open[sec.key] = !open[sec.key]}
        >
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-200">{sec.label}</span>
            <span class="text-xs text-slate-400">({sec.count()})</span>
          </div>
          <span class="text-slate-400 text-sm transition-transform duration-150"
            style="transform: rotate({open[sec.key] ? '180deg' : '0deg'})">▾</span>
        </div>

        <!-- Section rows -->
        {#if open[sec.key]}
          {#if sJobs.length === 0}
            <p class="px-4 py-3 text-sm text-slate-600 italic">None.</p>
          {:else}
            <div class="divide-y divide-slate-700/40">
              {#each sJobs as job (job.id)}
                {@const rag = ragConfig(job.rag)}
                {@const res = resultConfig(job.result)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div
                  class="flex items-center gap-3 px-4 py-3 hover:bg-slate-700/20 cursor-pointer transition-colors"
                  on:click={() => selectedJob = job}
                >
                  <div class="w-2 h-2 rounded-full flex-shrink-0 {rag.dot}"></div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-sm text-slate-200 font-medium truncate">{job.title}</span>
                      {#if res}
                        <span class="px-1.5 py-0.5 rounded text-xs {res.badge}">{res.label}</span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span class="text-xs text-slate-500">
                        {scopeTypeLabel(job.scope_type)}: {job.scope_label ?? '—'}
                      </span>
                      {#if job.contractor_name}
                        <span class="text-xs text-slate-600">· {job.contractor_name}</span>
                      {/if}
                    </div>
                  </div>

                  <div class="text-right flex-shrink-0">
                    <div class="text-xs text-slate-300">{fmtDate(job.scheduled_date)}</div>
                    {#if job.rag === 'overdue' || job.rag === 'due_soon'}
                      <div class="text-xs mt-0.5 {job.rag === 'overdue' ? 'text-red-400' : 'text-amber-400'}">
                        {daysRelative(job.scheduled_date)}
                      </div>
                    {:else if job.completed_date}
                      <div class="text-xs text-slate-500 mt-0.5">done {fmtDate(job.completed_date)}</div>
                    {/if}
                  </div>

                  {#if canEdit && (job.rag === 'overdue' || job.rag === 'due_soon' || job.rag === 'scheduled' || job.rag === 'in_progress')}
                    <button
                      class="complete-btn flex-shrink-0"
                      on:click|stopPropagation={() => completeJob = job}
                    >
                      ✓
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}

      </div>
    {/if}
  {/each}

  {#if jobs.length === 0}
    <div class="text-center py-16 text-slate-500">
      <div class="text-4xl mb-3">🔧</div>
      <p class="text-sm">No maintenance jobs yet.</p>
      <p class="text-xs mt-1">Create jobs from the All Jobs tab.</p>
    </div>
  {/if}

</div>

<!-- Job detail -->
{#if selectedJob}
  <JobDetailPanel job={selectedJob} show={true}
    on:close={() => selectedJob = null}
    on:changed={() => selectedJob = null} />
{/if}

<!-- Quick complete -->
{#if completeJob}
  <RecordCompletionForm job={completeJob} show={true}
    on:close={() => completeJob = null}
    on:completed={() => completeJob = null} />
{/if}

<style>
  .complete-btn {
    width: 28px; height: 28px; border-radius: 6px; font-size: 0.875rem;
    background: rgb(22 163 74 / 0.15); color: #4ade80;
    border: 1px solid rgb(22 163 74 / 0.3); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.12s; flex-shrink: 0;
  }
  .complete-btn:hover { background: rgb(22 163 74 / 0.35); }
</style>
