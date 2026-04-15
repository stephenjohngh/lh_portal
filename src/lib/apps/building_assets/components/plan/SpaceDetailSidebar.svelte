<!-- plan/SpaceDetailSidebar.svelte -->
<!-- Full detail and edit panel for a selected space.
     Fields: name, space_type, colour, height_m, notes.
     Measurements (perimeter, area, volume) shown when plan is scaled.
     Save / Cancel / Delete footer. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore }          from '../../stores/buildingAssetsStore.js';
  import { inp } from '../../ui.js';
  import { SPACE_TYPES, SPACE_COLOURS, measurePerimeter, measureArea, measureVolume, fmt1 }
    from './planMeasure.js';

  export let space;
  export let floors               = [];
  export let metresPerUnit        = null;   // null if no scale set
  export let planAR               = null;   // image aspect ratio
  export let vertexEditingActive  = false;  // true while editing polygon corners
  export let readOnly             = false;  // hide mutating actions (View mode)

  const dispatch = createEventDispatcher();

  // ── Editable fields ───────────────────────────────────────────────
  let editName      = '';
  let editType      = '';
  let editColourHex = '';
  let editHeightM   = '';   // string for input; converted to float on save
  let editNotes     = '';
  let editShowLabel = true;

  let saving     = false;
  let errorMsg   = '';
  let confirming = false;

  // Track the space.id we last initialised from so we only reset the
  // form when a *different* space is selected, not on every store update.
  let loadedId = null;

  $: if (space?.id !== loadedId) {
    loadedId      = space?.id ?? null;
    editName      = space?.name        ?? '';
    editType      = space?.space_type  ?? '';
    editColourHex = space
      ? (space.colour === 'none' ? 'none' : `#${space.colour}`)
      : '#a855f7';
    editHeightM   = space?.height_m != null ? String(space.height_m) : '';
    editNotes     = space?.notes      ?? '';
    editShowLabel = space?.show_label ?? true;
    saving        = false;
    errorMsg      = '';
    confirming    = false;
  }

  // parsedHeight must be declared BEFORE dirty so Svelte's reactive graph
  // evaluates it first — otherwise dirty checks stale parsedHeight on first edit.
  // editHeightM may be a number (Svelte coerces type="number" inputs) or '' when empty,
  // so we must not call .trim() on it — use != null / !== '' checks instead.
  $: parsedHeight = (editHeightM !== '' && editHeightM != null) ? parseFloat(editHeightM) : null;

  // Compare edits against the current space prop values.
  // Uses parsedHeight (float|null) vs space.height_m (float|null) so that
  // "2.8" in the input correctly matches a stored 2.8.
  // Colour comparison handles 'none' (transparent) correctly.
  $: dirty = !!space && (
    editName      !== (space.name       ?? '')  ||
    editType      !== (space.space_type  ?? '')  ||
    editColourHex !== (space.colour === 'none' ? 'none' : `#${space.colour}`) ||
    editNotes     !== (space.notes       ?? '')  ||
    editShowLabel !== (space.show_label  ?? true) ||
    parsedHeight  !== (space.height_m    ?? null)
  );

  // ── Measurements ─────────────────────────────────────────────────
  $: poly   = space?.polygon ?? [];
  $: perim  = poly.length >= 3 ? measurePerimeter(poly, planAR, metresPerUnit) : null;
  $: area   = poly.length >= 3 ? measureArea(poly, planAR, metresPerUnit)      : null;
  $: vol    = poly.length >= 3
    ? measureVolume(poly, planAR, metresPerUnit, space?.height_m ?? null) : null;

  // Show live volume preview using editHeightM while editing
  $: previewVol = area != null && parsedHeight > 0 ? area * parsedHeight : null;

  $: floor = floors.find(f => f.id === space?.floor_id) ?? null;


  async function handleSave() {
    if (!editName.trim()) { errorMsg = 'Name is required.'; return; }
    saving = true; errorMsg = '';
    try {
      const updated = await buildingAssetsStore.updateSpace(space.id, {
        name:       editName,
        space_type: editType,
        colour:     editColourHex === 'none' ? 'none' : editColourHex.replace('#', ''),
        height_m:   parsedHeight,
        notes:      editNotes,
        show_label: editShowLabel,
      });
      // Dispatch the updated object so PlanViewTab can refresh selectedSpace.
      // Without this, the space prop stays as the pre-save object and dirty
      // immediately flips back to true (parsedHeight vs old space.height_m).
      dispatch('saved', { space: updated });
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirming) { confirming = true; return; }
    try {
      await buildingAssetsStore.deleteSpace(space.id);
      dispatch('deleted');
    } catch (err) {
      errorMsg = err.message;
      confirming = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 flex flex-col">

  <!-- ── Sticky header ─────────────────────────────────────────────── -->
  <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-700">
    <div class="flex items-center gap-2 min-w-0">
      <div
        class="w-4 h-4 rounded-sm shrink-0 {editColourHex === 'none' ? 'border border-slate-500' : ''}"
        style={editColourHex !== 'none' ? `background-color:${editColourHex}` : ''}
      ></div>
      <p class="font-semibold text-white text-sm truncate">{space.name}</p>
      {#if dirty}
        <span class="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 shrink-0">
          unsaved
        </span>
      {/if}
    </div>
    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors ml-2 shrink-0"
      title="Close"
    >✕</button>
  </div>

  <!-- ── Scrollable body ───────────────────────────────────────────── -->
  <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

    <!-- Error -->
    {#if errorMsg}
      <p class="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1.5">
        {errorMsg}
      </p>
    {/if}

    <!-- ── Measurements (read-only, scale-dependent) ─────────────── -->
    {#if metresPerUnit && poly.length >= 3}
      <div class="p-2.5 rounded-lg bg-teal-900/30 border border-teal-700/40">
        <p class="text-xs text-teal-500/70 uppercase tracking-wide mb-2">Measurements</p>
        <div class="grid grid-cols-3 gap-x-3 gap-y-1">
          <div>
            <p class="text-xs text-teal-500/70">Perimeter</p>
            <p class="text-sm font-semibold text-teal-300">{fmt1(perim)} m</p>
          </div>
          <div>
            <p class="text-xs text-teal-500/70">Area</p>
            <p class="text-sm font-semibold text-teal-300">{fmt1(area)} m²</p>
          </div>
          <div>
            <p class="text-xs text-teal-500/70">Volume</p>
            {#if previewVol != null}
              <p class="text-sm font-semibold text-teal-300">{fmt1(previewVol)} m³</p>
            {:else}
              <p class="text-sm text-teal-700">— m³</p>
            {/if}
          </div>
        </div>
        {#if previewVol == null && !editHeightM}
          <p class="text-xs text-teal-700/80 mt-1.5">Set height below to enable volume.</p>
        {/if}
      </div>
    {:else if !metresPerUnit}
      <div class="px-2.5 py-2 rounded-lg bg-slate-700/40 border border-slate-600/40">
        <p class="text-xs text-slate-600 italic">
          No scale set — switch to <span class="text-teal-600 font-medium">📏 Scale</span> mode
          to enable measurements.
        </p>
      </div>
    {/if}

      {#if readOnly}

      <!-- ── Read-only fields ───────────────────────────────────────── -->
      <dl class="space-y-2">
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Name</dt>
          <dd class="text-sm text-slate-200">{space.name || '—'}</dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Type</dt>
          <dd class="text-sm text-slate-200">{#if space.space_type}{space.space_type}{:else}<span class="text-slate-600">—</span>{/if}</dd>
        </div>
        <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Colour</dt>
          <dd class="flex items-center gap-2">
            {#if space.colour && space.colour !== 'none'}
              <span class="w-4 h-4 rounded-full inline-block shrink-0"
                    style="background-color:#{space.colour}"></span>
            {:else}
              <span class="text-slate-600 text-sm">None</span>
            {/if}
          </dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Height</dt>
          <dd class="text-sm text-slate-200">
            {#if space.height_m != null}{space.height_m} m{:else}<span class="text-slate-600">—</span>{/if}
          </dd>
        </div>
        {#if space.notes}
          <div class="px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
            <dt class="text-xs text-slate-500 mb-1">Notes</dt>
            <dd class="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{space.notes}</dd>
          </div>
        {/if}
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Show label</dt>
          <dd class="text-sm {space.show_label ? 'text-green-400' : 'text-slate-500'}">
            {space.show_label ? '✓ Yes' : '✗ No'}
          </dd>
        </div>
      </dl>

    {:else}

      <!-- ── Name ──────────────────────────────────────────────────── -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-name">
          Name <span class="text-red-400">*</span>
        </label>
        <input
          id="sp-name"
          type="text"
          bind:value={editName}
          class={inp}
        />
      </div>

      <!-- ── Space type ────────────────────────────────────────────── -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-type">Type</label>
        <select id="sp-type" bind:value={editType} class={inp}>
          <option value="">— none —</option>
          {#each SPACE_TYPES as st}
            <option value={st}>{st}</option>
          {/each}
        </select>
      </div>

      <!-- ── Colour ────────────────────────────────────────────────── -->
      <div>
        <p class="text-xs text-slate-400 mb-1.5">Colour</p>
        <div class="flex gap-1.5 flex-wrap">
          {#each SPACE_COLOURS as sc (sc.hex)}
            {@const isNone = sc.hex === 'none'}
            <button
              on:click={() => editColourHex = sc.hex}
              title={sc.label}
              class="w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center
                     {editColourHex === sc.hex
                       ? 'border-white scale-110'
                       : 'border-transparent hover:border-slate-400'}
                     {isNone ? 'bg-slate-700' : ''}"
              style={!isNone ? `background-color:${sc.hex}` : ''}
            >{#if isNone}<span class="text-slate-500 text-[9px] leading-none">∅</span>{/if}</button>
          {/each}
        </div>
      </div>

      <!-- ── Height ────────────────────────────────────────────────── -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-height">
          Ceiling height (m)
          <span class="text-slate-600 font-normal ml-1">— enables volume calculation</span>
        </label>
        <input
          id="sp-height"
          type="number"
          min="0.1"
          step="0.1"
          bind:value={editHeightM}
          placeholder="e.g. 2.8"
          class={inp}
        />
      </div>

      <!-- ── Notes ─────────────────────────────────────────────────── -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-notes">Notes</label>
        <textarea
          id="sp-notes"
          rows="2"
          bind:value={editNotes}
          placeholder="Optional notes…"
          class="{inp} resize-none"
        ></textarea>
      </div>

      <!-- ── Show label ─────────────────────────────────────────────── -->
      <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
        <input type="checkbox" bind:checked={editShowLabel} class="rounded accent-purple-500" />
        Show name label on plan
      </label>

    {/if}

    <!-- ── Metadata ───────────────────────────────────────────────── -->
    <div class="flex flex-col gap-0.5 pt-1 border-t border-slate-700/60">
      <div class="flex items-center justify-between">
        <p class="text-xs text-slate-600">{poly.length} polygon vertices</p>
        {#if !readOnly}
          <button
            on:click={() => dispatch(vertexEditingActive ? 'doneeditshape' : 'editshape')}
            class="text-xs px-2 py-0.5 rounded transition-colors
                   {vertexEditingActive
                     ? 'bg-purple-600 text-white hover:bg-purple-500'
                     : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}"
          >{vertexEditingActive ? 'Done editing' : 'Edit shape ✦'}</button>
        {/if}
      </div>
      {#if floor}
        <p class="text-xs text-slate-600">Floor: {floor.name}</p>
      {/if}
      <p class="text-xs text-slate-700 font-mono">id: {space.id.slice(0, 8)}…</p>
    </div>

  </div><!-- /.body -->

  <!-- ── Sticky footer ─────────────────────────────────────────────── -->
  <div class="px-4 py-3 border-t border-slate-700 flex gap-2">

    {#if readOnly}
      <button
        on:click={() => dispatch('close')}
        class="flex-1 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600
               text-slate-300 transition-colors"
      >Close</button>

    {:else if confirming}
      <button
        on:click={() => confirming = false}
        class="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600
               text-slate-300 transition-colors"
      >Keep</button>
      <button
        on:click={handleDelete}
        class="flex-1 py-1.5 text-xs rounded-lg bg-red-700 hover:bg-red-600
               text-white font-medium transition-colors"
      >Confirm delete</button>

    {:else}
      <button
        on:click={handleDelete}
        class="px-3 py-1.5 text-xs rounded-lg bg-red-900/40 hover:bg-red-800/50
               text-red-400 border border-red-800/40 transition-colors"
      >Delete</button>
      <button
        on:click={() => { dispatch('close'); }}
        disabled={saving}
        class="flex-1 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600
               text-slate-300 disabled:opacity-40 transition-colors"
      >Cancel</button>
      <button
        on:click={handleSave}
        disabled={!dirty || saving || !editName.trim()}
        class="flex-1 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
               disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium
               transition-colors"
      >{saving ? 'Saving…' : 'Save'}</button>
    {/if}

  </div>

</div>
