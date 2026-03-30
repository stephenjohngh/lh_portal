<!-- src/lib/apps/v2proto/components/ComponentsTab.svelte -->
<!-- Components tab: list, create, detail-edit, and inspect components.
     Reads all data from v2protoStore directly (no props needed).
     List view matches the plan inventory: one compact row per component. -->
<script>
  import { v2protoStore } from '../stores/v2protoStore.js';
  import { typeByCode, defsForType, attrValue as lookupAttrValue } from '../lookups.js';

  import ComponentForm        from './ComponentForm.svelte';
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

  // ── Delete confirm state (two-click) ─────────────────────────────
  let confirmingDelete = new Set();
  const confirmTimers  = {};

  function startDelete(c, e) {
    e.stopPropagation();
    if (confirmingDelete.has(c.id)) {
      clearTimeout(confirmTimers[c.id]);
      delete confirmTimers[c.id];
      confirmingDelete.delete(c.id);
      confirmingDelete = new Set(confirmingDelete);
      doDelete(c.id);
      return;
    }
    confirmingDelete.add(c.id);
    confirmingDelete = new Set(confirmingDelete);
    confirmTimers[c.id] = setTimeout(() => {
      confirmingDelete.delete(c.id);
      confirmingDelete = new Set(confirmingDelete);
    }, 3000);
  }

  function cancelDelete(id, e) {
    e?.stopPropagation();
    clearTimeout(confirmTimers[id]);
    delete confirmTimers[id];
    confirmingDelete.delete(id);
    confirmingDelete = new Set(confirmingDelete);
  }

  async function doDelete(id) {
    try {
      await v2protoStore.deleteComponent(id);
      if (editingComponent?.id    === id) editingComponent    = null;
      if (inspectingComponent?.id === id) inspectingComponent = null;
    } catch (err) { errorMsg = err.message; }
  }

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
      const flA = floors.find(f => f.id === a.floor_id);
      const flB = floors.find(f => f.id === b.floor_id);
      if ((flA?.level_order ?? 9999) !== (flB?.level_order ?? 9999))
        return (flA?.level_order ?? 9999) - (flB?.level_order ?? 9999);
      const tA = types.find(t => t.code === a.type_code);
      const tB = types.find(t => t.code === b.type_code);
      return (tA?.presentation_order ?? 9999) - (tB?.presentation_order ?? 9999);
    });
  })();

  // ── Row helpers ───────────────────────────────────────────────────
  function typeFor(c)  { return typeByCode(types, c.type_code); }
  function floorFor(c) { return floors.find(f => f.id === c.floor_id) ?? null; }

  function refStr(c) {
    const t   = typeFor(c);
    const fl  = floorFor(c)?.short_name ?? '?';
    const ini = t?.initial ?? '?';
    const id  = c.asset_id || c.label || '—';
    return `${fl}/${ini}/${id}`;
  }

  function allAttrPairs(c) {
    const t = typeFor(c);
    if (!t) return [];
    return defsForType(attrDefs, types, c.type_code)
      .filter(d => d.visible !== false)
      .map(d => ({ name: d.name, value: lookupAttrValue(componentAttrs, c.id, d.id) }))
      .filter(p => p.value != null && p.value !== '');
  }

  function fmtDate(c) {
    const ts = c.updated_at ?? c.created_at;
    if (!ts) return '';
    const d    = new Date(ts);
    const diff = Date.now() - d;
    if (diff < 60_000)         return 'just now';
    if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h`;
    if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function statusCls(s) {
    if (s === 'problem')  return 'bg-amber-900/50 text-amber-400';
    if (s === 'failed')   return 'bg-red-900/50 text-red-400';
    if (s === 'inactive') return 'bg-slate-700 text-slate-500';
    return 'bg-green-900/50 text-green-400';
  }

  function statusDot(s) {
    if (s === 'problem')  return 'bg-amber-400';
    if (s === 'failed')   return 'bg-red-400';
    if (s === 'inactive') return 'bg-slate-500';
    return 'bg-green-400';
  }

  // ── Create handler ────────────────────────────────────────────────
  async function handleSubmit(e) {
    const { fields, attrValues } = e.detail;
    saving = true; errorMsg = '';
    try {
      await v2protoStore.createComponent(fields, attrValues);
      showForm = false;
      await v2protoStore.loadComponents();
    } catch (err) { errorMsg = err.message; }
    finally       { saving = false; }
  }

  function handleDetailSaved() {
    editingComponent = $v2protoStore.components.find(c => c.id === editingComponent?.id) ?? null;
    errorMsg = '';
  }

  function handleDetailInspect(e) {
    inspectingComponent = e.detail.component;
    editingComponent    = null;
    errorMsg            = '';
  }
</script>

<!-- Error banner -->
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
      on:saved={() => inspectingComponent = null}
      on:close={() => inspectingComponent = null}
    />
  </div>

{:else if editingComponent}
  <!-- Full detail / edit panel -->
  <div class="max-w-2xl">
    <ComponentDetailPanel
      component={editingComponent}
      {types} {systems} {floors} {facilities} {plans}
      {attrDefs} {attrOptions} {components}
      attrs={componentAttrs[editingComponent.id] ?? []}
      inspection={inspections[editingComponent.id] ?? null}
      on:saved={handleDetailSaved}
      on:close={() => editingComponent = null}
      on:inspect={handleDetailInspect}
      on:deleted={() => editingComponent = null}
    />
  </div>

{:else if showForm}
  <!-- Component creation form -->
  <div class="max-w-2xl bg-slate-800 rounded-xl border border-slate-700 p-6">
    <ComponentForm
      {types} {systems} {attrDefs} {attrOptions}
      {plans} {floors} {facilities} {components}
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
    <div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Components</p>
        <span class="text-xs text-slate-600">
          {filteredComponents.length} {filteredComponents.length !== 1 ? 'items' : 'item'}
        </span>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
          <thead>
            <tr class="border-b border-slate-700 text-left bg-slate-800">
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-5"></th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Ref</th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Type</th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Status</th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide">Attributes</th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Position</th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">Modified</th>
              <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-16"></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredComponents as c (c.id)}
              {@const t      = typeFor(c)}
              {@const attrs  = allAttrPairs(c)}
              {@const inDel  = confirmingDelete.has(c.id)}
              {@const status = (c.status || 'ok').toLowerCase()}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <tr
                class="border-b border-slate-700/30 hover:bg-slate-700/30
                       cursor-pointer transition-colors group
                       {inDel ? 'bg-red-900/10' : ''}"
                on:click={() => { editingComponent = c; errorMsg = ''; }}
                title="Click to view / edit"
              >

                <!-- ① Icon -->
                <td class="pl-3 pr-1 py-1">
                  {#if t}
                    <div
                      class="w-4 h-4 flex items-center justify-center text-white
                             text-[9px] font-bold shrink-0
                             {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
                      style:background-color="#{t.colour}"
                    >{t.initial}</div>
                  {:else}
                    <div class="w-4 h-4 rounded bg-slate-600 shrink-0"></div>
                  {/if}
                </td>

                <!-- ② Ref: Floor/Initial/AssetID -->
                <td class="px-2 py-1 font-mono text-slate-300 whitespace-nowrap
                           group-hover:text-white transition-colors">
                  {refStr(c)}
                </td>

                <!-- ③ Type name -->
                <td class="px-2 py-1 text-slate-400 whitespace-nowrap">
                  {t?.name ?? c.type_code}
                </td>

                <!-- ④ Status dot + badge -->
                <td class="px-2 py-1 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full shrink-0 {statusDot(status)}"></span>
                    <span class="px-1 py-0.5 rounded text-[10px] font-medium {statusCls(status)}">
                      {status}
                    </span>
                  </span>
                </td>

                <!-- ⑤ Attributes: values in presentation order, · separated -->
                <td class="px-2 py-1 text-slate-400 max-w-[320px]">
                  {#if attrs.length > 0}
                    <span class="truncate block"
                          title={attrs.map(p => `${p.name}: ${p.value}`).join(' · ')}>
                      {#each attrs as p, i}
                        {#if i > 0}<span class="text-slate-700 mx-0.5">·</span>{/if}
                        <span class="text-slate-300">{p.value}</span>
                      {/each}
                    </span>
                  {:else}
                    <span class="text-slate-700">—</span>
                  {/if}
                </td>

                <!-- ⑥ Position -->
                <td class="px-2 py-1 font-mono text-slate-500 whitespace-nowrap text-[10px]">
                  {#if c.x_position != null}
                    {(c.x_position * 100).toFixed(0)}%,{(c.y_position * 100).toFixed(0)}%
                  {:else}
                    <span class="text-slate-700">—</span>
                  {/if}
                </td>

                <!-- ⑦ Date -->
                <td class="px-2 py-1 text-slate-500 whitespace-nowrap text-[10px]">
                  {fmtDate(c)}
                </td>

                <!-- ⑧ Actions -->
                <td class="px-2 py-1 whitespace-nowrap" on:click|stopPropagation>
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100
                              transition-opacity {inDel ? '!opacity-100' : ''}">

                    {#if !inDel}
                      <button
                        on:click|stopPropagation={() => {
                          inspectingComponent = c; editingComponent = null; errorMsg = '';
                        }}
                        class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600
                               text-slate-300 hover:text-white transition-colors text-[10px]"
                        title="Open inspection panel"
                      >🔍</button>
                    {/if}

                    {#if inDel}
                      <button
                        on:click|stopPropagation={e => cancelDelete(c.id, e)}
                        class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600
                               text-slate-400 transition-colors text-[10px]"
                        title="Cancel"
                      >✕</button>
                      <button
                        on:click|stopPropagation={e => startDelete(c, e)}
                        class="px-1.5 py-0.5 rounded bg-red-700 hover:bg-red-600
                               text-white font-medium transition-colors text-[10px]"
                        title="Confirm delete"
                      >Delete?</button>
                    {:else}
                      <button
                        on:click|stopPropagation={e => startDelete(c, e)}
                        class="px-1.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/50
                               text-red-500 border border-red-900/40 transition-colors text-[10px]"
                        title="Delete (click twice)"
                      >🗑</button>
                    {/if}

                  </div>
                </td>

              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
{/if}
