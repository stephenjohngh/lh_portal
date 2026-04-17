<!-- src/lib/apps/building_assets/components/ComponentPresetBar.svelte -->
<!-- Horizontal preset bar shown above the Components tab filter row.
     Built-in presets are always visible.  User presets appear after a divider
     and can be deleted.  "Save as…" captures the current filter+column config
     under a user-supplied name and persists it to localStorage.

     Events:
       apply       — { filters, columns }  — parent should apply this config
       savepreset  — { name, filters, columns }  — parent should persist to userPresets
       deletepreset — { id }  — parent should remove from userPresets + persist -->

<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { BUILTIN_PRESETS, configMatches } from '../componentPresets.js';

  export let currentConfig = null;   // { filters, columns } — live state from parent
  export let userPresets   = [];     // [{ id, name, filters, columns }] — managed by parent

  const dispatch = createEventDispatcher();

  let showSaveInput = false;
  let savingName    = '';
  let nameInput;    // bound to the text input for programmatic focus

  // ── Apply a preset ────────────────────────────────────────────────
  function apply(preset) {
    dispatch('apply', {
      filters: { ...preset.filters },
      columns: { ...preset.columns },
    });
  }

  // ── Save-as flow ──────────────────────────────────────────────────
  async function startSave() {
    showSaveInput = true;
    savingName    = '';
    await tick();
    nameInput?.focus();
  }

  function confirmSave() {
    const name = savingName.trim();
    if (!name || !currentConfig) return;
    dispatch('savepreset', {
      name,
      filters: { ...currentConfig.filters },
      columns: { ...currentConfig.columns },
    });
    showSaveInput = false;
    savingName    = '';
  }

  function cancelSave() {
    showSaveInput = false;
    savingName    = '';
  }

  function onKeydown(e) {
    if (e.key === 'Enter')  confirmSave();
    if (e.key === 'Escape') cancelSave();
  }

  // ── Delete a user preset ──────────────────────────────────────────
  function deletePreset(id, e) {
    e.stopPropagation();
    dispatch('deletepreset', { id });
  }
</script>

<div class="px-4 py-2 border-b border-slate-700/40 flex flex-wrap items-center gap-1.5 bg-slate-800/30">

  <span class="text-[10px] text-slate-500 uppercase tracking-wider font-medium shrink-0 mr-1">
    Preset
  </span>

  <!-- ── Built-in presets ──────────────────────────────────────────── -->
  {#each BUILTIN_PRESETS as p (p.id)}
    {@const active = configMatches(p, currentConfig)}
    <button
      on:click={() => apply(p)}
      class="px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors
             {active
               ? 'bg-purple-600 text-white'
               : 'bg-slate-700/80 text-slate-400 hover:bg-slate-600 hover:text-slate-200'}"
    >{p.name}</button>
  {/each}

  <!-- ── Divider (only when user presets exist) ────────────────────── -->
  {#if userPresets.length > 0}
    <span class="text-slate-700 select-none px-0.5">│</span>
  {/if}

  <!-- ── User presets ──────────────────────────────────────────────── -->
  <!-- Each chip is a div containing two sibling buttons — not nested. -->
  {#each userPresets as p (p.id)}
    {@const active = configMatches(p, currentConfig)}
    <div class="flex items-center rounded overflow-hidden border transition-colors
                {active
                  ? 'border-purple-500/50 bg-purple-800/30'
                  : 'border-slate-600/50 bg-slate-700/60 hover:border-slate-500/60'}">
      <button
        on:click={() => apply(p)}
        class="px-2.5 py-0.5 text-[11px] transition-colors
               {active ? 'text-purple-200 font-medium' : 'text-slate-300 hover:text-white'}"
      >{p.name}</button>
      <button
        on:click={e => deletePreset(p.id, e)}
        class="px-1.5 py-0.5 text-[10px] border-l transition-colors
               {active
                 ? 'border-purple-500/40 text-purple-400 hover:text-red-400 hover:bg-purple-900/40'
                 : 'border-slate-600/50 text-slate-600 hover:text-red-400 hover:bg-slate-700'}"
        title="Remove preset"
      >✕</button>
    </div>
  {/each}

  <!-- ── Save as… ──────────────────────────────────────────────────── -->
  <div class="flex items-center gap-1.5 ml-auto">
    {#if showSaveInput}
      <input
        bind:this={nameInput}
        type="text"
        bind:value={savingName}
        on:keydown={onKeydown}
        placeholder="Preset name…"
        class="bg-slate-700 border border-purple-500/60 rounded px-2 py-0.5 text-[11px]
               text-white placeholder:text-slate-500
               focus:outline-none focus:border-purple-400 w-32"
      />
      <button
        on:click={confirmSave}
        disabled={!savingName.trim()}
        class="px-2 py-0.5 rounded text-[11px] bg-purple-600 hover:bg-purple-500
               text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >Save</button>
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
