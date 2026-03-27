<!-- src/lib/apps/v2proto/components/MaintenanceView.svelte -->
<!-- Shows maintenance_regime rows for types, demonstrating attribute_filter -->
<script>
  export let systems  = [];
  export let types    = [];
  export let regime   = {};   // { typeId: maintenance_regime[] }

  let selectedSystemId = '';

  $: systemTypes = selectedSystemId
    ? types.filter(t => t.building_system_id === selectedSystemId)
    : types;

  // Flatten all regime rows for the selected system types, with type name attached
  $: rows = systemTypes.flatMap(t =>
    (regime[t.id] ?? []).map(r => ({
      ...r,
      typeName:    t.name,
      typeCode:    t.code,
      typeColour:  t.colour,
      typeInitial: t.initial,
      priorityBase: t.priority_base
    }))
  );

  function frequencyLabel(days) {
    if (days === 30 || days === 31) return 'Monthly';
    if (days === 91 || days === 90) return 'Quarterly';
    if (days === 182 || days === 183) return '6-Monthly';
    if (days === 365 || days === 366) return 'Annual';
    if (days === 730) return '2-Yearly';
    if (days === 1825) return '5-Yearly';
    return `Every ${days} days`;
  }
</script>

<div class="flex flex-col gap-4">

  <!-- System filter -->
  <div class="flex items-center gap-3">
    <label class="text-sm text-slate-400">Filter by system:</label>
    <select
      bind:value={selectedSystemId}
      class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500"
    >
      <option value="">All systems</option>
      {#each systems as sys}
        <option value={sys.id}>{sys.name}</option>
      {/each}
    </select>
    <span class="text-sm text-slate-500">{rows.length} task{rows.length !== 1 ? 's' : ''}</span>
  </div>

  <!-- Regime table -->
  {#if rows.length === 0}
    <p class="text-slate-500 italic text-sm">
      No maintenance tasks defined for this selection.
    </p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
            <th class="pb-2 pr-4">Type</th>
            <th class="pb-2 pr-4">Attribute Filter</th>
            <th class="pb-2 pr-4">Task</th>
            <th class="pb-2 pr-4">Frequency</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-700/50">
          {#each rows as row}
            <tr class="hover:bg-slate-700/20 transition-colors">
              <td class="py-2 pr-4">
                <div class="flex items-center gap-2">
                  <span
                    class="w-6 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0 text-white"
                    style="background-color: #{row.typeColour}"
                  >
                    {row.typeInitial}
                  </span>
                  <span class="text-white">{row.typeName}</span>
                </div>
              </td>
              <td class="py-2 pr-4">
                {#if row.attribute_filter}
                  <span class="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-xs font-medium border border-yellow-500/30">
                    {row.attribute_filter}
                  </span>
                {:else}
                  <span class="text-slate-600 text-xs italic">all components</span>
                {/if}
              </td>
              <td class="py-2 pr-4 text-slate-300 max-w-xs">{row.task_name}</td>
              <td class="py-2 pr-4">
                <span class="text-slate-300">{frequencyLabel(row.frequency_days)}</span>
                <span class="text-slate-600 text-xs ml-1">({row.frequency_days}d)</span>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Explanation box -->
    <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm text-slate-400">
      <p class="font-semibold text-slate-300 mb-1">How attribute_filter works</p>
      <p>When <span class="font-mono text-slate-300">attribute_filter</span> is set, a maintenance
         task applies only to components where <span class="font-mono text-slate-300">components.primary_attribute</span>
         matches that value. For example, the "Monthly emergency lighting functional test" has
         <span class="font-mono text-yellow-300">attribute_filter = 'Emergency'</span>, so it only
         applies to Bulkhead components whose primary attribute is Emergency — not Standard or Maintained ones.</p>
    </div>
  {/if}
</div>
