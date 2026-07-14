<!-- plan/SpaceDetailSidebar.svelte -->
<!-- Full detail and edit panel for a selected space.
     Fields: name, type, colour, height_m, notes.
     Measurements (perimeter, area, volume) shown when plan is scaled.
     Save / Cancel / Delete footer. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore }          from '../../stores/buildingAssetsStore.js';
  import { inp } from '../../ui.js';
  import { SPACE_TYPES, SPACE_COLOURS, measurePerimeter, measureArea, measureVolume, measureSides, fmt1 }
    from './planMeasure.js';
  import { ACCENT } from '$lib/theme.js';
  import { buildSpaceRef, KIND_LABEL, deriveSpaceName } from '$lib/utils/spaceRef.js';
  import { buildComponentRef } from '$lib/utils/componentRef.js';
  import { componentsInSpace } from '../../utils/spaceMembership.js';
  import { spaceRollup } from '../../utils/spaceReport.js';
  import { statusDotCls, statusCfg } from '$lib/utils/resultConstants.js';
  import { permissions } from '$lib/stores/permissions';

  export let space;
  export let floors               = [];
  export let metresPerUnit        = null;   // null if no scale set
  export let planAR               = null;   // image aspect ratio
  export let vertexEditingActive  = false;  // true while editing polygon corners
  export let readOnly             = false;  // hide mutating actions (View mode)
  export let allowShapeEdit       = true;   // false when there's no plan canvas (e.g. Spaces tab)

  const dispatch = createEventDispatcher();

  // -- Editable fields -----------------------------------------------
  let editLabel     = '';   // multi-line plan-view display label
  let editName      = '';   // single-line report name
  let editType      = '';
  let editColourHex = '';
  let editHeightM   = '';   // string for input; converted to float on save
  let editNotes     = '';
  let editShowLabel = true;
  let editKind       = 'space';   // 'space' | 'slot' (§4.1)
  let editAssignedId = '';        // stored segment of the composed reference

  let saving     = false;
  let errorMsg   = '';
  let confirming = false;

  // Track the space.id we last initialised from so we only reset the
  // form when a *different* space is selected, not on every store update.
  let loadedId = null;

  $: if (space?.id !== loadedId) {
    loadedId      = space?.id ?? null;
    editLabel     = space?.label ?? space?.name ?? '';   // fall back for pre-split rows
    editName      = space?.name        ?? '';
    editType      = space?.type        ?? '';
    editColourHex = space
      ? (space.colour === 'none' ? 'none' : `#${space.colour}`)
      : ACCENT;
    editHeightM   = space?.height_m != null ? String(space.height_m) : '';
    editNotes     = space?.notes      ?? '';
    editShowLabel = space?.show_label ?? true;
    editKind       = space?.kind        ?? 'space';
    editAssignedId = space?.assigned_id ?? '';
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
  $: derivedName = deriveSpaceName(editLabel);

  // Configured type list (admin-managed); fall back to the hardcoded set when
  // the table is empty/absent. Keep the current value selectable even if it was
  // since removed from the list.
  $: typeList    = $buildingAssetsStore.spaceTypes?.length
    ? $buildingAssetsStore.spaceTypes.map(u => u.value)
    : SPACE_TYPES;
  $: typeOptions = editType && !typeList.includes(editType) ? [editType, ...typeList] : typeList;

  $: dirty = !!space && (
    editLabel     !== (space.label ?? space.name ?? '')  ||
    editName      !== (space.name       ?? '')  ||
    editType      !== (space.type        ?? '')  ||
    editColourHex !== (space.colour === 'none' ? 'none' : `#${space.colour}`) ||
    editNotes     !== (space.notes       ?? '')  ||
    editShowLabel !== (space.show_label  ?? true) ||
    parsedHeight  !== (space.height_m    ?? null) ||
    editKind       !== (space.kind        ?? 'space') ||
    editAssignedId !== (space.assigned_id ?? '')
  );

  // -- Measurements -------------------------------------------------
  $: poly     = space?.polygon ?? [];
  $: perim    = poly.length >= 3 ? measurePerimeter(poly, planAR, metresPerUnit) : null;
  $: area     = poly.length >= 3 ? measureArea(poly, planAR, metresPerUnit)      : null;
  $: vol      = poly.length >= 3
    ? measureVolume(poly, planAR, metresPerUnit, space?.height_m ?? null) : null;
  $: sides    = poly.length >= 3 ? measureSides(poly, planAR, metresPerUnit) : [];
  $: shortest = sides.length ? sides[0]                  : null;
  $: longest  = sides.length ? sides[sides.length - 1]  : null;

  // Show live volume preview using editHeightM while editing
  $: previewVol = area != null && parsedHeight > 0 ? area * parsedHeight : null;

  $: floor = floors.find(f => f.id === space?.floor_id) ?? null;

  // -- Reference + derived membership --------------------------------
  // Live reference preview reflects the in-progress kind / assigned_id edits.
  $: refPreview = space
    ? buildSpaceRef({ ...space, kind: editKind, assigned_id: editAssignedId.trim() || null }, floors)
    : '—';
  // Components whose marker falls within this space (derive-at-read, §4.3),
  // with manual include/exclude overrides applied.
  $: members = space
    ? componentsInSpace(space, $buildingAssetsStore.components, $buildingAssetsStore.spaceOverrides ?? [], { AR: planAR ?? 1 })
    : [];

  // -- Membership overrides (admin) ----------------------------------
  $: canManage = !readOnly && $permissions.isAdmin;
  $: overridesForSpace = space
    ? ($buildingAssetsStore.spaceOverrides ?? []).filter(o => o.space_id === space.id)
    : [];
  function overrideModeFor(cid) {
    return overridesForSpace.find(o => o.component_id === cid)?.mode ?? null;
  }
  $: excludedIds        = overridesForSpace.filter(o => o.mode === 'exclude').map(o => o.component_id);
  $: excludedComponents = $buildingAssetsStore.components.filter(c => excludedIds.includes(c.id));
  $: memberIds          = new Set(members.map(m => m.id));
  // Components eligible to pin: on this plan (or unplaced), not already a member.
  $: pinCandidates = space
    ? $buildingAssetsStore.components
        .filter(c => (c.plan_id === space.plan_id || c.plan_id == null)
                  && !memberIds.has(c.id) && !excludedIds.includes(c.id))
        .slice(0, 200)
    : [];

  async function setOverride(cid, mode) {
    const sid = space.id;                       // capture before await (Svelte 5)
    try { await buildingAssetsStore.setMemberOverride(sid, cid, mode); }
    catch (err) { errorMsg = err.message; }
  }
  async function clearOverride(cid) {
    const sid = space.id;
    try { await buildingAssetsStore.removeMemberOverride(sid, cid); }
    catch (err) { errorMsg = err.message; }
  }
  function onPinSelect(e) {
    const cid = e.currentTarget.value;
    if (cid) { setOverride(cid, 'include'); e.currentTarget.value = ''; }
  }

  // -- Type name lookup (components store type_code, not the type name) --
  $: typesByCode = new Map(($buildingAssetsStore.types ?? []).map(t => [t.code, t]));
  const typeName = c => typesByCode.get(c.type_code)?.name ?? c.type_code ?? '';

  // Status roll-up chips (at-a-glance context; full reports live in the
  // Components tab and the Spaces register tab, not here).
  $: rollup = spaceRollup(members);

  async function handleSave() {
    if (!editLabel.trim()) { errorMsg = 'Label is required.'; return; }
    saving = true; errorMsg = '';
    try {
      const updated = await buildingAssetsStore.updateSpace(space.id, {
        label:       editLabel,
        name:        editName,   // store derives from label when blank
        type:        editType,
        colour:      editColourHex === 'none' ? 'none' : editColourHex.replace('#', ''),
        height_m:    parsedHeight,
        notes:       editNotes,
        show_label:  editShowLabel,
        kind:        editKind,
        assigned_id: editAssignedId,
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

  <!-- -- Sticky header ----------------------------------------------- -->
  <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-700">
    <div class="flex items-center gap-2 min-w-0">
      <div
        class="w-4 h-4 rounded-sm shrink-0 {editColourHex === 'none' ? 'border border-slate-500' : ''}"
        style={editColourHex !== 'none' ? `background-color:${editColourHex}` : ''}
      ></div>
      <p class="font-semibold text-white text-sm truncate">{space.name || space.label}</p>
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

  <!-- -- Scrollable body --------------------------------------------- -->
  <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

    <!-- Error -->
    {#if errorMsg}
      <p class="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1.5">
        {errorMsg}
      </p>
    {/if}

    <!-- ===== Identity (component-style: Reference · ID · Kind · Name · Type · Label) ===== -->
    {#if readOnly}
      <dl class="space-y-2">
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Reference</dt>
          <dd class="text-sm font-mono text-slate-200">{refPreview}</dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">ID</dt>
          <dd class="text-sm text-slate-200">{space.assigned_id || '—'}</dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Kind</dt>
          <dd class="text-sm text-slate-200">{KIND_LABEL[space.kind] ?? KIND_LABEL.space}</dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Name</dt>
          <dd class="text-sm text-slate-200">{space.name || '—'}</dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Type</dt>
          <dd class="text-sm text-slate-200">{#if space.type}{space.type}{:else}<span class="text-slate-600">—</span>{/if}</dd>
        </div>
        <div class="flex items-baseline gap-2 px-3 py-2 rounded-lg bg-slate-700/40 border border-slate-700/60">
          <dt class="text-xs text-slate-500 shrink-0 w-24">Label</dt>
          <dd class="text-sm text-slate-200 whitespace-pre-wrap">{space.label ?? space.name ?? '—'}</dd>
        </div>
      </dl>
    {:else}
      <!-- Reference (computed from Type + ID + floor) -->
      <div class="flex items-baseline gap-2">
        <p class="text-xs text-slate-400 w-24 shrink-0">Reference</p>
        <p class="text-sm font-mono text-slate-300">{refPreview}</p>
      </div>

      <!-- ID (assigned) + Kind (space/slot) -->
      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400" for="sp-assigned">ID</label>
          <input id="sp-assigned" type="text" bind:value={editAssignedId} placeholder="e.g. 12" class={inp} />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400" for="sp-kind">Kind</label>
          <select id="sp-kind" bind:value={editKind} class={inp}>
            <option value="space">{KIND_LABEL.space}</option>
            <option value="slot">{KIND_LABEL.slot}</option>
          </select>
        </div>
      </div>

      <!-- Name (single-line — used in reports) -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-name">
          Name <span class="text-slate-600 font-normal ml-1">— single line, for reports</span>
        </label>
        <input id="sp-name" type="text" bind:value={editName} class={inp} placeholder={derivedName || 'PlantRoom2'} />
        {#if !editName.trim() && derivedName}
          <p class="text-[11px] text-slate-600">Defaults to <span class="font-mono text-slate-500">{derivedName}</span></p>
        {/if}
      </div>

      <!-- Type (category) -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-type">Type</label>
        <select id="sp-type" bind:value={editType} class={inp}>
          <option value="">— none —</option>
          {#each typeOptions as st}
            <option value={st}>{st}</option>
          {/each}
        </select>
      </div>

      <!-- Label (multi-line — shown on the plan) -->
      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400" for="sp-label">
          Label <span class="text-red-400">*</span>
          <span class="text-slate-600 font-normal ml-1">— shown on the plan; Enter for line breaks</span>
        </label>
        <textarea id="sp-label" rows="2" bind:value={editLabel} class="{inp} resize-none" placeholder="Plant&#10;Room 2"></textarea>
      </div>
    {/if}

    <!-- -- Components in this space (derived membership + overrides) - -->
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs text-slate-400">
          Components in this space
          <span class="text-slate-600 font-normal">({members.length})</span>
        </p>
      </div>
      {#if rollup.total > 0}
        <div class="flex flex-wrap gap-1 text-[10px]">
          {#if rollup.byStatus.ok}<span class="px-1.5 py-0.5 rounded bg-green-900/40 text-green-400">{rollup.byStatus.ok} OK</span>{/if}
          {#if rollup.byStatus.problem}<span class="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">{rollup.byStatus.problem} Problem</span>{/if}
          {#if rollup.byStatus.failed}<span class="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">{rollup.byStatus.failed} Failed</span>{/if}
          {#if rollup.byStatus.inactive}<span class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{rollup.byStatus.inactive} Inactive</span>{/if}
        </div>
      {/if}
      {#if members.length > 0}
        <div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {#each members as c (c.id)}
            <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-700/40 border border-slate-700/60">
              <span class="w-2 h-2 rounded-full shrink-0 {statusDotCls(c.status)}" title={statusCfg(c.status).label}></span>
              <span class="text-xs font-mono text-slate-300 shrink-0">{buildComponentRef(c, floors, $buildingAssetsStore.types)}</span>
              <span class="text-xs text-slate-400 truncate flex-1 min-w-0">{typeName(c)}</span>
              <span class="text-xs text-slate-500 truncate flex-1 min-w-0">{c.label ?? ''}</span>
              {#if overrideModeFor(c.id) === 'include'}
                <span class="text-[10px] px-1 py-0.5 rounded bg-purple-600/30 text-purple-300 shrink-0" title="Manually pinned">pinned</span>
              {/if}
              {#if canManage}
                {#if overrideModeFor(c.id) === 'include'}
                  <button on:click={() => clearOverride(c.id)} title="Unpin from this space"
                    class="text-slate-500 hover:text-white shrink-0 text-xs">unpin</button>
                {:else}
                  <button on:click={() => setOverride(c.id, 'exclude')} title="Exclude from this space"
                    class="text-slate-500 hover:text-red-400 shrink-0 text-xs">✕</button>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-slate-600 italic">No components fall within this space's outline.</p>
      {/if}

      <!-- Excluded (admin) -->
      {#if canManage && excludedComponents.length > 0}
        <div class="mt-1 flex flex-col gap-1">
          <p class="text-[11px] text-slate-500">Excluded ({excludedComponents.length})</p>
          {#each excludedComponents as c (c.id)}
            <div class="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/40">
              <span class="text-xs font-mono text-slate-500 line-through truncate flex-1">{buildComponentRef(c, floors, $buildingAssetsStore.types)}</span>
              <button on:click={() => clearOverride(c.id)} title="Restore to this space"
                class="text-slate-500 hover:text-green-400 shrink-0 text-xs">restore</button>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Pin a component (admin) -->
      {#if canManage}
        <div class="flex flex-col gap-1 mt-1">
          <label class="text-[11px] text-slate-500" for="sp-pin">Pin a component (unplaced, cross-floor, or a near-miss)</label>
          <select id="sp-pin" class={inp} on:change={onPinSelect}>
            <option value="">＋ add a component…</option>
            {#each pinCandidates as c (c.id)}
              <option value={c.id}>{buildComponentRef(c, floors, $buildingAssetsStore.types)}{c.label ? ' — ' + c.label : ''}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <!-- ===== Measurements + appearance ===== -->
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
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 pt-2 border-t border-teal-800/40">
          <div>
            <p class="text-xs text-teal-500/70">Longest side</p>
            <p class="text-sm font-semibold text-teal-300">{fmt1(longest)} m</p>
          </div>
          <div>
            <p class="text-xs text-teal-500/70">Shortest side</p>
            <p class="text-sm font-semibold text-teal-300">{fmt1(shortest)} m</p>
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

      <dl class="space-y-2">
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

      <!-- -- Colour -------------------------------------------------- -->
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

      <!-- -- Height -------------------------------------------------- -->
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

      <!-- -- Notes --------------------------------------------------- -->
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

      <!-- -- Show label ----------------------------------------------- -->
      <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
        <input type="checkbox" bind:checked={editShowLabel} class="rounded accent-purple-500" />
        Show label on plan
      </label>

    {/if}

    <!-- -- Metadata ------------------------------------------------- -->
    <div class="flex flex-col gap-0.5 pt-1 border-t border-slate-700/60">
      <div class="flex items-center justify-between">
        <p class="text-xs text-slate-600">{poly.length} polygon vertices</p>
        {#if !readOnly && allowShapeEdit}
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

  <!-- -- Sticky footer ----------------------------------------------- -->
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
