<!-- src/lib/apps/admin/components/FloorPanel.svelte -->
<!-- Configure walk_order per floor. NULL = excluded from building-wide walk sessions. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { api }     from '$lib/utils/api';
  import { getLogger } from '$lib/utils/logger';
  import Button      from '$lib/components/common/Button.svelte';

  export let floors     = [];   // all floors[] from buildingAssetsStore
  export let facilities = [];   // facilities[] for building label

  const logger   = getLogger('FloorPanel');
  const dispatch = createEventDispatcher();

  // Local editable copy — walk_order as string so input can be empty (→ null)
  let rows = [];
  $: rows = floors.map(f => ({
    ...f,
    _walkOrder: f.walk_order == null ? '' : String(f.walk_order),
    _dirty: false,
    _saving: false,
    _error: null,
  }));

  function markDirty(row) {
    rows = rows.map(r => r.id === row.id ? { ...r, _dirty: true, _error: null } : r);
  }

  async function save(row) {
    const walkOrderVal = row._walkOrder.trim() === '' ? null : parseInt(row._walkOrder, 10);
    if (row._walkOrder.trim() !== '' && isNaN(walkOrderVal)) {
      rows = rows.map(r => r.id === row.id ? { ...r, _error: 'Must be a number or blank' } : r);
      return;
    }
    rows = rows.map(r => r.id === row.id ? { ...r, _saving: true, _error: null } : r);
    try {
      await api.update('floors', row.id, { walk_order: walkOrderVal });
      rows = rows.map(r => r.id === row.id
        ? { ...r, walk_order: walkOrderVal, _walkOrder: walkOrderVal == null ? '' : String(walkOrderVal), _dirty: false, _saving: false }
        : r
      );
      dispatch('saved');
    } catch (err) {
      logger('❌ save floor:', err.message);
      rows = rows.map(r => r.id === row.id ? { ...r, _saving: false, _error: err.message } : r);
    }
  }

  function facilityName(facilityId) {
    return facilities.find(f => f.id === facilityId)?.name ?? '—';
  }
</script>

<div class="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4">

  <div class="flex items-center justify-between mb-3">
    <div>
      <h3 class="text-sm font-semibold text-slate-200">Floor Walk Order</h3>
      <p class="text-xs text-slate-500 mt-0.5">
        Set the inspection sequence for building-wide walk sessions.
        Leave blank to exclude a floor (e.g. roof, external areas).
      </p>
    </div>
  </div>

  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-700">
          <th class="text-left text-xs font-medium text-slate-400 pb-2 pr-4">Building</th>
          <th class="text-left text-xs font-medium text-slate-400 pb-2 pr-4">Floor</th>
          <th class="text-left text-xs font-medium text-slate-400 pb-2 pr-4">Short</th>
          <th class="text-left text-xs font-medium text-slate-400 pb-2 pr-4 w-28">Walk Order</th>
          <th class="pb-2 w-20"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr class="border-b border-slate-700/50 last:border-0">
            <td class="py-2 pr-4 text-slate-400 text-xs">{facilityName(row.facility_id)}</td>
            <td class="py-2 pr-4 text-slate-200">{row.name}</td>
            <td class="py-2 pr-4 font-mono text-slate-300 text-xs">{row.short_name}</td>
            <td class="py-2 pr-4">
              <input
                type="text"
                inputmode="numeric"
                pattern="[0-9]*"
                placeholder="—"
                bind:value={row._walkOrder}
                on:input={() => markDirty(row)}
                class="w-20 px-2 py-1 text-sm bg-slate-700 border rounded text-slate-200
                       focus:outline-none focus:ring-1 focus:ring-purple-500
                       {row._error ? 'border-red-500' : 'border-slate-600'}"
              />
              {#if row._error}
                <p class="text-xs text-red-400 mt-0.5">{row._error}</p>
              {/if}
            </td>
            <td class="py-2 text-right">
              {#if row._dirty}
                <Button
                  variant="primary"
                  size="sm"
                  loading={row._saving}
                  disabled={row._saving}
                  on:click={() => save(row)}
                >
                  Save
                </Button>
              {:else}
                <span class="text-xs {row.walk_order != null ? 'text-green-400' : 'text-slate-600'}">
                  {row.walk_order != null ? `#${row.walk_order}` : 'excluded'}
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

</div>
