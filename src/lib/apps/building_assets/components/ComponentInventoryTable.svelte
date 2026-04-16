<!-- src/lib/apps/building_assets/components/ComponentInventoryTable.svelte -->
<!-- Shared inventory table used by both ComponentsTab and plan/ComponentInventory.
     Renders a list view (one row per component) or a summary view (counts by type).

     List columns: Icon · Ref · Label · Type · Status · Attributes · Actions
     Attributes: all non-checkable visible defs, shown as "Name: Value", checkboxes
                 only shown when true ("Name: Yes"), false values hidden.
     Summary: System / Type / Total / OK / Problem / Failed / Inactive

     An optional named "filters" slot renders inside the card header, above the table.
     ComponentsTab uses this for floor/type/status/search controls.
     ComponentInventory leaves it empty. -->

<script>
  import { createEventDispatcher } from 'svelte';
  import { typeByCode, defsForType, systemById, attrValue as lookupAttrValue } from '../lookups.js';
  import { fmtComponentRef } from '$lib/utils/componentRef.js';

  export let components     = [];
  export let componentAttrs = {};   // { [componentId]: component_attributes[] }
  export let componentLinks = {};   // { [componentId]: component_links[] }
  export let attrDefs       = {};   // { [typeId]: effective attr defs }
  export let types          = [];
  export let systems        = [];
  export let floors         = [];
  export let title          = 'Inventory';
  export let readOnly       = false;

  const dispatch = createEventDispatcher();

  let view = 'list';   // 'list' | 'summary'

  // ── Delete confirm (two-click, 3 s timeout) ───────────────────────
  let confirmingDelete = new Set();
  const confirmTimers  = {};

  function startDelete(c, e) {
    e.stopPropagation();
    if (confirmingDelete.has(c.id)) {
      clearTimeout(confirmTimers[c.id]);
      delete confirmTimers[c.id];
      confirmingDelete.delete(c.id);
      confirmingDelete = new Set(confirmingDelete);
      dispatch('deletecomponent', { component: c });
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

  // ── Row helpers ───────────────────────────────────────────────────
  function typeFor(c)  { return typeByCode(types, c.type_code); }
  function floorFor(c) { return floors.find(f => f.id === c.floor_id) ?? null; }
  function systemFor(t) { return t ? systemById(systems, t.building_system_id) : null; }

  // Floor/Initial/AssetID reference string
  function refStr(c, t) {
    const fl  = floorFor(c)?.short_name ?? '?';
    const ini = t?.initial ?? '?';
    const id  = c.asset_id || '—';
    return `${fl}/${ini}/${id}`;
  }

  // Attribute pairs using the same rules as the component report:
  //   number   → { name, value, display_type:'number' }   — show "name: value"
  //   dropdown → { name, value, display_type:'dropdown' }  — show "value" only
  //   checkbox → included only when true                   — show "name" only
  //   others   → { name, value, display_type:'text' }      — show "name" only
  // Suppressed: visible=false, checkable, null/empty, or value in (None/No/Unknown)
  const SUPPRESSED = new Set(['None', 'No', 'Unknown']);

  function allAttrPairs(c) {
    return defsForType(attrDefs, types, c.type_code)
      .filter(d => d.visible !== false && !d.checkable)
      .map(d => {
        const raw = lookupAttrValue(componentAttrs, c.id, d.id) ?? d.default_value ?? null;
        if (raw == null || raw === '') return null;
        if (d.display_type === 'checkbox') {
          return raw === 'true' ? { name: d.name, value: 'Yes', display_type: 'checkbox' } : null;
        }
        if (SUPPRESSED.has(String(raw))) return null;
        return { name: d.name, value: String(raw), display_type: d.display_type ?? 'text' };
      })
      .filter(Boolean);
  }

  // ── Status helpers ────────────────────────────────────────────────
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

  // ── Sort: floor → system → type → asset_id ───────────────────────
  $: sortedComponents = [...components].sort((a, b) => {
    const flA = floors.find(f => f.id === a.floor_id);
    const flB = floors.find(f => f.id === b.floor_id);
    const loA = flA?.level_order ?? 9999;
    const loB = flB?.level_order ?? 9999;
    if (loA !== loB) return loA - loB;

    const tA  = types.find(t => t.code === a.type_code);
    const tB  = types.find(t => t.code === b.type_code);
    const sA  = systems.find(s => s.id === tA?.building_system_id);
    const sB  = systems.find(s => s.id === tB?.building_system_id);
    const spA = sA?.presentation_order ?? 9999;
    const spB = sB?.presentation_order ?? 9999;
    if (spA !== spB) return spA - spB;

    const tpA = tA?.presentation_order ?? 9999;
    const tpB = tB?.presentation_order ?? 9999;
    if (tpA !== tpB) return tpA - tpB;

    return (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true });
  });

  // ── Summary data ──────────────────────────────────────────────────
  $: summaryRows = (() => {
    const rows = new Map();
    for (const c of components) {
      const t   = typeFor(c);
      const key = t?.id ?? '__none__';
      if (!rows.has(key)) {
        rows.set(key, { type: t, system: systemFor(t), ok: 0, problem: 0, failed: 0, inactive: 0, total: 0 });
      }
      const r = rows.get(key);
      r.total++;
      const s = (c.status || 'ok').toLowerCase();
      if (s in r) r[s]++;
    }
    return [...rows.values()].sort((a, b) => {
      const sa = a.system?.name ?? 'ZZZ';
      const sb = b.system?.name ?? 'ZZZ';
      if (sa !== sb) return sa.localeCompare(sb);
      return (a.type?.name ?? '').localeCompare(b.type?.name ?? '');
    });
  })();

  $: totals = summaryRows.reduce(
    (acc, r) => ({ total: acc.total + r.total, ok: acc.ok + r.ok, problem: acc.problem + r.problem, failed: acc.failed + r.failed, inactive: acc.inactive + r.inactive }),
    { total: 0, ok: 0, problem: 0, failed: 0, inactive: 0 }
  );
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">

  <!-- ── Card header: title + view toggle ─────────────────────────── -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700 flex-wrap">
    <p class="font-semibold text-white text-sm shrink-0">{title}</p>

    <div class="flex rounded-lg overflow-hidden border border-slate-600 text-xs shrink-0">
      <button
        on:click={() => view = 'list'}
        class="px-3 py-1 transition-colors
               {view === 'list' ? 'bg-purple-600 text-white font-medium' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
      >List</button>
      <button
        on:click={() => view = 'summary'}
        class="px-3 py-1 border-l border-slate-600 transition-colors
               {view === 'summary' ? 'bg-purple-600 text-white font-medium' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
      >Summary</button>
    </div>

    <span class="ml-auto text-xs text-slate-500 shrink-0">
      {components.length} component{components.length !== 1 ? 's' : ''}
    </span>
  </div>

  <!-- ── Optional filters slot (ComponentsTab only) ─────────────── -->
  <slot name="filters" />

  <!-- ── Empty state ────────────────────────────────────────────── -->
  {#if components.length === 0}
    <p class="px-4 py-8 text-sm text-slate-600 italic text-center">
      No components match the current filters.
    </p>

  <!-- ── List view ──────────────────────────────────────────────── -->
  {:else if view === 'list'}
    <div class="overflow-x-auto">
      <table class="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr class="border-b border-slate-700 text-left sticky top-0 bg-slate-800">
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-7"></th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-20">Ref</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-36">Label</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-28">Type</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-20">Status</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide">Attributes</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-40">Linked</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-48">Notes</th>
            <th class="px-2 py-1.5 text-slate-500 font-medium uppercase tracking-wide w-16"></th>
          </tr>
        </thead>
        <tbody>
          {#each sortedComponents as c (c.id)}
            {@const t      = typeFor(c)}
            {@const attrs  = allAttrPairs(c)}
            {@const inDel  = confirmingDelete.has(c.id)}
            {@const status = (c.status || 'ok').toLowerCase()}
            {@const links  = componentLinks[c.id] ?? []}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <tr
              class="border-b border-slate-700/30 hover:bg-slate-700/30 cursor-pointer
                     transition-colors group {inDel ? 'bg-red-900/10' : ''}"
              on:click={() => dispatch('selectcomponent', { component: c })}
              title="Click to open detail"
            >

              <!-- ① Type marker -->
              <td class="pl-3 pr-1 py-2 overflow-hidden">
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

              <!-- ② Ref -->
              <td class="px-2 py-2 font-mono text-slate-300 overflow-hidden group-hover:text-white transition-colors">
                {refStr(c, t)}
              </td>

              <!-- ③ Label -->
              <td class="px-2 py-2 text-slate-300 overflow-hidden">
                {#if c.label}
                  <span class="truncate block" title={c.label}>{c.label}</span>
                {:else}
                  <span class="text-slate-700">—</span>
                {/if}
              </td>

              <!-- ④ Type name -->
              <td class="px-2 py-2 text-slate-400 overflow-hidden">
                <span class="truncate block" title={t?.name ?? c.type_code}>{t?.name ?? c.type_code}</span>
              </td>

              <!-- ⑤ Status -->
              <td class="px-2 py-2 overflow-hidden">
                <span class="inline-flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0 {statusDot(status)}"></span>
                  <span class="px-1 py-0.5 rounded text-[10px] font-medium {statusCls(status)}">{status}</span>
                </span>
              </td>

              <!-- ⑥ Attributes (report rules: number=name:value, dropdown=value, others=name) -->
              <td class="px-2 py-2 text-slate-400 overflow-hidden">
                {#if attrs.length > 0}
                  {@const tooltip = attrs.map(p =>
                    p.display_type === 'number'   ? `${p.name}: ${p.value}` :
                    p.display_type === 'dropdown' ? p.value : p.name
                  ).join(', ')}
                  <span class="truncate block" title={tooltip}>
                    {#each attrs as p, i}
                      {#if i > 0}<span class="text-slate-500">, </span>{/if}
                      {#if p.display_type === 'number'}
                        <span class="text-slate-500">{p.name}:</span>
                        <span class="text-slate-300 ml-0.5">{p.value}</span>
                      {:else if p.display_type === 'dropdown'}
                        <span class="text-slate-300">{p.value}</span>
                      {:else}
                        <span class="text-slate-300">{p.name}</span>
                      {/if}
                    {/each}
                  </span>
                {:else}
                  <span class="text-slate-700">—</span>
                {/if}
              </td>

              <!-- ⑦ Linked -->
              <td class="px-2 py-2 text-slate-400 overflow-hidden">
                {#if links.length > 0}
                  <span class="truncate block text-purple-400/80 font-mono text-[10px]"
                        title={links.map(l => fmtComponentRef(l.to_component_ref, types)).join(', ')}>
                    {links.map(l => fmtComponentRef(l.to_component_ref, types)).join(', ')}
                  </span>
                {:else}
                  <span class="text-slate-700">—</span>
                {/if}
              </td>

              <!-- ⑧ Notes -->
              <td class="px-2 py-2 text-slate-400 overflow-hidden">
                {#if c.notes}
                  <span class="truncate block text-sm text-slate-500" title={c.notes}>{c.notes}</span>
                {:else}
                  <span class="text-slate-700">—</span>
                {/if}
              </td>

              <!-- ⑨ Actions -->
              <td class="px-2 py-2 whitespace-nowrap" on:click|stopPropagation>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity
                            {inDel && !readOnly ? '!opacity-100' : ''}">
                  {#if !inDel && !readOnly}
                    <button
                      on:click|stopPropagation={() => dispatch('inspect', { component: c })}
                      class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600
                             text-slate-300 hover:text-white transition-colors text-[10px]"
                      title="Inspect"
                    >🔍</button>
                  {/if}
                  {#if !readOnly}
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
                      >Delete?</button>
                    {:else}
                      <button
                        on:click|stopPropagation={e => startDelete(c, e)}
                        class="px-1.5 py-0.5 rounded bg-red-900/40 hover:bg-red-800/50
                               text-red-500 border border-red-900/40 transition-colors text-[10px]"
                        title="Delete (click twice)"
                      >🗑</button>
                    {/if}
                  {/if}
                </div>
              </td>

            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  <!-- ── Summary view ──────────────────────────────────────────── -->
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="border-b border-slate-700 text-left">
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">System</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Type</th>
            <th class="px-3 py-2 text-right text-slate-500 font-medium uppercase tracking-wide">Total</th>
            <th class="px-3 py-2 text-right text-green-600 font-medium uppercase tracking-wide">OK</th>
            <th class="px-3 py-2 text-right text-amber-600 font-medium uppercase tracking-wide">Problem</th>
            <th class="px-3 py-2 text-right text-red-600 font-medium uppercase tracking-wide">Failed</th>
            <th class="px-3 py-2 text-right text-slate-600 font-medium uppercase tracking-wide">Inactive</th>
          </tr>
        </thead>
        <tbody>
          {#each summaryRows as row (row.type?.id ?? '__none__')}
            <tr class="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors">
              <td class="px-3 py-2 text-slate-500 whitespace-nowrap">
                {#if row.system}
                  <div class="flex items-center gap-1.5">
                    {#if row.system.colour}
                      <div class="w-2 h-2 rounded-full shrink-0" style:background-color="#{row.system.colour}"></div>
                    {/if}
                    {row.system.name}
                  </div>
                {:else}
                  <span class="text-slate-700">Other</span>
                {/if}
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-1.5">
                  {#if row.type}
                    <div
                      class="w-4 h-4 flex items-center justify-center text-white
                             text-[9px] font-bold shrink-0
                             {row.type.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
                      style:background-color="#{row.type.colour}"
                    >{row.type.initial}</div>
                    <span class="text-slate-300">{row.type.name}</span>
                  {:else}
                    <span class="text-slate-600">Unknown</span>
                  {/if}
                </div>
              </td>
              <td class="px-3 py-2 text-right font-semibold text-white">{row.total}</td>
              <td class="px-3 py-2 text-right {row.ok       > 0 ? 'text-green-400' : 'text-slate-800'}">{row.ok       || '—'}</td>
              <td class="px-3 py-2 text-right {row.problem  > 0 ? 'text-amber-400' : 'text-slate-800'}">{row.problem  || '—'}</td>
              <td class="px-3 py-2 text-right {row.failed   > 0 ? 'text-red-400'   : 'text-slate-800'}">{row.failed   || '—'}</td>
              <td class="px-3 py-2 text-right {row.inactive > 0 ? 'text-slate-400' : 'text-slate-800'}">{row.inactive || '—'}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-slate-600">
            <td class="px-3 py-2 text-slate-500 font-semibold" colspan="2">Total</td>
            <td class="px-3 py-2 text-right font-bold text-white">{totals.total}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.ok       > 0 ? 'text-green-400' : 'text-slate-700'}">{totals.ok       || '—'}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.problem  > 0 ? 'text-amber-400' : 'text-slate-700'}">{totals.problem  || '—'}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.failed   > 0 ? 'text-red-400'   : 'text-slate-700'}">{totals.failed   || '—'}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.inactive > 0 ? 'text-slate-400' : 'text-slate-700'}">{totals.inactive || '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}

</div>
