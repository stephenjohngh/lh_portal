<!-- src/lib/apps/building_assets/components/ReportActionButtons.svelte -->
<!-- The Document / CSV export buttons for the Components-tab report panel.
     Presentational: props in (count + flags drive disabled state), events out
     (document | csv). The single CSV now carries attribute/condition columns
     per the Columns toggles (the old Condition-Audit button merged in). -->
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  export let count = 0;                // filtered component count
  export let generating = false;       // a Word doc is currently generating
  export let documentDisabled = false; // no report section selected (reportNoneSelected)

  const BTN = 'px-3 py-1 text-xs rounded bg-purple-600 hover:bg-purple-500 text-white'
            + ' disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
</script>

<div class="ml-auto flex items-center gap-2">
  <button
    on:click={() => dispatch('document')}
    disabled={generating || count === 0 || documentDisabled}
    class={BTN}
  >{generating ? 'Generating…' : '⬇ Document'}</button>
  <button
    on:click={() => dispatch('csv')}
    disabled={count === 0}
    class={BTN}
    title="CSV — one row per component; attribute & condition columns follow the Columns toggles (Excel-filterable)"
  >⬇ CSV</button>
</div>
