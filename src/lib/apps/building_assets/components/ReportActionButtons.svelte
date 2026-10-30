<!-- src/lib/apps/building_assets/components/ReportActionButtons.svelte -->
<!-- The Word / Excel / CSV export buttons for the Components-tab report panel.
     Presentational: props in (count + flags drive disabled state), events out
     (document | xlsx | csv). All three share the report data model — the CSV and
     Excel detail use the same column matrix; Word/Excel summaries the same pivot. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let count = 0;                // filtered component count
  export let generating = false;       // a Word doc is currently generating
  export let generatingXlsx = false;   // an Excel doc is currently generating
  export let documentDisabled = false; // no report section selected (reportNoneSelected)

  const BTN = 'px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white'
            + ' disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
</script>

<div class="ml-auto flex items-center gap-2">
  <Button variant="plain" on:click={() => dispatch('document')} disabled={generating || count === 0 || documentDisabled} className={BTN}>{generating ? 'Generating…' : '⬇ Word'}</Button>
  <Button variant="plain" on:click={() => dispatch('xlsx')} disabled={generatingXlsx || count === 0} title="Excel (.xlsx) — Components sheet + Full Summary / By Floor sheets (filterable, styled)" className={BTN}>{generatingXlsx ? 'Generating…' : '⬇ Excel'}</Button>
  <Button variant="plain" on:click={() => dispatch('csv')} disabled={count === 0} title="CSV — one row per component; attribute & condition columns follow the Columns toggles (Excel-filterable)" className={BTN}>⬇ CSV</Button>
</div>
