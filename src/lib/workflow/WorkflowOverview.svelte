<!-- src/lib/workflow/WorkflowOverview.svelte -->
<!-- Every process in one table (2026-10-25): what is open, late, due soon, with
     no one and paused, how old the oldest open item is and how many finished
     lately. Counts and ages only — never an item or a name. Reads what the
     viewer's own grants let them read, so a process they cannot see is absent. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { listOverviewData } from './workflowApi.js';
  import { today } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { workflowLabel, sortByLabel } from './workflowNaming.js';
  import { workflowOverview, overviewTotals, RECENT_DAYS } from './workflowOverview.js';

  /** The workflows to show (the panel already has them). @type {any[]} */
  export let workflows = [];
  const dispatch = createEventDispatcher();

  let loaded = false;
  let error = '';
  /** @type {any[]} */ let steps = [];
  /** @type {any[]} */ let items = [];

  onMount(async () => {
    try {
      ({ steps, items } = await listOverviewData());
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the figures across the processes.'); }
    finally { loaded = true; }
  });

  $: rows = loaded ? workflowOverview({ workflows: sortByLabel(workflows), steps, items, today: today() }) : [];
  $: totals = overviewTotals(rows);
  const cell = 'py-1 pr-3 text-right tabular-nums';
</script>

<details class="rounded border border-slate-700 p-3" open data-testid="workflow-overview">
  <summary class="cursor-pointer text-sm font-semibold text-slate-200">Across all processes</summary>
  {#if error}<p class="text-xs text-red-300 mt-2">{error}</p>
  {:else if !loaded}<p class="text-xs text-slate-400 mt-2">Reading…</p>
  {:else}
    <div class="overflow-x-auto mt-2"><table class="w-full text-sm">
      <thead><tr class="text-xs text-slate-400">
        <th class="py-1 pr-3 text-left font-medium">Process</th><th class="py-1 pr-3 text-right font-medium">Open</th>
        <th class="py-1 pr-3 text-right font-medium">Late</th><th class="py-1 pr-3 text-right font-medium">Due soon</th>
        <th class="py-1 pr-3 text-right font-medium">With no one</th><th class="py-1 pr-3 text-right font-medium">Paused</th>
        <th class="py-1 pr-3 text-right font-medium" title="Days since the oldest open item started">Oldest</th>
        <th class="py-1 text-right font-medium" title="Finished in the last {RECENT_DAYS} days">Finished lately</th></tr></thead>
      <tbody>
        {#each rows as r (r.workflow.id)}
          <tr class="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer" on:click={() => dispatch('choose', r.workflow.key)}>
            <td class="py-1 pr-3 text-slate-200">{workflowLabel(r.workflow)}</td>
            <td class={cell}>{r.open}</td>
            <td class="{cell} {r.overdue ? 'text-red-400 font-semibold' : 'text-slate-500'}">{r.overdue}</td>
            <td class="{cell} {r.dueSoon ? 'text-amber-300' : 'text-slate-500'}">{r.dueSoon}</td>
            <td class={cell}>{r.unassigned}</td><td class={cell}>{r.paused}</td>
            <td class={cell}>{r.oldestDays === null ? '—' : `${r.oldestDays} d`}</td>
            <td class="py-1 text-right tabular-nums">{r.finishedRecently}</td>
          </tr>
        {/each}
        <tr class="border-t border-slate-600 text-slate-200 font-semibold">
          <td class="py-1 pr-3">All</td><td class={cell}>{totals.open}</td><td class={cell}>{totals.overdue}</td><td class={cell}>{totals.dueSoon}</td>
          <td class={cell}>{totals.unassigned}</td><td class={cell}></td><td class={cell}></td><td class="py-1 text-right tabular-nums">{totals.finishedRecently}</td></tr>
      </tbody>
    </table></div>
    <p class="text-xs text-slate-500 mt-1">Counts only. Choose a row to open that process.</p>
  {/if}
</details>
