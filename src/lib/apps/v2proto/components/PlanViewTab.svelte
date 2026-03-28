<!-- src/lib/apps/v2proto/components/PlanViewTab.svelte -->
<!-- Plan view tab for the v2proto app.
     Shows a floor plan image with component markers read from the components table
     (not the legacy plan_elements table). Supports:
       • Floor / plan selection
       • Click-to-select → component detail in sidebar
       • Edit mode: click blank area → quick-add form; drag marker → reposition
       • Type visibility toggles
       • Unplaced components list (floor_id set, plan_id null) in sidebar -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { v2protoStore } from '../stores/v2protoStore.js';
  import ComponentMarker      from './ComponentMarker.svelte';
  import ComponentDetailPanel from './ComponentDetailPanel.svelte';
  import InspectionPanel      from './InspectionPanel.svelte';
  import QuickAddForm         from './QuickAddForm.svelte';

  const dispatch = createEventDispatcher();

  // ── Store bindings ────────────────────────────────────────────────
  $: store         = $v2protoStore;
  $: facilities    = store.facilities;
  $: floors        = store.floors;
  $: plans         = store.plans;
  $: components    = store.components;
  $: componentAttrs= store.componentAttrs;
  $: types         = store.types;
  $: systems       = store.systems;
  $: attrDefs      = store.attrDefs;
  $: attrOptions   = store.attrOptions;
  $: inspections   = store.inspections;

  // ── Local state ───────────────────────────────────────────────────
  let selectedFloorId    = '';
  let selectedPlanId     = '';
  let editMode           = false;

  // sidebar: 'none' | 'form' | 'detail' | 'inspect'
  let sidebarMode        = 'none';
  let selectedComponent  = null;
  let newPos             = null;   // { x, y } from plan click
  let saving             = false;
  let errorMsg           = '';

  // Drag state — positions override the store during drag, committed on mouseup
  let draggingId         = null;
  let dragPos            = {};     // { [id]: { x, y } }
  let containerEl        = null;   // the plan image wrapper div

  // Type visibility filter (codes in the set are hidden)
  let hiddenTypes = new Set();

  // ── Derived ───────────────────────────────────────────────────────
  $: plansForFloor = selectedFloorId
    ? plans.filter(p => p.floor_id === selectedFloorId)
    : [];

  $: selectedPlan  = plans.find(p => p.id === selectedPlanId) ?? null;
  $: selectedFloor = floors.find(f => f.id === selectedFloorId) ?? null;

  // All components pinned to the selected plan
  $: planComponents = selectedPlanId
    ? components.filter(c => c.plan_id === selectedPlanId)
    : [];

  // Components that belong to this floor but have no plan placement yet
  $: unplacedComponents = selectedFloorId
    ? components.filter(c => c.floor_id === selectedFloorId && !c.plan_id)
    : [];

  // Unique types represented on the plan (for filter legend)
  $: planTypeCodes = [...new Set(planComponents.map(c => c.type_code))];
  $: planTypeObjs  = planTypeCodes
    .map(code => types.find(t => t.code === code))
    .filter(Boolean);

  // Components visible after type filter applied
  $: visibleComponents = planComponents.filter(c => !hiddenTypes.has(c.type_code));

  // Inspection panel data for selected component
  $: selType         = selectedComponent
    ? (types.find(t => t.code === selectedComponent.type_code) ?? null) : null;
  $: selCheckable    = selType
    ? (attrDefs[selType.id] ?? []).filter(d => d.checkable && d.visible) : [];
  $: selLastInspection = selectedComponent
    ? (inspections[selectedComponent.id] ?? null) : null;

  // ── Auto-select: pick first floor that has plans on load ──────────
  let autoSelected = false;
  $: if (!autoSelected && floors.length > 0 && plans.length > 0) {
    const f = floors.find(fl => plans.some(p => p.floor_id === fl.id));
    if (f) {
      selectedFloorId = f.id;
      const p = plans.filter(pl => pl.floor_id === f.id)[0];
      if (p) selectedPlanId = p.id;
      autoSelected = true;
    }
  }

  // ── Event handlers ────────────────────────────────────────────────
  function onFloorChange() {
    selectedPlanId    = '';
    selectedComponent = null;
    sidebarMode       = 'none';
    newPos            = null;
    // Auto-select first plan for this floor
    const fp = plans.filter(p => p.floor_id === selectedFloorId);
    if (fp.length > 0) selectedPlanId = fp[0].id;
  }

  function onPlanChange() {
    selectedComponent = null;
    sidebarMode       = 'none';
    newPos            = null;
  }

  function toggleTypeFilter(code) {
    if (hiddenTypes.has(code)) hiddenTypes.delete(code);
    else hiddenTypes.add(code);
    hiddenTypes = hiddenTypes; // trigger reactivity
  }

  // Click on the plan background (only fires when NOT clicking a marker)
  function handlePlanClick(e) {
    if (!editMode) {
      // deselect when clicking blank area
      selectedComponent = null;
      sidebarMode       = 'none';
      return;
    }
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    newPos = {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top)   / rect.height))
    };
    selectedComponent = null;
    sidebarMode       = 'form';
  }

  function handleMarkerClick(e) {
    selectedComponent = e.detail.component;
    sidebarMode       = 'detail';
    newPos            = null;
  }

  // ── Drag to reposition ────────────────────────────────────────────
  function handleMarkerDragstart({ detail: { e, component } }) {
    if (!editMode) return;
    draggingId = component.id;
    dragPos = { [component.id]: { x: component.x_position, y: component.y_position } };
  }

  function handleMousemove(e) {
    if (!draggingId || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    dragPos = { [draggingId]: { x, y } };
  }

  async function handleMouseup() {
    if (!draggingId) return;
    const pos = dragPos[draggingId];
    if (pos) {
      try {
        await v2protoStore.moveComponent(draggingId, selectedPlanId, pos.x, pos.y);
      } catch (err) {
        errorMsg = err.message;
      }
    }
    draggingId = null;
    dragPos    = {};
  }

  // ── Quick-add from plan click ─────────────────────────────────────
  async function handleQuickAdd(e) {
    const { fields, attrValues } = e.detail;
    saving   = true;
    errorMsg = '';
    try {
      await v2protoStore.createComponent(
        {
          ...fields,
          floor_id:   selectedFloorId,
          plan_id:    selectedPlanId,
          x_position: newPos?.x ?? 0.5,
          y_position: newPos?.y ?? 0.5
        },
        attrValues
      );
      await v2protoStore.loadComponents();
      sidebarMode = 'none';
      newPos      = null;
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  // ── Detail panel events ───────────────────────────────────────────
  function handleDetailSaved() {
    if (selectedComponent) {
      selectedComponent = $v2protoStore.components
        .find(c => c.id === selectedComponent.id) ?? null;
    }
  }

  function handleDetailInspect(e) {
    selectedComponent = e.detail.component;
    sidebarMode       = 'inspect';
  }

  function handleDetailDeleted() {
    selectedComponent = null;
    sidebarMode       = 'none';
  }

  // ── Helpers ───────────────────────────────────────────────────────
  // Marker position: uses drag override if this marker is being dragged
  function markerPos(c) {
    const override = dragPos[c.id];
    return override
      ? { ...c, x_position: override.x, y_position: override.y }
      : c;
  }
</script>

<svelte:window on:mousemove={handleMousemove} on:mouseup={handleMouseup} />

<div class="flex flex-col gap-3">

  <!-- ── Toolbar ───────────────────────────────────────────────── -->
  <div class="flex items-center gap-3 flex-wrap">

    <!-- Floor picker -->
    <div class="flex items-center gap-2">
      <span class="text-sm text-slate-400">Floor:</span>
      <select bind:value={selectedFloorId} on:change={onFloorChange}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500 min-w-[9rem]">
        <option value="">Select floor…</option>
        {#each floors as f}
          <option value={f.id}>{f.name} ({f.short_name})</option>
        {/each}
      </select>
    </div>

    <!-- Plan picker (only shown when multiple plans on this floor) -->
    {#if plansForFloor.length > 1}
      <div class="flex items-center gap-2">
        <span class="text-sm text-slate-400">Plan:</span>
        <select bind:value={selectedPlanId} on:change={onPlanChange}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:border-purple-500">
          {#each plansForFloor as p}
            <option value={p.id}>{p.name ?? p.building}</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- Edit mode toggle -->
    <button
      on:click={() => { editMode = !editMode; if (!editMode) { draggingId = null; dragPos = {}; } }}
      class="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors border
             {editMode
               ? 'bg-amber-600 border-amber-500 text-white ring-1 ring-amber-400'
               : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}"
      title="Toggle edit mode — allows placing and repositioning components"
    >
      <span class="text-base leading-none">{editMode ? '✏️' : '✏️'}</span>
      {editMode ? 'Editing' : 'Edit Mode'}
    </button>

    <!-- Type filter legend (click to hide/show) -->
    {#if planTypeObjs.length > 0}
      <div class="flex items-center gap-1 border-l border-slate-700 pl-3">
        {#each planTypeObjs as t (t.id)}
          <button
            on:click={() => toggleTypeFilter(t.code)}
            title="{t.name} — click to {hiddenTypes.has(t.code) ? 'show' : 'hide'}"
            class="w-6 h-6 flex items-center justify-center text-white text-xs font-bold rounded
                   transition-opacity {hiddenTypes.has(t.code) ? 'opacity-20' : 'opacity-90'}
                   {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
            style:background-color="#{t.colour}"
          >{t.initial}</button>
        {/each}
        {#if hiddenTypes.size > 0}
          <button
            on:click={() => { hiddenTypes.clear(); hiddenTypes = hiddenTypes; }}
            class="text-xs text-slate-500 hover:text-slate-300 ml-1 transition-colors"
          >show all</button>
        {/if}
      </div>
    {/if}

    <!-- Stats -->
    <div class="ml-auto flex items-center gap-3 text-xs text-slate-500">
      {#if planComponents.length > 0}
        <span>{visibleComponents.length}
          {#if visibleComponents.length !== planComponents.length}
            / {planComponents.length}
          {/if}
          on plan
        </span>
      {/if}
      {#if unplacedComponents.length > 0}
        <span class="text-amber-400 font-medium">
          {unplacedComponents.length} unplaced
        </span>
      {/if}
    </div>
  </div>

  <!-- Edit mode hint bar -->
  {#if editMode}
    <div class="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20
                text-xs text-amber-300/80 flex items-center gap-2">
      <span>✏</span>
      <span>
        Click a blank area to place a new component at that position.
        Drag existing markers to reposition them.
      </span>
    </div>
  {/if}

  <!-- Error -->
  {#if errorMsg}
    <div class="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-sm text-red-400
                flex justify-between items-center">
      {errorMsg}
      <button on:click={() => errorMsg = ''} class="text-red-600 hover:text-red-400 ml-3">✕</button>
    </div>
  {/if}

  <!-- ── Main area (plan + sidebar) ────────────────────────────── -->
  <div class="flex gap-4 items-start">

    <!-- ── Plan image ───────────────────────────────────────────── -->
    <div class="flex-1 min-w-0">
      {#if !selectedFloorId}
        <div class="h-64 rounded-xl bg-slate-800 border border-slate-700
                    flex items-center justify-center text-slate-500 text-sm">
          Select a floor above to view its plan.
        </div>

      {:else if plansForFloor.length === 0}
        <div class="h-64 rounded-xl bg-slate-800 border border-slate-700
                    flex flex-col items-center justify-center gap-2 text-slate-500 text-sm">
          <p class="text-4xl">🗺</p>
          <p>No plans for <strong class="text-slate-400">{selectedFloor?.name}</strong>.</p>
          <p class="text-xs text-slate-600">Upload a floor plan in the Plans app to get started.</p>
        </div>

      {:else if !selectedPlan?.image_url}
        <div class="h-64 rounded-xl bg-slate-800 border border-slate-700
                    flex items-center justify-center text-slate-500 text-sm">
          No image for this plan. Upload one in the Plans app.
        </div>

      {:else}
        <!-- Image + marker overlay -->
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="relative rounded-xl overflow-hidden border
                 border-slate-700 bg-slate-900 shadow-lg
                 {editMode ? 'cursor-crosshair' : 'cursor-default'}"
          bind:this={containerEl}
          on:click={handlePlanClick}
        >
          <!-- Floor plan image -->
          <img
            src={selectedPlan.image_url}
            alt="{selectedPlan.name ?? selectedPlan.building} floor plan"
            class="w-full h-auto block select-none"
            draggable="false"
          />

          <!-- Component markers -->
          {#each visibleComponents as c (c.id)}
            <ComponentMarker
              component={markerPos(c)}
              type={types.find(t => t.code === c.type_code)}
              selected={selectedComponent?.id === c.id}
              {editMode}
              on:click={handleMarkerClick}
              on:dragstart={handleMarkerDragstart}
            />
          {/each}

          <!-- Pulsing dot at new-placement position while form is open -->
          {#if newPos && sidebarMode === 'form'}
            <div
              class="absolute w-4 h-4 rounded-full bg-purple-500 ring-2 ring-white/40
                     pointer-events-none animate-pulse"
              style="left:{newPos.x * 100}%; top:{newPos.y * 100}%;
                     transform:translate(-50%,-50%); z-index:25"
            ></div>
          {/if}

          <!-- Plan label (bottom-left overlay) -->
          <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60
                      text-xs text-white/70 pointer-events-none">
            {selectedFloor?.short_name} · {selectedPlan.name ?? selectedPlan.building}
          </div>
        </div>
      {/if}
    </div>

    <!-- ── Sidebar ───────────────────────────────────────────────── -->
    <div class="w-80 shrink-0 max-h-[80vh] overflow-y-auto">

      <!-- FORM: quick-add from plan click -->
      {#if sidebarMode === 'form'}
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <p class="font-semibold text-white text-sm">Place Component</p>
              {#if newPos}
                <p class="text-xs text-slate-500 font-mono mt-0.5">
                  {selectedFloor?.short_name} · {(newPos.x * 100).toFixed(1)}% ×
                  {(newPos.y * 100).toFixed(1)}%
                </p>
              {/if}
            </div>
            <button
              on:click={() => { sidebarMode = 'none'; newPos = null; }}
              class="text-slate-500 hover:text-white transition-colors"
            >✕</button>
          </div>
          <QuickAddForm
            {types}
            {systems}
            {attrDefs}
            {attrOptions}
            {saving}
            on:submit={handleQuickAdd}
            on:cancel={() => { sidebarMode = 'none'; newPos = null; }}
          />
        </div>

      <!-- INSPECT: inspection panel -->
      {:else if sidebarMode === 'inspect' && selectedComponent}
        <InspectionPanel
          component={selectedComponent}
          typeConfig={selType}
          checkableAttrs={selCheckable}
          lastInspection={selLastInspection}
          on:saved={() => { sidebarMode = 'detail'; }}
          on:close={() => sidebarMode = 'detail'}
        />

      <!-- DETAIL: component detail / edit panel -->
      {:else if sidebarMode === 'detail' && selectedComponent}
        <ComponentDetailPanel
          component={selectedComponent}
          {types}
          {systems}
          {floors}
          {facilities}
          {plans}
          {attrDefs}
          {attrOptions}
          components={$v2protoStore.components}
          attrs={componentAttrs[selectedComponent.id] ?? []}
          inspection={inspections[selectedComponent.id] ?? null}
          on:saved={handleDetailSaved}
          on:close={() => { selectedComponent = null; sidebarMode = 'none'; }}
          on:inspect={handleDetailInspect}
          on:deleted={handleDetailDeleted}
        />

      <!-- DEFAULT: unplaced components list -->
      {:else}
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Unplaced on this floor
          </p>

          {#if !selectedFloorId}
            <p class="text-xs text-slate-600 italic">Select a floor first.</p>

          {:else if unplacedComponents.length === 0}
            <p class="text-xs text-slate-600 italic">
              All components on {selectedFloor?.name ?? 'this floor'} are placed on a plan. ✓
            </p>

          {:else}
            <p class="text-xs text-slate-500 mb-3">
              These components have a floor but no plan position.
              {#if editMode}
                Click a component to open its detail and set the plan manually.
              {:else}
                Enable <strong>Edit Mode</strong> and click the plan to place new ones.
              {/if}
            </p>
            <div class="flex flex-col gap-2">
              {#each unplacedComponents as c (c.id)}
                {@const t = types.find(tt => tt.code === c.type_code)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div
                  class="flex items-center gap-2 p-2 rounded-lg bg-slate-700/50 border
                         border-slate-600 hover:border-slate-500 cursor-pointer transition-colors"
                  on:click={() => { selectedComponent = c; sidebarMode = 'detail'; }}
                  title="Click to view / edit"
                >
                  {#if t}
                    <div
                      class="w-6 h-6 flex items-center justify-center text-white text-xs
                             font-bold shrink-0
                             {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
                      style:background-color="#{t.colour}"
                    >{t.initial}</div>
                  {:else}
                    <div class="w-6 h-6 rounded bg-slate-600 shrink-0"></div>
                  {/if}
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-white truncate">
                      {c.label || c.asset_id || t?.name || c.type_code}
                    </p>
                    <p class="text-xs text-slate-500 truncate">{t?.name ?? c.type_code}</p>
                  </div>
                  <span class="text-slate-600 text-xs shrink-0">→</span>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Divider + on-plan summary -->
          {#if planComponents.length > 0}
            <div class="mt-4 pt-3 border-t border-slate-700">
              <p class="text-xs text-slate-500">
                <span class="text-white font-medium">{planComponents.length}</span>
                component{planComponents.length !== 1 ? 's' : ''} on this plan.
                Click any marker to inspect or edit.
              </p>
            </div>
          {/if}
        </div>
      {/if}

    </div><!-- sidebar -->
  </div><!-- main area -->
</div>
