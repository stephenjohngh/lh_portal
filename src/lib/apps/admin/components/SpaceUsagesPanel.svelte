<!-- src/lib/apps/admin/components/SpaceUsagesPanel.svelte -->
<!-- Admin CRUD for the configurable space-usage list (space_usages). Drives the
     usage pickers in Building Assets and the Spaces-register filter. `spaces.usage`
     is free text, so deleting a usage never breaks existing spaces — they keep
     their value. Writes go through building_assets/public.js; the parent reloads
     the list on `saved`. Usages are shown in presentation_order. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { createSpaceUsage, updateSpaceUsage, deleteSpaceUsage } from '$lib/apps/building_assets/public.js';
  import { auth } from '$lib/stores/auth';
  import { getLogger } from '$lib/utils/logger';
  import Button        from '$lib/components/common/Button.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let usages = [];   // [{ id, value, presentation_order }]

  const dispatch = createEventDispatcher();
  const logger   = getLogger('SpaceUsagesPanel');

  // Editable copy of each row.
  let rows = [];
  $: rows = usages.map(u => ({
    ...u,
    _value: u.value,
    _order: String(u.presentation_order ?? 0),
    _dirty: false, _saving: false, _error: null,
  }));

  let newValue = '';
  let newOrder = '';
  let adding   = false;
  let errorMsg = '';

  let pendingDelete = null;   // row awaiting confirmation
  let deletingId    = null;

  const inp = 'px-2 py-1 text-sm bg-slate-700 border rounded text-slate-200 focus:outline-none focus:ring-1 focus:ring-purple-500';

  function nextOrder() {
    return usages.reduce((m, u) => Math.max(m, u.presentation_order ?? 0), 0) + 10;
  }

  async function addUsage() {
    const value = newValue.trim();
    if (!value) { errorMsg = 'Enter a usage value.'; return; }
    if (usages.some(u => u.value.toLowerCase() === value.toLowerCase())) {
      errorMsg = 'That usage already exists.'; return;
    }
    adding = true; errorMsg = '';
    try {
      const order = newOrder.trim() === '' ? nextOrder() : (parseInt(newOrder, 10) || 0);
      await createSpaceUsage({ value, presentation_order: order, userId: $auth.user?.id ?? null });
      newValue = ''; newOrder = '';
      dispatch('saved');
    } catch (e) {
      logger('❌ add usage:', e.message); errorMsg = e.message;
    } finally { adding = false; }
  }

  function markDirty(row) {
    rows = rows.map(r => r.id === row.id ? { ...r, _dirty: true, _error: null } : r);
  }

  async function saveRow(row) {
    const value = row._value.trim();
    if (!value) { rows = rows.map(r => r.id === row.id ? { ...r, _error: 'Value required' } : r); return; }
    const order = row._order.trim() === '' ? 0 : parseInt(row._order, 10);
    if (row._order.trim() !== '' && isNaN(order)) {
      rows = rows.map(r => r.id === row.id ? { ...r, _error: 'Order must be a number' } : r); return;
    }
    rows = rows.map(r => r.id === row.id ? { ...r, _saving: true, _error: null } : r);
    try {
      await updateSpaceUsage(row.id, { value, presentation_order: order });
      dispatch('saved');
    } catch (e) {
      logger('❌ save usage:', e.message);
      rows = rows.map(r => r.id === row.id ? { ...r, _saving: false, _error: e.message } : r);
    }
  }

  function requestDelete(row) { pendingDelete = row; }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    deletingId = id;
    try {
      await deleteSpaceUsage(id);
      dispatch('saved');
    } catch (e) {
      logger('❌ delete usage:', e.message); errorMsg = e.message;
    } finally {
      deletingId = null; pendingDelete = null;
    }
  }
</script>

<div class="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4">

  <div class="mb-3">
    <h3 class="text-sm font-semibold text-slate-200">Space Usages</h3>
    <p class="text-xs text-slate-500 mt-0.5">
      The usage categories offered when drawing/editing a space and used to filter
      the Spaces register. Shown in order. Deleting a usage does not change spaces
      that already use it.
    </p>
  </div>

  {#if errorMsg}
    <p class="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1.5 mb-3">{errorMsg}</p>
  {/if}

  <!-- Add row -->
  <div class="flex items-end gap-2 mb-4">
    <div class="flex flex-col gap-1">
      <label class="text-xs text-slate-400" for="new-usage">New usage</label>
      <input id="new-usage" type="text" bind:value={newValue} placeholder="e.g. Protected escape route"
        class="{inp} border-slate-600 w-56" on:keydown={(e) => e.key === 'Enter' && addUsage()} />
    </div>
    <div class="flex flex-col gap-1">
      <label class="text-xs text-slate-400" for="new-order">Order</label>
      <input id="new-order" type="text" inputmode="numeric" bind:value={newOrder} placeholder="auto"
        class="{inp} border-slate-600 w-20" />
    </div>
    <Button variant="primary" size="sm" loading={adding} disabled={adding} on:click={addUsage}>Add</Button>
  </div>

  <!-- List -->
  {#if rows.length === 0}
    <p class="text-xs text-slate-600 italic">No usages configured yet.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-700">
            <th class="text-left text-xs font-medium text-slate-400 pb-2 pr-4">Usage</th>
            <th class="text-left text-xs font-medium text-slate-400 pb-2 pr-4 w-24">Order</th>
            <th class="pb-2 w-32"></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr class="border-b border-slate-700/50 last:border-0">
              <td class="py-2 pr-4">
                <input type="text" bind:value={row._value} on:input={() => markDirty(row)}
                  class="{inp} w-56 {row._error ? 'border-red-500' : 'border-slate-600'}" />
                {#if row._error}<p class="text-xs text-red-400 mt-0.5">{row._error}</p>{/if}
              </td>
              <td class="py-2 pr-4">
                <input type="text" inputmode="numeric" bind:value={row._order} on:input={() => markDirty(row)}
                  class="{inp} w-20 {row._error ? 'border-red-500' : 'border-slate-600'}" />
              </td>
              <td class="py-2 text-right whitespace-nowrap">
                {#if row._dirty}
                  <Button variant="primary" size="sm" loading={row._saving} disabled={row._saving}
                    on:click={() => saveRow(row)}>Save</Button>
                {/if}
                <button
                  on:click={() => requestDelete(row)}
                  class="ml-2 px-2 py-1 text-xs rounded bg-red-900/40 hover:bg-red-800/50
                         text-red-400 border border-red-800/40 transition-colors"
                  title="Delete usage"
                >Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

</div>

<ConfirmDialog
  show={!!pendingDelete}
  title="Delete space usage"
  message={pendingDelete ? `Delete the usage "${pendingDelete.value}"? Spaces already set to it keep the value; it just won't be offered in the pickers.` : ''}
  confirmText="Delete"
  danger={true}
  processing={!!deletingId}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
