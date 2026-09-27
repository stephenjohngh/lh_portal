<!-- src/lib/apps/parking/components/RetentionPanel.svelte -->
<!-- How long Parking keeps personal data, what is due for removal today, and
     when anything was last removed (migration 226, decision D8). The rules and
     periods come from the database function, never from here. Anyone with the
     grant can see it; only an admin can remove anything.
     ⛔ Nothing is removed on a timetable: the nightly job was switched off by
     the user on 2026-09-27 (migration 230). Do not word this panel as though
     it runs by itself. -->
<script>
  import { onMount } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { retentionRules, retentionSummary } from '../utils/retentionModel.js';
  import { fmtDateTime } from '$lib/utils/dates';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';

  let due = null;
  let runs = [];
  let error = '';
  let done = '';
  let confirming = false;
  let running = false;

  async function refresh() {
    error = '';
    try {
      [due, runs] = await Promise.all([parkingStore.retentionDue(), parkingStore.retentionRuns()]);
    } catch (/** @type {any} */ err) {
      error = `Could not read the retention position: ${err.message}`;
    }
  }
  onMount(refresh);

  async function run() {
    running = true; error = ''; done = '';
    try {
      const counts = await parkingStore.runRetention();
      done = retentionSummary(counts);
      await refresh();
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      running = false;
      confirming = false;
    }
  }

  $: rules = retentionRules(due?.periods);
  $: anythingDue = !!due && ['agreements', 'vehicles', 'devices', 'applications', 'holders', 'held_back_documents'].some(k => due[k] > 0);
</script>

<section class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3" data-testid="retention">
  <div class="flex items-start justify-between gap-4">
    <div>
      <p class="text-sm text-slate-200">How long this app keeps personal data</p>
      <p class="text-xs text-slate-400">Nothing is removed automatically. An administrator decides when to remove what is due, and nothing removed can be recovered.</p>
    </div>
    {#if anythingDue}
      <ProtectedButton requireAdmin={true} variant="danger" on:click={() => confirming = true}>Remove what is due now</ProtectedButton>
    {/if}
  </div>
  {#if error}<ErrorDisplay message={error} />{/if}
  {#if rules.length}
    <ul class="text-xs text-slate-400 list-disc pl-5 space-y-1">
      {#each rules as r}<li>{r}</li>{/each}
    </ul>
  {/if}
  {#if due}
    <p class="text-sm {anythingDue ? 'text-amber-300' : 'text-slate-300'}" data-testid="retention-due">{retentionSummary(due, { due: true })}</p>
  {/if}
  {#if done}<p class="text-xs text-green-400">{done}</p>{/if}
  <p class="text-xs text-slate-500" data-testid="retention-last">
    {#if runs.length}
      Last run {fmtDateTime(runs[0].ran_at)}{runs[0].run_by ? ' (by hand)' : ' (nightly)'}: {retentionSummary(runs[0].counts)}
    {:else if due}
      Nothing has been removed yet.
    {/if}
  </p>
</section>

<ConfirmDialog
  show={confirming}
  title="Remove what is due now?"
  message={due ? `${retentionSummary(due, { due: true })} Signed licence documents are deleted first. This cannot be undone.` : ''}
  confirmText="Remove"
  danger={true}
  processing={running}
  on:confirm={run}
  on:cancel={() => confirming = false}
/>
