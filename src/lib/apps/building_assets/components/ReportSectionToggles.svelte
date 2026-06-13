<!-- src/lib/apps/building_assets/components/ReportSectionToggles.svelte -->
<!-- The "which sections to include" checkboxes for the Components-tab report
     panel. Phase-2 worked example #2 — the harder case: TWO-WAY state. Each
     checkbox is a bindable prop, so the parent uses `bind:includePlan` etc.
     and reads the user's selection back. reportError is display-only.
     See CLAUDE.md "Testing". -->
<script>
  export let includePlan             = false;
  export let includeList             = false;
  export let includeFloorSummary     = false;
  export let includeFullSummary      = false;
  export let includeFullComponentList = false;
  export let reportError             = '';
</script>

<div class="px-4 pb-3 flex flex-wrap gap-x-8 gap-y-2">

  <div class="flex flex-col gap-1.5">
    <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Per Floor</p>
    <div class="flex flex-wrap gap-x-5 gap-y-1.5">
      <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
        <input type="checkbox" bind:checked={includePlan} class="accent-purple-500" />
        🗺 Plan Graphic
      </label>
      <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
        <input type="checkbox" bind:checked={includeList} class="accent-purple-500" />
        📋 Component Table
      </label>
      <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
        <input type="checkbox" bind:checked={includeFloorSummary} class="accent-purple-500" />
        📊 Floor Summary
      </label>
    </div>
  </div>

  <div class="flex flex-col gap-1.5">
    <p class="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Final Section</p>
    <div class="flex flex-wrap gap-x-5 gap-y-1.5">
      <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
        <input type="checkbox" bind:checked={includeFullSummary} class="accent-purple-500" />
        📈 Full Summary
      </label>
      <label class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 cursor-pointer">
        <input type="checkbox" bind:checked={includeFullComponentList} class="accent-purple-500" />
        📋 Full Component List
      </label>
    </div>
  </div>

  {#if reportError}
    <p class="w-full text-xs text-red-400">{reportError}</p>
  {/if}

</div>
