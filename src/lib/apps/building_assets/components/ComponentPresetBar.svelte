<!-- src/lib/apps/building_assets/components/ComponentPresetBar.svelte -->
<!-- Horizontal preset bar shown above the Components tab filter row.
     Presets are split into two display groups based on sort_order:

       Group 1 — Standard reports (sort_order IS NOT NULL)
                 Sorted ascending by sort_order.  Created by admins and visible
                 to all users.  Delete ✕ visible to admins only.

       Group 2 — Personal presets (sort_order IS NULL)
                 Sorted alphabetically.  Visible only to owner (RLS).
                 Delete ✕ always visible.

     Save as… form:
       All users:   name field only → saved as personal (sort_order = null)
       Admins only: additional Order # field → if set, saved as a standard report

     Events:
       apply        — { filters, columns, report }
       savepreset   — { name, filters, columns, report, sortOrder: int|null }
       deletepreset — { id } -->

<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { configMatches }   from '../componentPresets.js';
  import { permissions }     from '$lib/stores/permissions';

  export let currentConfig = null;   // { filters, columns } — live state from parent
  export let presets       = [];     // all DB presets visible to this user
  export let saving        = false;  // true while parent is persisting a new preset

  const dispatch = createEventDispatcher();

  // -- Group and sort ------------------------------------------------
  $: standardGroup = presets
    .filter(p => p.sort_order != null)
    .sort((a, b) => a.sort_order - b.sort_order);

  $: personalGroup = presets
    .filter(p => p.sort_order == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  $: showDivider = standardGroup.length > 0 && personalGroup.length > 0;

  // -- Apply ---------------------------------------------------------
  function apply(preset) {
    dispatch('apply', {
      filters: { ...preset.filters },
      columns: { ...preset.columns },
      report:  { ...(preset.report ?? {}) },
    });
  }

  // -- Save-as flow --------------------------------------------------
  let showSaveInput  = false;
  let savingName     = '';
  let sortOrderInput = '';   // admin-only field; '' = null (personal)
  let nameInput;

  async function startSave() {
    showSaveInput  = true;
    savingName     = '';
    sortOrderInput = '';
    await tick();
    nameInput?.focus();
  }

  function confirmSave() {
    const name = savingName.trim();
    if (!name || !currentConfig) return;

    // Sort order only honoured when admin fills the field with a valid integer
    let sortOrder = null;
    if ($permissions.isAdmin) {
      const raw = String(sortOrderInput ?? '').trim();
      if (raw !== '') {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) sortOrder = n;
      }
    }

    dispatch('savepreset', {
      name,
      filters:   { ...currentConfig.filters },
      columns:   { ...currentConfig.columns },
      report:    { ...(currentConfig.report ?? {}) },
      sortOrder,
    });
    showSaveInput  = false;
    savingName     = '';
    sortOrderInput = '';
  }

  function cancelSave() {
    showSaveInput  = false;
    savingName     = '';
    sortOrderInput = '';
  }

  function onKeydown(e) {
    if (e.key === 'Enter')  confirmSave();
    if (e.key === 'Escape') cancelSave();
  }

  // -- Delete (two-click: arm then confirm, auto-cancel after 3 s) --
  let confirmingId  = null;
  let confirmTimer  = null;

  function armDelete(id, e) {
    e.stopPropagation();
    if (confirmingId === id) {
      // Second click — confirm
      clearTimeout(confirmTimer);
      confirmingId = null;
      dispatch('deletepreset', { id });
      return;
    }
    // First click — arm
    clearTimeout(confirmTimer);
    confirmingId = id;
    confirmTimer = setTimeout(() => { confirmingId = null; }, 3000);
  }

  function cancelDelete(e) {
    e.stopPropagation();
    clearTimeout(confirmTimer);
    confirmingId = null;
  }
</script>

<div class="px-4 py-2 border-b border-slate-700/40 flex flex-wrap items-center gap-1.5 bg-slate-800/30">

  <span class="text-[10px] text-slate-300 uppercase tracking-wider font-semibold shrink-0 mr-1">
    Preset
  </span>

  <!-- -- Group 1: standard reports (sort_order IS NOT NULL) ---------- -->
  {#each standardGroup as p (p.id)}
    {@const active    = configMatches(p, currentConfig)}
    {@const confirming = confirmingId === p.id}
    <div class="flex items-center rounded overflow-hidden border transition-colors
                {confirming
                  ? 'border-red-500/50 bg-red-900/20'
                  : active
                    ? 'border-purple-500/50 bg-purple-800/30'
                    : 'border-slate-600/40 bg-slate-700/50 hover:border-slate-500/60'}">
      <button
        on:click={() => apply(p)}
        class="px-2.5 py-0.5 text-[11px] font-medium transition-colors
               {confirming ? 'text-red-300/70' : active ? 'text-purple-200' : 'text-slate-300 hover:text-white'}"
      >{p.name}</button>
      <!-- Delete only for admins on standard presets -->
      {#if $permissions.isAdmin}
        <button
          on:click={e => armDelete(p.id, e)}
          class="px-1.5 py-0.5 text-[10px] border-l transition-colors
                 {confirming
                   ? 'border-red-500/40 bg-red-700/60 text-white font-semibold'
                   : active
                     ? 'border-purple-500/40 text-purple-400 hover:text-red-400 hover:bg-purple-900/40'
                     : 'border-slate-600/40 text-slate-600 hover:text-red-400 hover:bg-slate-700'}"
          title={confirming ? 'Click again to confirm delete' : 'Remove standard preset'}
        >{confirming ? 'Delete?' : '✕'}</button>
        {#if confirming}
          <button
            on:click={cancelDelete}
            class="px-1.5 py-0.5 text-[10px] border-l border-red-500/40
                   text-red-400/70 hover:text-slate-300 transition-colors"
            title="Cancel"
          >✕</button>
        {/if}
      {/if}
    </div>
  {/each}

  <!-- Empty state hint if no presets at all yet -->
  {#if presets.length === 0}
    <span class="text-[10px] text-slate-700 italic">
      {$permissions.isAdmin ? 'No presets yet — save one below' : 'No presets yet'}
    </span>
  {/if}

  <!-- -- Divider ------------------------------------------------------ -->
  {#if showDivider}
    <span class="text-slate-700 select-none px-0.5">|</span>
  {/if}

  <!-- -- Group 2: personal presets (sort_order IS NULL) ------------- -->
  {#each personalGroup as p (p.id)}
    {@const active     = configMatches(p, currentConfig)}
    {@const confirming = confirmingId === p.id}
    <div class="flex items-center rounded overflow-hidden border transition-colors
                {confirming
                  ? 'border-red-500/50 bg-red-900/20'
                  : active
                    ? 'border-purple-500/50 bg-purple-800/30'
                    : 'border-slate-600/50 bg-slate-700/60 hover:border-slate-500/60'}">
      <button
        on:click={() => apply(p)}
        class="px-2.5 py-0.5 text-[11px] transition-colors
               {confirming ? 'text-red-300/70' : active ? 'text-purple-200 font-medium' : 'text-slate-300 hover:text-white'}"
      >{p.name}</button>
      <button
        on:click={e => armDelete(p.id, e)}
        class="px-1.5 py-0.5 text-[10px] border-l transition-colors
               {confirming
                 ? 'border-red-500/40 bg-red-700/60 text-white font-semibold'
                 : active
                   ? 'border-purple-500/40 text-purple-400 hover:text-red-400 hover:bg-purple-900/40'
                   : 'border-slate-600/50 text-slate-600 hover:text-red-400 hover:bg-slate-700'}"
        title={confirming ? 'Click again to confirm delete' : 'Remove preset'}
      >{confirming ? 'Delete?' : '✕'}</button>
      {#if confirming}
        <button
          on:click={cancelDelete}
          class="px-1.5 py-0.5 text-[10px] border-l border-red-500/40
                 text-red-400/70 hover:text-slate-300 transition-colors"
          title="Cancel"
        >✕</button>
      {/if}
    </div>
  {/each}

  <!-- -- Save as… ---------------------------------------------------- -->
  <div class="flex items-center gap-1.5 ml-auto">
    {#if showSaveInput}
      <!-- Name -->
      <input
        bind:this={nameInput}
        type="text"
        bind:value={savingName}
        on:keydown={onKeydown}
        placeholder="Name…"
        class="bg-slate-700 border border-purple-500/60 rounded px-2 py-0.5 text-[11px]
               text-white placeholder:text-slate-500
               focus:outline-none focus:border-purple-400 w-32"
      />
      <!-- Order # (admin only) -->
      {#if $permissions.isAdmin}
        <input
          type="text"
          inputmode="numeric"
          bind:value={sortOrderInput}
          on:keydown={onKeydown}
          placeholder="Order #"
          title="Set a display order to make this a standard report visible to all users. Leave blank to save as a personal preset."
          class="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-[11px]
                 text-white placeholder:text-slate-500
                 focus:outline-none focus:border-purple-400 w-20"
        />
      {/if}
      <button
        on:click={confirmSave}
        disabled={!savingName.trim() || saving}
        class="px-2 py-0.5 rounded text-[11px] bg-purple-600 hover:bg-purple-500
               text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >{saving ? 'Saving…' : 'Save'}</button>
      <button
        on:click={cancelSave}
        class="px-1.5 py-0.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
      >Cancel</button>
    {:else}
      <button
        on:click={startSave}
        class="px-2.5 py-0.5 rounded text-[11px] border border-slate-600
               bg-transparent text-slate-500 hover:text-slate-300 hover:border-slate-500
               transition-colors"
      >+ Save as…</button>
    {/if}
  </div>

</div>
