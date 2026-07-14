<!-- src/lib/apps/building_assets/components/ColumnToggles.svelte -->
<!-- The report/export column checkboxes for the Components tab. Bindable props
     (same pattern as ReportSectionToggles). Linked/Notes/Insp.Notes are single
     columns; Attributes/Conditions render aggregated in the Word doc and as one
     column PER attribute in the CSV. See CLAUDE.md "Testing". -->
<script>
  export let showLinked          = true;
  export let showNotes           = true;
  export let showInspectionNotes = false;
  export let showAttributes      = true;
  export let showConditions      = true;
  export let showSpaces          = false;

  const CB = 'w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 accent-purple-500 cursor-pointer';
  const LB = 'flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-slate-300 transition-colors';
</script>

<div class="flex items-center gap-x-4 gap-y-1 flex-wrap">
  <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Columns</p>
  <label class={LB}>
    <input type="checkbox" bind:checked={showAttributes} class={CB} />
    Attributes
  </label>
  <label class={LB}>
    <input type="checkbox" bind:checked={showConditions} class={CB} />
    Conditions
  </label>
  <label class={LB}>
    <input type="checkbox" bind:checked={showSpaces} class={CB} />
    Space(s)
  </label>
  <label class={LB}>
    <input type="checkbox" bind:checked={showLinked} class={CB} />
    Linked
  </label>
  <label class={LB}>
    <input type="checkbox" bind:checked={showNotes} class={CB} />
    Notes
  </label>
  <label class={LB}>
    <input type="checkbox" bind:checked={showInspectionNotes} class={CB} />
    Insp. Notes
  </label>
</div>
