<!-- src/lib/apps/v2proto/components/admin/AdminTab.svelte -->
<!-- Four-panel admin UI: Systems → Types → Attribute Definitions → Options
     Plus a Maintenance Regime sub-panel below for the selected type.
     All CRUD is handled in child panels; this component manages
     selection state and calls reload() after any save. -->
<script>
  import { v2protoStore } from '../../stores/v2protoStore.js';
  import SystemPanel      from './SystemPanel.svelte';
  import TypePanel        from './TypePanel.svelte';
  import AttrDefPanel     from './AttrDefPanel.svelte';
  import OptionsPanel     from './OptionsPanel.svelte';
  import MaintenancePanel from './MaintenancePanel.svelte';

  // ── Selection state ────────────────────────────────────────────────
  let selectedSystemId  = null;
  let selectedTypeId    = null;
  let selectedAttrDefId = null;

  // ── Derived from store ─────────────────────────────────────────────
  $: store       = $v2protoStore;
  $: systems     = store.systems;
  $: types       = store.types;
  $: attrDefs    = store.attrDefs;    // { [typeId]: type_attributes[] }
  $: attrOptions = store.attrOptions; // { [attrDefId]: type_attribute_options[] }
  $: regime      = store.regime;      // { [typeId]: maintenance_regime[] }

  $: typesForSystem = selectedSystemId
    ? types.filter(t => t.building_system_id === selectedSystemId)
    : [];

  $: attrDefsForType = selectedTypeId
    ? (attrDefs[selectedTypeId] ?? [])
    : [];

  $: selectedAttrDef = attrDefsForType.find(d => d.id === selectedAttrDefId) ?? null;

  $: optionsForAttrDef = selectedAttrDefId
    ? (attrOptions[selectedAttrDefId] ?? [])
    : [];

  $: showOptionsPanel = selectedAttrDef &&
    (selectedAttrDef.display_type === 'dropdown' || selectedAttrDef.display_type === 'radio');

  $: regimeForType   = selectedTypeId ? (regime[selectedTypeId] ?? []) : [];
  $: primaryAttrDef  = attrDefsForType.find(d => d.is_primary) ?? null;
  $: primaryOptions  = primaryAttrDef ? (attrOptions[primaryAttrDef.id] ?? []) : [];

  // ── Selection handlers ─────────────────────────────────────────────
  function selectSystem(id) {
    selectedSystemId  = id;
    selectedTypeId    = null;
    selectedAttrDefId = null;
  }

  function selectType(id) {
    selectedTypeId    = id;
    selectedAttrDefId = null;
  }

  function selectAttrDef(id) {
    selectedAttrDefId = id;
  }

  // ── After any save: reload the store, keep selections ─────────────
  async function onSaved() {
    await v2protoStore.reload();
  }
</script>

<div class="space-y-4">

  {#if store.loading}
    <p class="text-slate-400 text-sm">Reloading…</p>
  {/if}

  <!-- ── Four-panel layout ─────────────────────────────────────────── -->
  <div class="flex min-h-[520px] rounded-xl border border-slate-700 overflow-hidden divide-x divide-slate-700">

    <SystemPanel
      {systems}
      {selectedSystemId}
      on:select={e => selectSystem(e.detail)}
      on:saved={onSaved}
    />

    <TypePanel
      types={typesForSystem}
      {selectedSystemId}
      {selectedTypeId}
      on:select={e => selectType(e.detail)}
      on:saved={onSaved}
    />

    <AttrDefPanel
      attrDefs={attrDefsForType}
      {selectedTypeId}
      {selectedAttrDefId}
      on:select={e => selectAttrDef(e.detail)}
      on:saved={onSaved}
    />

    <OptionsPanel
      options={optionsForAttrDef}
      attrDef={selectedAttrDef}
      on:saved={onSaved}
    />

  </div>

  <!-- ── Maintenance regime (only when a type is selected) ─────────── -->
  {#if selectedTypeId}
    {@const selectedType = types.find(t => t.id === selectedTypeId)}
    <MaintenancePanel
      regimeRows={regimeForType}
      typeId={selectedTypeId}
      typeName={selectedType?.name ?? ''}
      {primaryOptions}
      on:saved={onSaved}
    />
  {/if}

</div>
