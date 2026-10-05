<!-- src/lib/apps/parking/components/BayList.svelte -->
<!-- The bays as a table, the same filters as the map. Clicking a row selects
     the bay, exactly as clicking it on the plan does. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { BAY_STATE, TENURE_LABEL } from '../utils/bayModel.js';

  export let bays = [];
  export let selectedSpaceId = null;

  const dispatch = createEventDispatcher();
  const m = n => (n == null ? '—' : n.toFixed(1));
</script>

{#if bays.length === 0}
  <p class="text-sm text-slate-500 italic py-4">No bays match.</p>
{:else}
  <div class="overflow-x-auto">
    <table class="w-full text-sm" data-testid="bay-list">
      <thead>
        <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
          <th class="py-2 pr-3 font-medium">Bay</th>
          <th class="py-2 pr-3 font-medium">Size</th>
          <th class="py-2 pr-3 font-medium">Measured (m)</th>
          <th class="py-2 pr-3 font-medium">State</th>
          <th class="py-2 pr-3 font-medium">Held as</th>
          <th class="py-2 font-medium">Notes</th>
        </tr>
      </thead>
      <tbody>
        {#each bays as bay (bay.space_id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <tr
            class="border-b border-slate-800 cursor-pointer hover:bg-slate-800/60
                   {bay.space_id === selectedSpaceId ? 'bg-slate-800' : ''}"
            on:click={() => dispatch('select', bay.space_id)}
          >
            <td class="py-2 pr-3">
              <span class="font-mono text-slate-200">{bay.ref}</span>
              {#if bay.space?.label && bay.space.label !== bay.number}
                <span class="text-xs text-slate-500 ml-1">{bay.space.label}</span>
              {/if}
            </td>
            <td class="py-2 pr-3">
              {#if bay.size}<span class="text-slate-200">{bay.size}</span>
              {:else}<span class="text-amber-400 text-xs">Size not set</span>{/if}
            </td>
            <td class="py-2 pr-3 text-slate-400 text-xs">
              {#if bay.measured}{m(bay.measured.width)} × {m(bay.measured.length)}
              {:else}<span class="text-slate-600">no schematic scale</span>{/if}
            </td>
            <td class="py-2 pr-3">
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span class="w-2.5 h-2.5 rounded-full" style="background:{BAY_STATE[bay.state]?.colour}"></span>
                {BAY_STATE[bay.state]?.label}
              </span>
            </td>
            <td class="py-2 pr-3 text-xs text-slate-300">
              {TENURE_LABEL[bay.tenure] ?? bay.tenure}{#if bay.unit_ref} · {bay.unit_ref}{/if}
            </td>
            <td class="py-2 text-xs text-slate-400">
              {#if bay.is_accessible}<span class="mr-1.5">♿ Accessible</span>{/if}
              {#if bay.is_tandem}<span class="mr-1.5">Tandem</span>{/if}
              {#if bay.planning_restricted}<span class="mr-1.5">Residents only</span>{/if}
              {#if !bay.in_service}<span class="text-red-400">{bay.out_of_use_reason}</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
