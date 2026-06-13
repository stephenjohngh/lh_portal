<!-- src/lib/apps/building_assets/components/ColumnToggles.svelte -->
<!-- The Linked / Notes / Insp. Notes column checkboxes for the Components-tab
     filter bar. Bindable props (same pattern as ReportSectionToggles).
     See CLAUDE.md "Testing". -->
<script>
  export let showLinked          = true;
  export let showNotes           = true;
  export let showInspectionNotes = false;
</script>

<div class="flex flex-col gap-1 self-end pb-1.5">
  <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Columns</p>
  <div class="flex items-center gap-3">
    <label class="flex items-center gap-1.5 cursor-pointer
                   text-xs text-slate-400 hover:text-slate-300 transition-colors">
      <input type="checkbox" bind:checked={showLinked}
             class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 accent-purple-500 cursor-pointer" />
      Linked
    </label>
    <label class="flex items-center gap-1.5 cursor-pointer
                   text-xs text-slate-400 hover:text-slate-300 transition-colors">
      <input type="checkbox" bind:checked={showNotes}
             class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 accent-purple-500 cursor-pointer" />
      Notes
    </label>
    <label class="flex items-center gap-1.5 cursor-pointer
                   text-xs text-slate-400 hover:text-slate-300 transition-colors">
      <input type="checkbox" bind:checked={showInspectionNotes}
             class="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 accent-purple-500 cursor-pointer" />
      Insp. Notes
    </label>
  </div>
</div>
