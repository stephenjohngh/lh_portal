<!-- src/lib/apps/parking/components/ReportsTab.svelte -->
<!-- Excel downloads of the register, built from what the screen holds. -->
<script>
  import { parkingStore } from '../stores/parkingStore.js';
  import { REPORTS, downloadParkingReport } from '../utils/parkingReports.js';
  import { downloadBayPlan } from '../utils/bayPlanImage.js';
  import Button       from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import RetentionPanel from './RetentionPanel.svelte';

  const HINT = {
    bays:       'Every bay: where it is, its size and measured dimensions, its state, how it is held, and who holds it today.',
    agreements: 'Every agreement with its terms and a yearly figure. A schedule of what was agreed, not a record of money received.',
    waiting:    'The waiting list in queue order, with any offer open.',
    devices:    'Fobs, remotes, cards and keys still out after their agreement ended. Each still opens the gate.',
  };

  let busy = null;
  let error = '';
  let done = '';

  async function printPlan() {
    busy = 'plan'; error = ''; done = '';
    try {
      const { levels } = await downloadBayPlan($parkingStore);
      done = `Bay schematic downloaded: ${levels} level${levels === 1 ? '' : 's'} on one page, and the list.`;
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      busy = null;
    }
  }

  async function download(key) {
    busy = key; error = ''; done = '';
    try {
      const { rows } = await downloadParkingReport(key, $parkingStore);
      done = `${REPORTS[key].label}: ${rows} row${rows === 1 ? '' : 's'} downloaded.`;
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      busy = null;
    }
  }
</script>

<div class="space-y-3 max-w-2xl">
  <p class="text-sm text-amber-200 bg-amber-900/10 border border-amber-700/40 rounded-lg p-3">
    These spreadsheets name the people who hold bays. Once downloaded they are outside the Parking app's access
    controls, so keep them within the parking team and delete them when they are no longer needed.
  </p>
  {#if error}<ErrorDisplay message={error} />{/if}
  {#if done}<p class="text-xs text-green-400">{done}</p>{/if}
  <div class="flex items-center justify-between gap-4 bg-slate-800 border border-slate-700 rounded-lg p-3">
    <div>
      <p class="text-sm text-slate-200">Printable bay schematic</p>
      <p class="text-xs text-slate-400">Both basement levels on one page, each bay coloured and labelled with who has
        it or FREE, then the full list. For the caretaker's wall.</p>
    </div>
    <Button size="small" variant="secondary" loading={busy === 'plan'} disabled={!!busy} on:click={printPlan}>⬇ Word</Button>
  </div>
  {#each Object.entries(REPORTS) as [key, r] (key)}
    <div class="flex items-center justify-between gap-4 bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div>
        <p class="text-sm text-slate-200">{r.label}</p>
        <p class="text-xs text-slate-400">{HINT[key]}</p>
      </div>
      <Button size="small" variant="secondary" loading={busy === key} disabled={!!busy} on:click={() => download(key)}>
        ⬇ Excel
      </Button>
    </div>
  {/each}
  <RetentionPanel />
</div>
