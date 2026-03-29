<!-- src/lib/apps/v2proto/components/ComponentsTab.svelte -->
<!-- Components tab: list, create, detail-edit, and inspect components.
     Reads all data from v2protoStore directly (no props needed). -->
<script>
  import { v2protoStore } from '../stores/v2protoStore.js';

  import ComponentForm        from './ComponentForm.svelte';
  import ComponentCard        from './ComponentCard.svelte';
  import ComponentDetailPanel from './ComponentDetailPanel.svelte';
  import InspectionPanel      from './InspectionPanel.svelte';

  // ── Store bindings ────────────────────────────────────────────────
  $: store          = $v2protoStore;
  $: facilities     = store.facilities;
  $: floors         = store.floors;
  $: systems        = store.systems;
  $: types          = store.types;
  $: attrDefs       = store.attrDefs;
  $: attrOptions    = store.attrOptions;
  $: plans          = store.plans;
  $: components     = store.components;
  $: componentAttrs = store.componentAttrs;
  $: inspections    = store.inspections;

  // ── Local state ───────────────────────────────────────────────────
  let showForm            = false;
  let saving              = false;
  let filterFloorId       = '';
  let errorMsg            = '';
  let editingComponent    = null;
  let inspectingComponent = null;

  // ── Derived: inspection helpers ───────────────────────────────────
  $: inspectingType = inspectingComponent
    ? (types.find(t => t.code === inspectingComponent.type_code) ?? null)
    : null;
  $: inspectingCheckable = inspectingType
    ? (attrDefs[inspectingType.id] ?? []).filter(d => d.checkable && d.visible)
    : [];
  $: inspectingLastInspection = inspectingComponent
    ? (inspections[inspectingComponent.id] ?? null)
    : null;

  // ── Filtered + sorted list ────────────────────────────────────────
  $: filteredComponents = (() => {
    const base = filterFloorId
      ? components.filter(c => c.floor_id === filterFloorId)
      : components;
    return [...base].sort((a, b) => {
      const floorA = floors.find(f => f.id === a.floor_id);
      const floorB = floors.find(f => f.id === b.floor_id);
      const floorOrdA = floorA?.level_order ?? 9999;
      const floorOrdB = floorB?.level_order ?? 9999;
      if (floorOrdA !== floorOrdB) return floorOrdA - floorOrdB;
      const typeA = types.find(t => t.code === a.type_code);
      const typeB = types.find(t => t.code === b.type_code);
      return (typeA?.presentation_order ?? 9999) - (typeB?.presentation_order ?? 9999);
    });
  })();

  // ── Event handlers ────────────────────────────────────────────────
  async function handleSubmit(e) {
    const { fields, attrValues } = e.detail;
    saving = true;
    errorMsg = '';
    try {
      await v2protoStore.createComponent(fields, attrValues);
      showForm = false;
      await v2protoStore.loadComponents();
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete(e) {
    const { id } = e.detail;
    try {
      await v2protoStore.deleteComponent(id);
    } catch (err) {
      errorMsg = err.message;
    }
  }

  function handleEdit(e) {
    editingComponent    = e.detail.component;
    inspectingComponent = null;
    showForm            = false;
    errorMsg            = '';
  }

  function handleDetailSaved() {
    editingComponent = $v2protoStore.components.find(c => c.id === editingComponent?.id) ?? null;
    errorMsg = '';
  }

  function handleDetailClosed() {
    editingComponent = null;
  }

  function handleDetailInspect(e) {
    inspectingComponent = e.detail.component;
    editingComponent    = null;
    errorMsg            = '';
  }

  function handleDetailDeleted() {
    editingComponent = null;
  }

  function handleInspect(e) {
    inspectingComponent = e.detail.component;
    editingComponent    = null;
    errorMsg            = '';
  }

  async function handleInspectionSaved() {
    inspectingComponent = null;
  }
</script>

<!-- Error banner (component-level) -->
{#if errorMsg}
  <div class="mb-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-sm">
    {errorMsg}
    <button class="ml-2 underline" on:click={() => errorMsg = ''}>dismiss</button>
  </div>
{/if}

{#if inspectingComponent}
  <!-- Inspection panel -->
  <div class="max-w-xl">
    <InspectionPanel
      component={inspectingComponent}
      typeConfig={inspectingType}
      checkableAttrs={inspectingCheckable}
      lastInspection={inspectingLastInspection}
      on:saved={handleInspectionSaved}
      on:close={() => inspectingComponent = null}
    />
  </div>

{:else if editingComponent}
  <!-- Full detail / edit panel -->
  <div class="max-w-2xl">
    <ComponentDetailPanel
      component={editingComponent}
      {types}
      {systems}
      {floors}
      {facilities}
      {plans}
      {attrDefs}
      {attrOptions}
      {components}
      attrs={componentAttrs[editingComponent.id] ?? []}
      inspection={inspections[editingComponent.id] ?? null}
      on:saved={handleDetailSaved}
      on:close={handleDetailClosed}
      on:inspect={handleDetailInspect}
      on:deleted={handleDetailDeleted}
    />
  </div>

{:else if showForm}
  <!-- Component creation form -->
  <div class="max-w-2xl bg-slate-800 rounded-xl border border-slate-700 p-6">
    <ComponentForm
      {types}
      {systems}
      {attrDefs}
      {attrOptions}
      {plans}
      {floors}
      {facilities}
      {components}
      {saving}
      on:submit={handleSubmit}
      on:cancel={() => { showForm = false; errorMsg = ''; }}
    />
  </div>

{:else}
  <!-- Toolbar -->
  <div class="flex items-center gap-4 mb-4">
    <div class="flex items-center gap-2">
      <span class="text-sm text-slate-400">Floor:</span>
      <select
        bind:value={filterFloorId}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
      >
        <option value="">All floors</option>
        {#each floors as f}
          <option value={f.id}>{f.name} ({f.short_name})</option>
        {/each}
      </select>
    </div>

    <button
      on:click={() => { showForm = true; errorMsg = ''; }}
      disabled={floors.length === 0 || types.length === 0}
      class="ml-auto px-4 py-1.5 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
             disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors
             flex items-center gap-2"
    >
      <span>+</span> New Component
    </button>
  </div>

  <!-- Component list -->
  {#if store.loadingComponents}
    <p class="text-slate-500 text-sm">Loading components…</p>
  {:else if filteredComponents.length === 0}
    <div class="text-center py-16 text-slate-500">
      <p class="text-4xl mb-3">🧩</p>
      <p class="text-lg mb-1">
        {filterFloorId ? 'No components on this floor' : 'No components yet'}
      </p>
      <p class="text-sm">
        {floors.length === 0
          ? 'Run migrations 014–016 to set up the location hierarchy.'
          : 'Click "New Component" to create one using the new data model.'}
      </p>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      {#each filteredComponents as c (c.id)}
        <ComponentCard
          component={c}
          {types}
          {floors}
          {attrDefs}
          attrs={componentAttrs[c.id] ?? []}
          inspection={inspections[c.id] ?? null}
          on:edit={handleEdit}
          on:inspect={handleInspect}
          on:delete={handleDelete}
        />
      {/each}
    </div>
  {/if}
{/if}
