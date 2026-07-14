<!-- src/lib/apps/admin/components/MaintenanceGroupsTab.svelte -->
<!-- CRUD for maintenance_groups.
     Each group collects a set of building systems, component types, and spaces
     that should be planned for renewal together. -->
<script>
  import { maintenanceGroupsStore } from '../stores/maintenanceGroupsStore.js';
  import Modal         from '$lib/components/common/Modal.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  // Building-assets reference data passed in from AdminApp
  export let systems    = [];   // building_systems[]
  export let types      = [];   // component_types[]
  export let spaces     = [];   // spaces[]
  export let floors     = [];   // floors[] (for labelling spaces)

  // ── Store ───────────────────────────────────────────────────────────────
  $: ({ groups, loading, error } = $maintenanceGroupsStore);

  // ── Modal state ─────────────────────────────────────────────────────────
  let showModal    = false;
  let isNew        = false;
  let saving       = false;
  let modalError   = '';
  let confirmId    = null;   // id being confirmed for delete

  // ── Edit form fields ────────────────────────────────────────────────────
  let editId        = null;
  let editName      = '';
  let editNotes     = '';
  let editSystems   = new Set();   // system IDs
  let editTypes     = new Set();   // type codes
  let editSpaces    = new Set();   // space IDs
  let spaceSearch   = '';

  // ── Derived ─────────────────────────────────────────────────────────────
  // Types grouped by system (for the checklist)
  $: typesBySystem = systems.map(sys => ({
    sys,
    types: types.filter(t => t.building_system_id === sys.id && t.visible !== false),
  })).filter(g => g.types.length > 0);

  // Spaces filtered by search, labelled with floor name
  $: floorById = Object.fromEntries(floors.map(f => [f.id, f]));
  $: labelledSpaces = spaces.map(sp => ({
    ...sp,
    floorName: floorById[sp.floor_id]?.name ?? floorById[sp.floor_id]?.short_name ?? '—',
  })).sort((a, b) => a.floorName.localeCompare(b.floorName) || a.name.localeCompare(b.name));

  $: filteredSpaces = spaceSearch.trim()
    ? labelledSpaces.filter(sp =>
        sp.name.toLowerCase().includes(spaceSearch.toLowerCase()) ||
        sp.floorName.toLowerCase().includes(spaceSearch.toLowerCase()) ||
        (sp.type ?? '').toLowerCase().includes(spaceSearch.toLowerCase()))
    : labelledSpaces;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function systemName(id)   { return systems.find(s => s.id === id)?.name ?? id; }
  function typeName(code)   { return types.find(t => t.code === code)?.name ?? code; }
  function spaceName(sid)   {
    const sp = spaces.find(s => s.id === sid);
    if (!sp) return sid;
    const fl = floorById[sp.floor_id]?.short_name ?? '?';
    return `${fl} · ${sp.name}`;
  }

  function openNew() {
    isNew       = true;
    editId      = null;
    editName    = '';
    editNotes   = '';
    editSystems = new Set();
    editTypes   = new Set();
    editSpaces  = new Set();
    spaceSearch = '';
    modalError  = '';
    showModal   = true;
  }

  function openEdit(g) {
    isNew       = false;
    editId      = g.id;
    editName    = g.name;
    editNotes   = g.notes ?? '';
    editSystems = new Set(g.system_ids  ?? []);
    editTypes   = new Set(g.type_codes  ?? []);
    editSpaces  = new Set(g.space_ids   ?? []);
    spaceSearch = '';
    modalError  = '';
    showModal   = true;
  }

  function toggleSet(set, key) {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  }

  async function handleSave() {
    if (!editName.trim()) { modalError = 'Group name is required.'; return; }
    saving = true; modalError = '';
    try {
      const data = {
        name:       editName,
        notes:      editNotes,
        system_ids: [...editSystems],
        type_codes: [...editTypes],
        space_ids:  [...editSpaces],
      };
      if (isNew) {
        await maintenanceGroupsStore.create(data);
      } else {
        await maintenanceGroupsStore.save(editId, data);
      }
      showModal = false;
    } catch (err) {
      modalError = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete(id) {
    if (confirmId !== id) { confirmId = id; return; }
    confirmId = null;
    try {
      await maintenanceGroupsStore.remove(id);
    } catch (err) {
      // error will show in store
    }
  }
</script>

<!-- ── Header ──────────────────────────────────────────────────────────── -->
<div class="flex-between mb-4">
  <div>
    <h3 class="text-lg font-semibold text-white">Maintenance Groups</h3>
    <p class="text-muted-sm mt-0.5">
      Group systems, types, and spaces for 10-year planning. Seeded from building systems.
    </p>
  </div>
  <Button variant="primary" size="medium" icon="plus" on:click={openNew}>
    New Group
  </Button>
</div>

<ErrorDisplay message={error} onDismiss={() => maintenanceGroupsStore.load()} />

{#if loading}
  <LoadingSpinner />

{:else if groups.length === 0}
  <div class="empty-state">
    No groups yet. Run migration 044 to seed from systems, or click New Group.
  </div>

{:else}
  <!-- ── Groups table ───────────────────────────────────────────────────── -->
  <div class="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-700 text-left">
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Systems</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden md:table-cell">Types</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Spaces</th>
          <th class="px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide hidden lg:table-cell">Notes</th>
          <th class="px-4 py-2.5 w-28"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-700/60">
        {#each groups as g (g.id)}
          {@const sysCount  = (g.system_ids  ?? []).length}
          {@const typeCount = (g.type_codes  ?? []).length}
          {@const spCount   = (g.space_ids   ?? []).length}
          <tr class="hover:bg-slate-700/30 transition-colors">
            <td class="px-4 py-3 font-medium text-white">
              {g.name}
              <!-- Mobile: show counts inline -->
              <div class="flex gap-1 mt-1 md:hidden">
                {#if sysCount}  <span class="badge-purple">{sysCount} sys</span>  {/if}
                {#if typeCount} <span class="badge-gray">{typeCount} types</span> {/if}
                {#if spCount}   <span class="badge-blue">{spCount} spaces</span>  {/if}
              </div>
            </td>
            <td class="px-4 py-3 hidden md:table-cell">
              {#if sysCount}
                <div class="flex flex-wrap gap-1">
                  {#each (g.system_ids ?? []).slice(0, 3) as sid}
                    <span class="pill-purple text-xs">{systemName(sid)}</span>
                  {/each}
                  {#if sysCount > 3}
                    <span class="text-xs text-slate-500">+{sysCount - 3}</span>
                  {/if}
                </div>
              {:else}
                <span class="text-slate-600 text-xs">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 hidden md:table-cell">
              {#if typeCount}
                <span class="badge-gray">{typeCount} type{typeCount !== 1 ? 's' : ''}</span>
              {:else}
                <span class="text-slate-600 text-xs">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 hidden lg:table-cell">
              {#if spCount}
                <span class="badge-blue">{spCount} space{spCount !== 1 ? 's' : ''}</span>
              {:else}
                <span class="text-slate-600 text-xs">—</span>
              {/if}
            </td>
            <td class="px-4 py-3 hidden lg:table-cell max-w-[180px]">
              {#if g.notes}
                <p class="text-xs text-slate-400 truncate">{g.notes}</p>
              {:else}
                <span class="text-slate-700 text-xs">—</span>
              {/if}
            </td>
            <td class="px-4 py-3">
              <div class="flex gap-1.5 justify-end">
                <button
                  on:click={() => openEdit(g)}
                  class="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                >Edit</button>
                {#if confirmId === g.id}
                  <button
                    on:click={() => confirmId = null}
                    class="px-2 py-1 text-xs rounded bg-slate-700 text-slate-400 transition-colors"
                  >Keep</button>
                  <button
                    on:click={() => handleDelete(g.id)}
                    class="px-2.5 py-1 text-xs rounded bg-red-700 hover:bg-red-600 text-white font-medium transition-colors"
                  >Confirm</button>
                {:else}
                  <button
                    on:click={() => handleDelete(g.id)}
                    class="px-2.5 py-1 text-xs rounded bg-red-900/40 hover:bg-red-800/50 text-red-400 border border-red-800/40 transition-colors"
                  >Delete</button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<!-- ── Edit / New modal ──────────────────────────────────────────────────── -->
<Modal bind:show={showModal} size="xlarge" title={isNew ? 'New Maintenance Group' : 'Edit Group'}>

  {#if modalError}
    <div class="alert-error mb-4 text-sm">{modalError}</div>
  {/if}

  <!-- Name + Notes -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    <div class="flex flex-col gap-1">
      <label for="mg-name" class="text-label">Name <span class="text-red-400">*</span></label>
      <input
        id="mg-name"
        type="text"
        bind:value={editName}
        placeholder="e.g. Lighting"
        class="input"
      />
    </div>
    <div class="flex flex-col gap-1">
      <label for="mg-notes" class="text-label">Notes</label>
      <input
        id="mg-notes"
        type="text"
        bind:value={editNotes}
        placeholder="Optional description…"
        class="input"
      />
    </div>
  </div>

  <!-- Three-column member selection -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

    <!-- Systems -->
    <div class="attr-panel flex flex-col">
      <p class="attr-panel-title text-purple-400">
        Systems
        {#if editSystems.size > 0}
          <span class="ml-1 text-xs font-normal text-slate-400">({editSystems.size} selected)</span>
        {/if}
      </p>
      <div class="flex flex-col gap-1.5 overflow-y-auto max-h-64 pr-1">
        {#if systems.length === 0}
          <p class="text-xs text-slate-500 italic">No systems loaded.</p>
        {:else}
          {#each systems as sys (sys.id)}
            <!-- svelte-ignore a11y-label-has-associated-control -->
            <label class="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                class="checkbox"
                checked={editSystems.has(sys.id)}
                on:change={() => editSystems = toggleSet(editSystems, sys.id)}
              />
              <span class="text-sm {editSystems.has(sys.id) ? 'text-white' : 'text-slate-400'} group-hover:text-white transition-colors">
                {sys.name}
              </span>
            </label>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Component Types (grouped by system) -->
    <div class="attr-panel flex flex-col">
      <p class="attr-panel-title text-purple-400">
        Component Types
        {#if editTypes.size > 0}
          <span class="ml-1 text-xs font-normal text-slate-400">({editTypes.size} selected)</span>
        {/if}
      </p>
      <div class="flex flex-col gap-2 overflow-y-auto max-h-64 pr-1">
        {#if typesBySystem.length === 0}
          <p class="text-xs text-slate-500 italic">No types loaded.</p>
        {:else}
          {#each typesBySystem as { sys, types: sysTypes } (sys.id)}
            <div>
              <p class="text-xs font-semibold text-slate-500 mb-1">{sys.name}</p>
              <div class="flex flex-col gap-1 pl-1">
                {#each sysTypes as t (t.code)}
                  <!-- svelte-ignore a11y-label-has-associated-control -->
                  <label class="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      class="checkbox-sm"
                      checked={editTypes.has(t.code)}
                      on:change={() => editTypes = toggleSet(editTypes, t.code)}
                    />
                    <span class="text-xs {editTypes.has(t.code) ? 'text-white' : 'text-slate-400'} group-hover:text-white transition-colors">
                      {t.name}
                    </span>
                  </label>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Spaces (searchable) -->
    <div class="attr-panel flex flex-col">
      <p class="attr-panel-title text-purple-400">
        Spaces
        {#if editSpaces.size > 0}
          <span class="ml-1 text-xs font-normal text-slate-400">({editSpaces.size} selected)</span>
        {/if}
      </p>
      <input
        type="text"
        bind:value={spaceSearch}
        placeholder="Search spaces…"
        class="input text-xs mb-2"
      />
      <div class="flex flex-col gap-1 overflow-y-auto max-h-52 pr-1">
        {#if spaces.length === 0}
          <p class="text-xs text-slate-500 italic">No spaces loaded.</p>
        {:else if filteredSpaces.length === 0}
          <p class="text-xs text-slate-500 italic">No spaces match.</p>
        {:else}
          {#each filteredSpaces as sp (sp.id)}
            <!-- svelte-ignore a11y-label-has-associated-control -->
            <label class="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                class="checkbox-sm"
                checked={editSpaces.has(sp.id)}
                on:change={() => editSpaces = toggleSet(editSpaces, sp.id)}
              />
              <span class="text-xs leading-tight {editSpaces.has(sp.id) ? 'text-white' : 'text-slate-400'} group-hover:text-white transition-colors">
                <span class="text-slate-500">{sp.floorName}</span> · {sp.name}
              </span>
            </label>
          {/each}
        {/if}
      </div>
    </div>

  </div>

  <!-- Footer actions -->
  <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
    <Button variant="secondary" on:click={() => showModal = false} disabled={saving}>
      Cancel
    </Button>
    <Button variant="primary" on:click={handleSave} disabled={saving || !editName.trim()}>
      {saving ? 'Saving…' : isNew ? 'Create Group' : 'Save Changes'}
    </Button>
  </div>

</Modal>
