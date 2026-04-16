<!-- ComponentLinks.svelte -->
<!-- Manages the list of component_links for a single component.
     Reads from $buildingAssetsStore.componentLinks[componentId].
     Writes via store CRUD methods (addComponentLink / updateComponentLink / deleteComponentLink).
     readOnly prop hides all mutating controls. -->
<script>
  import { buildingAssetsStore, buildRef } from '../stores/buildingAssetsStore.js';
  import { inp, sec }                      from '../ui.js';
  import { permissions }                   from '$lib/stores/permissions.js';
  import { fmtComponentRef, findComponentByRef } from '$lib/utils/componentRef.js';
  import ComponentDetailView               from './ComponentDetailView.svelte';

  export let componentId;     // string — the component whose links we manage
  export let components = []; // all components[] — for the ref datalist
  export let floors     = [];
  export let facilities = [];
  export let types      = [];
  export let readOnly   = false;

  // Find the from-component to know its floor for sorting
  $: fromComponent = components.find(c => c.id === componentId);
  $: fromFloorId   = fromComponent?.floor_id ?? null;

  // Build sorted select options — current floor first, then floor/initial/id alphabetically
  $: selectOptions = components
    .filter(c => c.id !== componentId)
    .map(c => {
      const floor   = floors.find(f => f.id === c.floor_id);
      const type    = types.find(t => t.code === c.type_code);
      const floorSN = floor?.short_name ?? '?';
      const initial = type?.initial     ?? '?';
      const assetId = c.asset_id        || '—';
      const short   = `${floorSN}/${initial}/${assetId}`;
      const display = short;
      return {
        value:     buildRef(c, floors, facilities, types),
        display,
        sameFloor: c.floor_id === fromFloorId,
        floorSN,
        initial,
        assetId:   c.asset_id ?? ''
      };
    })
    .sort((a, b) => {
      if (a.sameFloor !== b.sameFloor) return a.sameFloor ? -1 : 1;
      const fl = a.floorSN.localeCompare(b.floorSN, undefined, { numeric: true });
      if (fl !== 0) return fl;
      const ini = a.initial.localeCompare(b.initial);
      if (ini !== 0) return ini;
      return a.assetId.localeCompare(b.assetId, undefined, { numeric: true });
    });

  $: thisFloorOptions  = selectOptions.filter(o =>  o.sameFloor);
  $: otherFloorOptions = selectOptions.filter(o => !o.sameFloor);

  // Current links from store
  $: links = $buildingAssetsStore.componentLinks[componentId] ?? [];

  // ── Add form state ────────────────────────────────────────────────────
  let showAddForm  = false;
  let addRef       = '';
  let addLinkType  = '';
  let addSaving    = false;
  let addError     = '';

  // ── Inline edit state ─────────────────────────────────────────────────
  let editingId       = null;   // link id being edited
  let editLinkType    = '';
  let editSaving      = false;

  // ── Delete confirm ────────────────────────────────────────────────────
  let confirmDeleteId = null;
  let deleting        = false;

  async function handleAdd() {
    if (!addRef.trim()) return;
    addSaving = true;
    addError  = '';
    try {
      await buildingAssetsStore.addComponentLink(componentId, addRef, addLinkType);
      addRef      = '';
      addLinkType = '';
      showAddForm = false;
    } catch (err) {
      addError = err.message;
    } finally {
      addSaving = false;
    }
  }

  function startEdit(link) {
    editingId    = link.id;
    editLinkType = link.link_type ?? '';
  }

  async function handleEditSave() {
    if (!editingId) return;
    editSaving = true;
    try {
      await buildingAssetsStore.updateComponentLink(editingId, componentId, editLinkType);
      editingId = null;
    } catch (err) {
      // error surfaced via store; just cancel edit
      editingId = null;
    } finally {
      editSaving = false;
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    deleting = true;
    try {
      await buildingAssetsStore.deleteComponentLink(confirmDeleteId, componentId);
    } finally {
      deleting        = false;
      confirmDeleteId = null;
    }
  }

  $: canModify = !readOnly && ($permissions.isAdmin || $permissions.canModify);

  // ── Linked component view modal ───────────────────────────────────────
  let viewingComponent = null;

  function openLinkedComponent(ref) {
    const store = $buildingAssetsStore;
    viewingComponent = findComponentByRef(ref, store.components, store.floors, store.facilities, store.types) ?? null;
  }
</script>

<section class="border border-slate-700 rounded-lg p-4 bg-slate-800/30">

  <!-- Header -->
  <div class="flex items-center justify-between mb-3">
    <p class={sec}>
      Linked Components
      {#if links.length > 0}
        <span class="ml-1 font-mono text-slate-500 normal-case">({links.length})</span>
      {/if}
    </p>
    {#if canModify && !showAddForm}
      <button
        on:click={() => { showAddForm = true; addRef = ''; addLinkType = ''; addError = ''; }}
        class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300
               border border-slate-600 transition-colors"
      >
        + Add Link
      </button>
    {/if}
  </div>

  <!-- Add form -->
  {#if showAddForm && canModify}
    <div class="mb-3 p-3 rounded-lg bg-slate-700/50 border border-purple-500/30 space-y-2">
      <div>
        <p class="text-xs text-slate-400 mb-1">Linked component <span class="text-red-400">*</span></p>
        <select bind:value={addRef} class="{inp} font-mono">
          <option value="">— select component —</option>
          {#if thisFloorOptions.length > 0}
            <optgroup label="This floor">
              {#each thisFloorOptions as opt}
                <option value={opt.value}>{opt.display}</option>
              {/each}
            </optgroup>
          {/if}
          {#if otherFloorOptions.length > 0}
            <optgroup label="Other floors">
              {#each otherFloorOptions as opt}
                <option value={opt.value}>{opt.display}</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">Link type <span class="text-slate-600">(optional)</span></p>
        <input
          type="text"
          bind:value={addLinkType}
          placeholder="e.g. Test with, Related, Feeds…"
          class="{inp} placeholder-slate-600"
        />
      </div>
      {#if addError}
        <p class="text-xs text-red-400">{addError}</p>
      {/if}
      <div class="flex gap-2 justify-end pt-1">
        <button
          on:click={() => { showAddForm = false; addRef = ''; addLinkType = ''; addError = ''; }}
          class="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >Cancel</button>
        <button
          on:click={handleAdd}
          disabled={!addRef.trim() || addSaving}
          class="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-40
                 disabled:cursor-not-allowed text-white transition-colors"
        >{addSaving ? 'Adding…' : 'Add Link'}</button>
      </div>
    </div>
  {/if}

  <!-- Link list -->
  {#if links.length === 0}
    <p class="text-sm text-slate-500 italic">No linked components.</p>
  {:else}
    <div class="space-y-1.5">
      {#each links as link (link.id)}

        <!-- Delete confirm inline -->
        {#if confirmDeleteId === link.id}
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/40 text-xs text-red-300">
            <span class="flex-1">Delete this link?</span>
            <button
              on:click={handleDelete}
              disabled={deleting}
              class="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white disabled:opacity-50"
            >{deleting ? '…' : 'Delete'}</button>
            <button
              on:click={() => confirmDeleteId = null}
              class="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
            >Cancel</button>
          </div>

        <!-- Inline edit row -->
        {:else if editingId === link.id}
          <div class="p-2.5 rounded-lg bg-slate-700/50 border border-purple-500/30 space-y-1.5">
            <p class="text-xs font-mono text-purple-300 truncate">{fmtComponentRef(link.to_component_ref, types)}</p>
            <div class="flex gap-2 items-center">
              <input
                type="text"
                bind:value={editLinkType}
                placeholder="Link type (optional)"
                class="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs
                       text-white focus:outline-none focus:border-purple-500"
              />
              <button
                on:click={handleEditSave}
                disabled={editSaving}
                class="text-xs px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500
                       disabled:opacity-40 text-white transition-colors"
              >{editSaving ? '…' : 'Save'}</button>
              <button
                on:click={() => editingId = null}
                class="text-xs px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600
                       text-slate-300 transition-colors"
              >Cancel</button>
            </div>
          </div>

        <!-- Normal display row -->
        {:else}
          <div class="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-700/40
                      border border-slate-700/60 group">
            <span class="text-slate-400 mt-0.5 shrink-0">🔗</span>
            <div class="flex-1 min-w-0">
              <button
                on:click={() => openLinkedComponent(link.to_component_ref)}
                class="text-sm font-mono text-purple-300 hover:text-purple-200
                       hover:underline transition-colors truncate block text-left w-full"
                title="View component detail"
              >{fmtComponentRef(link.to_component_ref, types)}</button>
              {#if link.link_type}
                <span class="inline-block mt-0.5 text-xs px-1.5 py-0.5 rounded
                             bg-slate-600/60 text-slate-300 border border-slate-600">
                  {link.link_type}
                </span>
              {:else}
                <span class="text-xs text-slate-600 italic">General link</span>
              {/if}
            </div>
            {#if canModify}
              <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  on:click={() => startEdit(link)}
                  class="text-xs px-1.5 py-0.5 rounded text-slate-400 hover:text-white
                         hover:bg-slate-600 transition-colors"
                  title="Edit link type"
                >✎</button>
                <button
                  on:click={() => confirmDeleteId = link.id}
                  class="text-xs px-1.5 py-0.5 rounded text-slate-400 hover:text-red-400
                         hover:bg-red-900/20 transition-colors"
                  title="Delete link"
                >✕</button>
              </div>
            {/if}
          </div>
        {/if}

      {/each}
    </div>
  {/if}

</section>

<!-- ── Linked component detail overlay ──────────────────────────────── -->
{#if viewingComponent}
  {@const store = $buildingAssetsStore}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60"
    on:click|self={() => viewingComponent = null}
    on:keydown={e => e.key === 'Escape' && (viewingComponent = null)}
  >
    <div class="w-full max-w-2xl">
      <ComponentDetailView
        component={viewingComponent}
        types={store.types}
        floors={store.floors}
        facilities={store.facilities}
        attrDefs={store.attrDefs}
        attrOptions={store.attrOptions}
        components={store.components}
        attrs={store.componentAttrs[viewingComponent.id] ?? []}
        on:close={() => viewingComponent = null}
      />
    </div>
  </div>
{/if}
