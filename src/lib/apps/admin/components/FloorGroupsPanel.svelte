<!-- src/lib/apps/admin/components/FloorGroupsPanel.svelte -->
<!-- Admin → Floors and spaces → Floor groups (migration 280). A group is a name
     and a set of floors; each group with floors in it is a button beside All on
     Building Assets → Components. A floor may be in several groups, or none.
     Writes go through building_assets/public.js. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { saveFloorGroup, deleteFloorGroup } from '#lib/apps/building_assets/public.js';
  import { floorGroupProblem } from '#lib/apps/building_assets/utils/floorGroups.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import Button        from '#lib/components/common/Button.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import FormInput     from '#lib/components/common/FormInput.svelte';
  import ErrorDisplay  from '#lib/components/common/ErrorDisplay.svelte';

  /** @type {Array<{ id: string, name: string, position: number, floorIds: string[] }>} */
  export let groups = [];
  /** @type {Array<{ id: string, name: string, short_name: string }>} */
  export let floors = [];

  const dispatch = createEventDispatcher();

  // Editable copies, taken when the saved list changes; a new group has no id.
  /** @type {any[]} */
  let rows = [];
  $: rows = groups.map((g) => ({ key: g.id, id: g.id, name: g.name, position: g.position, floorIds: new Set(g.floorIds), dirty: false }));

  let error = '';
  let done = '';
  let busy = false;
  /** @type {any} */
  let pendingDelete = null;
  let nextKey = 1;

  const nextPosition = () => rows.reduce((m, r) => Math.max(m, r.position ?? 0), 0) + 10;

  function addGroup() {
    rows = [...rows, { key: `new-${nextKey++}`, id: null, name: '', position: nextPosition(), floorIds: new Set(), dirty: true }];
    done = '';
  }

  function toggleFloor(/** @type {any} */ row, /** @type {string} */ floorId) {
    const next = new Set(row.floorIds);
    if (next.has(floorId)) next.delete(floorId); else next.add(floorId);
    row.floorIds = next; row.dirty = true;
    rows = rows;
  }

  function problemOf(/** @type {any} */ row) {
    return floorGroupProblem(row.name, row.id, rows.filter((r) => r !== row).map((r) => ({ id: r.id, name: r.name })));
  }

  async function save(/** @type {any} */ row) {
    const name = row.name.trim();
    busy = true; error = ''; done = '';
    try {
      const id = await saveFloorGroup({ id: row.id, name, position: row.position, floorIds: [...row.floorIds] });
      logAudit(row.id ? 'update' : 'create', 'floor_group', id, name, {
        appId: 'admin', eventCategory: 'admin', severity: 'info', afterData: { name, floors: row.floorIds.size },
      });
      dispatch('saved');
      done = `${name} saved.`;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'The group could not be saved.');
    } finally { busy = false; }
  }

  async function swap(/** @type {number} */ i, /** @type {number} */ j) {
    const a = rows[i], b = rows[j];
    if (!a?.id || !b?.id || a.dirty || b.dirty) { error = 'Save your changes before moving a group.'; return; }
    busy = true; error = ''; done = '';
    try {
      // Positions may tie, so each takes a place of its own.
      await saveFloorGroup({ id: a.id, name: a.name, position: (j + 1) * 10, floorIds: [...a.floorIds] });
      await saveFloorGroup({ id: b.id, name: b.name, position: (i + 1) * 10, floorIds: [...b.floorIds] });
      dispatch('saved');
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'The groups could not be moved.');
    } finally { busy = false; }
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    busy = true; error = ''; done = '';
    try {
      await deleteFloorGroup(row.id);
      logAudit('delete', 'floor_group', row.id, row.name, { appId: 'admin', eventCategory: 'admin', severity: 'info' });
      dispatch('saved');
      done = `${row.name} deleted.`;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'The group could not be deleted.');
    } finally { busy = false; pendingDelete = null; }
  }

  function remove(/** @type {any} */ row) {
    if (row.id) pendingDelete = row;
    else rows = rows.filter((r) => r !== row);
  }
</script>

<div class="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-4">
  <div class="flex items-start justify-between gap-3 flex-wrap">
    <div>
      <h3 class="text-sm font-semibold text-slate-200">Floor groups</h3>
      <p class="text-xs text-slate-500 mt-0.5">
        Each group is a button beside All on Building Assets → Components. A floor can be in several groups, or none.
        A group with no floors is not shown.
      </p>
    </div>
    <Button variant="secondary" size="small" on:click={addGroup} disabled={busy}>+ Add a group</Button>
  </div>

  {#if error}<ErrorDisplay message={error} onDismiss={() => (error = '')} />{/if}
  {#if done}<p class="text-xs text-green-400" role="status">{done}</p>{/if}

  {#if rows.length === 0}
    <p class="text-sm text-slate-400">No floor groups yet, so Components offers only All and the floor list.</p>
  {/if}

  {#each rows as row, i (row.key)}
    <div class="border border-slate-700 rounded-lg p-3 space-y-3" data-testid="floor-group">
      <div class="flex items-start gap-2 flex-wrap">
        <div class="w-56">
          <FormInput label="Name" bind:value={row.name} on:input={() => { row.dirty = true; }} error={row.dirty ? problemOf(row) : ''} />
        </div>
        <div class="flex items-center gap-1 ml-auto">
          <Button variant="tertiary" size="xs" ariaLabel="Move {row.name} earlier" on:click={() => swap(i, i - 1)} disabled={busy || i === 0}>↑</Button>
          <Button variant="tertiary" size="xs" ariaLabel="Move {row.name} later" on:click={() => swap(i, i + 1)} disabled={busy || i === rows.length - 1}>↓</Button>
          <Button variant="danger" size="small" on:click={() => remove(row)} disabled={busy}>Delete</Button>
          <Button variant="primary" size="small" on:click={() => save(row)} disabled={busy || !row.dirty || !!problemOf(row)}>Save</Button>
        </div>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        {#each floors as f (f.id)}
          <label class="flex items-center gap-1.5 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={row.floorIds.has(f.id)} on:change={() => toggleFloor(row, f.id)} disabled={busy} />
            {f.name} ({f.short_name})
          </label>
        {/each}
      </div>
      {#if row.floorIds.size === 0}<p class="text-xs text-amber-300">No floors yet, so this button is not shown.</p>{/if}
    </div>
  {/each}
</div>

<ConfirmDialog show={!!pendingDelete} danger={true} processing={busy}
  title="Delete this floor group?"
  message={`"${pendingDelete?.name ?? ''}" goes from the Components tab. The floors and components are not changed. A saved preset that uses it will show all floors.`}
  on:confirm={confirmDelete} on:cancel={() => (pendingDelete = null)} />
