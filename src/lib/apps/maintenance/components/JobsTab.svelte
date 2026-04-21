<!-- src/lib/apps/maintenance/components/JobsTab.svelte -->
<!-- Full filterable list of all maintenance jobs. -->
<script>
  import { permissions }   from '$lib/stores/permissions';
  import {
    ragConfig, resultConfig, scopeTypeLabel, daysRelative,
  } from '../utils/maintenanceHelpers.js';
  import { fmtDate } from '$lib/utils/dates.js';
  import JobDetailPanel       from './JobDetailPanel.svelte';
  import RecordCompletionForm from './RecordCompletionForm.svelte';
  import JobForm              from './JobForm.svelte';

  export let jobs = [];

  $: canEdit = $permissions.isAdmin;

  // -- Filters ------------------------------------------------------------------
  let search       = '';
  let statusFilter = 'active';   // 'all' | 'active' | 'overdue' | 'due_soon' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  let scopeFilter  = 'all';      // 'all' | 'building' | 'system' | 'type' | 'component'

  const STATUS_OPTS = [
    { value: 'all',         label: 'All' },
    { value: 'active',      label: 'Active' },
    { value: 'overdue',     label: 'Overdue' },
    { value: 'due_soon',    label: 'Due Soon' },
    { value: 'scheduled',   label: 'Scheduled' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed',   label: 'Completed' },
    { value: 'cancelled',   label: 'Cancelled' },
  ];

  $: filtered = jobs.filter(j => {
    // Status filter
    if (statusFilter === 'active') {
      if (!['overdue', 'due_soon', 'scheduled', 'in_progress'].includes(j.rag)) return false;
    } else if (statusFilter !== 'all') {
      if (j.rag !== statusFilter) return false;
    }
    // Scope filter
    if (scopeFilter !== 'all' && j.scope_type !== scopeFilter) return false;
    // Text search
    if (search.trim()) {
      const q   = search.toLowerCase();
      const hay = `${j.title} ${j.scope_label ?? ''} ${j.contractor_name ?? ''} ${j.reference_number ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));

  let selectedJob = null;
  let completeJob = null;
  let showCreate  = false;
</script>

<div class="space-y-4">

  <!-- Toolbar -->
  <div class="flex items-center justify-between gap-3 flex-wrap">
    {#if canEdit}
      <button class="new-btn" on:click={() => showCreate = true}>
        + New Job
      </button>
    {:else}
      <div></div>
    {/if}
    <span class="text-xs text-slate-500">{filtered.length} job{filtered.length === 1 ? '' : 's'}</span>
  </div>

  <!-- Filters -->
  <div class="space-y-2">
    <!-- Status chips -->
    <div class="flex flex-wrap gap-1.5">
      {#each STATUS_OPTS as opt}
        <button
          class="filter-chip"
          class:filter-chip-active={statusFilter === opt.value}
          on:click={() => statusFilter = opt.value}
        >
          {opt.label}
        </button>
      {/each}
    </div>
    <!-- Search + scope row -->
    <div class="flex gap-2 flex-wrap items-center">
      <input
        type="text"
        placeholder="Search jobs…"
        bind:value={search}
        class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
               placeholder:text-slate-500 focus:outline-none focus:border-purple-500 flex-1 min-w-48"
      />
      <select bind:value={scopeFilter}
        class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500">
        <option value="all">All scopes</option>
        <option value="building">Building-wide</option>
        <option value="system">System</option>
        <option value="type">Type</option>
        <option value="component">Component</option>
      </select>
    </div>
  </div>

  <!-- Job list -->
  {#if filtered.length === 0}
    <div class="text-center py-12 text-slate-500">
      {#if jobs.length === 0}
        <div class="text-4xl mb-3">🔧</div>
        <p class="text-sm">No maintenance jobs yet.</p>
        {#if canEdit}
          <p class="text-xs mt-1">Use the + New Job button to create one.</p>
        {/if}
      {:else}
        <p class="text-sm">No jobs match the current filters.</p>
        <button class="text-xs text-purple-400 mt-1 underline" on:click={() => { search = ''; statusFilter = 'all'; scopeFilter = 'all'; }}>
          Clear filters
        </button>
      {/if}
    </div>
  {:else}
    <div class="rounded-lg border border-slate-700 divide-y divide-slate-700/40 overflow-hidden">
      {#each filtered as job (job.id)}
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
              <span class="text-sm text-slate-200 font-medium">{job.title}</span>
              <span class="px-1.5 py-0.5 rounded text-xs {rag.badge}">{rag.label}</span>
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
              aria-label="Mark complete"
            >
              ✓
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

</div>

<!-- Job detail panel -->
{#if selectedJob}
  <JobDetailPanel job={selectedJob} show={true}
    on:close={() => selectedJob = null}
    on:changed={() => selectedJob = null} />
{/if}

<!-- Quick complete form -->
{#if completeJob}
  <RecordCompletionForm job={completeJob} show={true}
    on:close={() => completeJob = null}
    on:completed={() => completeJob = null} />
{/if}

<!-- Create job form -->
{#if showCreate}
  <JobForm on:close={() => showCreate = false}
    on:saved={() => showCreate = false} />
{/if}

<style>
  .new-btn {
    padding: 0.375rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500;
    background: rgb(var(--lh-accent-rgb) / 0.15); color: var(--lh-accent-lighter);
    border: 1px solid rgb(var(--lh-accent-rgb) / 0.35); cursor: pointer;
    transition: background 0.12s;
  }
  .new-btn:hover { background: rgb(var(--lh-accent-rgb) / 0.3); }

  .filter-chip {
    padding: 0.2rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;
    border: 1px solid rgb(71 85 105 / 0.6); background: transparent;
    color: #94a3b8; cursor: pointer; transition: all 0.12s;
  }
  .filter-chip:hover    { border-color: rgb(100 116 139); color: #cbd5e1; }
  .filter-chip-active   { border-color: rgb(var(--lh-accent-rgb) / 0.7); background: rgb(var(--lh-accent-rgb) / 0.12); color: #e2e8f0; }

  .complete-btn {
    width: 28px; height: 28px; border-radius: 6px; font-size: 0.875rem;
    background: rgb(22 163 74 / 0.15); color: #4ade80;
    border: 1px solid rgb(22 163 74 / 0.3); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.12s; flex-shrink: 0;
  }
  .complete-btn:hover { background: rgb(22 163 74 / 0.35); }
</style>
