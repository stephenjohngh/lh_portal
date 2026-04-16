<!-- src/lib/apps/admin/components/ComponentTypesTab.svelte -->
<!-- Four-panel admin UI: Systems → Types → Attribute Definitions → Options
     Plus a Maintenance Regime sub-panel below for the selected type.
     All CRUD is handled in child panels; this component manages
     selection state and calls reload() after any save. -->
<script>
  import { buildingAssetsStore } from '$lib/apps/building_assets/stores/buildingAssetsStore.js';
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
  $: store            = $buildingAssetsStore;
  $: systems          = store.systems;
  $: types            = store.types;
  $: attrDefs         = store.attrDefs;          // { [typeId]: effective attrs with _scope }
  $: systemAttrDefs   = store.systemAttrDefs;    // { [systemId]: system-level attrs only }
  $: attrOptions      = store.attrOptions;       // { [attrDefId]: type_attribute_options[] }
  $: regime           = store.regime;            // { [typeId]: maintenance_regime[] }

  $: typesForSystem = selectedSystemId
    ? types.filter(t => t.building_system_id === selectedSystemId)
    : [];

  // When a type is selected: show its effective attrs (inherited + own).
  // When only a system is selected: show system-level attrs for direct management.
  $: attrDefsForPanel = selectedTypeId
    ? (attrDefs[selectedTypeId] ?? [])
    : selectedSystemId
      ? (systemAttrDefs[selectedSystemId] ?? []).map(a => ({ ...a, _scope: 'system' }))
      : [];

  // Panel mode tells AttrDefPanel whether it's managing system or type attrs
  $: attrPanelMode = selectedTypeId ? 'type' : selectedSystemId ? 'system' : null;

  $: selectedAttrDef = attrDefsForPanel.find(d => d.id === selectedAttrDefId) ?? null;

  $: optionsForAttrDef = selectedAttrDefId
    ? (attrOptions[selectedAttrDefId] ?? [])
    : [];

  $: showOptionsPanel = selectedAttrDef &&
    (selectedAttrDef.display_type === 'dropdown' || selectedAttrDef.display_type === 'radio');

  $: regimeForType   = selectedTypeId ? (regime[selectedTypeId] ?? []) : [];
  $: primaryAttrDef  = attrDefsForPanel.find(d => d.is_primary) ?? null;
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
    await buildingAssetsStore.reload();
  }

  // ── CSV export: system, type, attribute, option ────────────────────
  function exportCsv() {
    const s    = $buildingAssetsStore;
    const rows = [['system', 'type', 'initial', 'attribute', 'option']];

    for (const sys of s.systems) {
      const sysTypes = s.types.filter(t => t.building_system_id === sys.id);
      if (!sysTypes.length) { rows.push([sys.name, '', '', '', '']); continue; }

      for (const type of sysTypes) {
        const attrs = s.attrDefs[type.id] ?? [];
        if (!attrs.length) { rows.push([sys.name, type.name, type.initial ?? '', '', '']); continue; }

        for (const attr of attrs) {
          const options = s.attrOptions[attr.id] ?? [];
          if (!options.length) {
            rows.push([sys.name, type.name, type.initial ?? '', attr.name, '']);
          } else {
            for (const opt of options) {
              rows.push([sys.name, type.name, type.initial ?? '', attr.name, opt.value]);
            }
          }
        }
      }
    }

    const csv  = rows
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `component-types-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
</script>

<div class="space-y-4">

  <!-- ── Toolbar ───────────────────────────────────────────────────── -->
  <div class="flex items-center justify-between">
    {#if store.loading}
      <p class="text-slate-400 text-sm">Reloading…</p>
    {:else}
      <span></span>
    {/if}

    <button
      on:click={exportCsv}
      title="Download types, attributes and options as CSV"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
             bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-slate-100
             border border-slate-600 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd"
          d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
          clip-rule="evenodd"/>
      </svg>
      Export CSV
    </button>
  </div>

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
      attrDefs={attrDefsForPanel}
      mode={attrPanelMode}
      {selectedTypeId}
      {selectedSystemId}
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
