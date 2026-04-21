<!-- src/lib/apps/building_assets/components/ComponentMaintenanceHistory.svelte -->
<!-- Compact maintenance job history for a component, shown inside ComponentDetailPanel/View.
     Queries maintenance_jobs WHERE scope_type='component' AND scope_id=componentId. -->
<script>
  import { onMount }    from 'svelte';
  import { api }        from '$lib/utils/api';
  import { jobRag, ragConfig, resultConfig } from '$lib/apps/maintenance/utils/maintenanceHelpers.js';
  import { fmtDate }    from '$lib/utils/dates.js';
  import { sec }        from '../ui.js';

  export let componentId;   // UUID of the component

  let jobs    = [];
  let loading = true;
  let error   = '';
  let showAll = false;

  const PREVIEW = 3;

  onMount(async () => {
    if (!componentId) { loading = false; return; }
    try {
      jobs = await api.get('maintenance_jobs', {
        filters:   { scope_type: 'component', scope_id: componentId },
        orderBy:   'scheduled_date',
        ascending: false,
        limit:     20,
      });
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  $: displayed = showAll ? jobs : jobs.slice(0, PREVIEW);
</script>

<section>
  <p class={sec}>Maintenance history</p>

  {#if loading}
    <p class="text-xs text-slate-600 italic mt-1">Loading…</p>

  {:else if error}
    <p class="text-xs text-red-400 mt-1">⚠ {error}</p>

  {:else if jobs.length === 0}
    <p class="text-xs text-slate-600 italic mt-1">No maintenance jobs recorded for this component.</p>

  {:else}
    <div class="mt-2 space-y-1.5">
      {#each displayed as job (job.id)}
        {@const rag = ragConfig(jobRag(job))}
        {@const res = resultConfig(job.result)}
        <div class="flex items-start gap-3 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <!-- Date -->
          <div class="shrink-0 w-20">
            <p class="text-xs text-slate-400 leading-tight">
              {job.completed_date ? fmtDate(job.completed_date) : fmtDate(job.scheduled_date)}
            </p>
            {#if job.completed_date && job.scheduled_date !== job.completed_date}
              <p class="text-xs text-slate-600 leading-tight">sched. {fmtDate(job.scheduled_date)}</p>
            {/if}
          </div>

          <!-- Title + details -->
          <div class="flex-1 min-w-0">
            <p class="text-xs text-slate-300 font-medium leading-tight truncate" title={job.title}>
              {job.title}
            </p>
            {#if job.contractor_name}
              <p class="text-xs text-slate-500 leading-tight truncate">{job.contractor_name}</p>
            {/if}
          </div>

          <!-- Badges -->
          <div class="flex flex-col items-end gap-1 shrink-0">
            <span class="text-xs px-1.5 py-0.5 rounded-full font-medium {rag.badge}">
              {rag.label}
            </span>
            {#if res}
              <span class="text-xs px-1.5 py-0.5 rounded-full font-medium {res.badge}">
                {res.label}
              </span>
            {/if}
          </div>
        </div>
      {/each}

      {#if jobs.length > PREVIEW}
        <button
          on:click={() => showAll = !showAll}
          class="text-xs text-purple-400 hover:text-purple-300 mt-1 transition-colors"
        >
          {showAll ? 'Show fewer' : `Show all ${jobs.length} jobs`}
        </button>
      {/if}
    </div>
  {/if}
</section>
