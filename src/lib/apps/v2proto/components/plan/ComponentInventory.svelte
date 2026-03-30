<!-- plan/ComponentInventory.svelte -->
<!-- Full-width inventory table rendered below the plan canvas.
     Responds to the same visibleComponents array as the plan markers.

     List view  — one row per component; compact single-line format:
                  icon · Floor/Initial/asset_id · type · status · attributes ·
                  position · date · [inspect] [delete×2]
                  Clicking a row fires 'selectcomponent' to open the detail panel.

     Summary view — one row per type, grouped by building system;
                    counts broken down by status.

     Attribute display strategy:
       componentAttrs[id]  → raw DB rows: { type_attribute_id, value }
       attrDefs[typeId]    → merged defs:  { id, name, is_primary, visible, ... }
       Match via type_attribute_id === def.id.
       Only defs with visible=true are shown. Values shown in presentation order.    -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { typeByCode, defsForType, systemById, attrValue as lookupAttrValue } from '../../lookups.js';

  export let components     = [];   // visibleComponents (filtered)
  export let componentAttrs = {};   // store.componentAttrs keyed by component id
  export let types          = [];
  export let systems        = [];
  export let attrDefs       = {};   // keyed by type id
  export let floors         = [];   // for floor short_name lookup

  const dispatch = createEventDispatcher();

  let view = 'list';   // 'list' | 'summary'

  // ── Delete confirm state ──────────────────────────────────────────
  // First click → add id; second click within 3 s → dispatch delete.
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

  // ── Helpers ───────────────────────────────────────────────────────
  function typeFor(c) { return typeByCode(types, c.type_code); }
  function floorFor(c) { return floors.find(f => f.id === c.floor_id) ?? null; }
  function systemFor(t) { return t ? systemById(systems, t.building_system_id) : null; }

  // Compact reference: {floor_short}/{type_initial}/{asset_id|label|—}
  function refStr(c, t) {
    const fl  = floorFor(c)?.short_name ?? '?';
    const ini = t?.initial ?? '?';
    const id  = c.asset_id || c.label || '—';
    return `${fl}/${ini}/${id}`;
  }

  // All visible attr defs for a component's type, in presentation order
  function defsFor(c) {
    return defsForType(attrDefs, types, c.type_code).filter(d => d.visible !== false);
  }

  // Attribute values as a flat array of { name, value } in presentation order
  function allAttrPairs(c) {
    return defsFor(c)
      .map(d => ({ name: d.name, value: lookupAttrValue(componentAttrs, c.id, d.id) }))
      .filter(p => p.value != null && p.value !== '');
  }

  // Compact date: relative for recent, short date for older
  function fmtDate(c) {
    const ts = c.updated_at ?? c.created_at;
    if (!ts) return '';
    const d    = new Date(ts);
    const diff = Date.now() - d;
    if (diff < 60_000)           return 'just now';
    if (diff < 3_600_000)        return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000)       return `${Math.floor(diff / 3_600_000)}h`;
    if (diff < 86_400_000 * 7)   return `${Math.floor(diff / 86_400_000)}d`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // ── Summary data ─────────────────────────────────────────────────
  $: summaryRows = (() => {
    const rows = new Map();
    for (const c of components) {
      const t   = typeFor(c);
      const key = t?.id ?? '__none__';
      if (!rows.has(key)) {
        rows.set(key, {
          type: t, system: systemFor(t),
          ok: 0, problem: 0, failed: 0, inactive: 0, total: 0
        });
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
    (acc, r) => {
      acc.total    += r.total;
      acc.ok       += r.ok;
      acc.problem  += r.problem;
      acc.failed   += r.failed;
      acc.inactive += r.inactive;
      return acc;
    },
    { total: 0, ok: 0, problem: 0, failed: 0, inactive: 0 }
  );

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
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">

  <!-- ── Header ──────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
    <p class="font-semibold text-white text-sm">Inventory</p>

    <div class="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
      <button
        on:click={() => view = 'list'}
        class="px-3 py-1 transition-colors
               {view === 'list'
                 ? 'bg-purple-600 text-white font-medium'
                 : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
      >List</button>
      <button
        on:click={() => view = 'summary'}
        class="px-3 py-1 border-l border-slate-600 transition-colors
               {view === 'summary'
                 ? 'bg-purple-600 text-white font-medium'
                 : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}"
      >Summary</button>
    </div>

    <span class="ml-auto text-xs text-slate-500">
      {components.length} component{components.length !== 1 ? 's' : ''}
    </span>
  </div>

  <!-- ── Empty state ─────────────────────────────────────────────── -->
  {#if components.length === 0}
    <p class="px-4 py-8 text-sm text-slate-600 italic text-center">
      No components match the current filters.
    </p>

  <!-- ── List view ───────────────────────────────────────────────── -->
  {:else if view === 'list'}
    <div class="overflow-x-auto">
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="border-b border-slate-700 text-left sticky top-0 bg-slate-800">
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
          {#each components as c (c.id)}
            {@const t     = typeFor(c)}
            {@const attrs = allAttrPairs(c)}
            {@const inDel = confirmingDelete.has(c.id)}
            {@const status = (c.status || 'ok').toLowerCase()}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <tr
              class="border-b border-slate-700/30 hover:bg-slate-700/30
                     cursor-pointer transition-colors group
                     {inDel ? 'bg-red-900/10' : ''}"
              on:click={() => dispatch('selectcomponent', { component: c })}
              title="Click to open detail"
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
                {refStr(c, t)}
              </td>

              <!-- ③ Type name -->
              <td class="px-2 py-1 text-slate-400 whitespace-nowrap">
                {t?.name ?? c.type_code}
              </td>

              <!-- ④ Status dot + label -->
              <td class="px-2 py-1 whitespace-nowrap">
                <span class="inline-flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0 {statusDot(status)}"></span>
                  <span class="px-1 py-0.5 rounded text-[10px] font-medium {statusCls(status)}">
                    {status}
                  </span>
                </span>
              </td>

              <!-- ⑤ Attributes — values in presentation order, separated by · -->
              <td class="px-2 py-1 text-slate-400 max-w-[320px]">
                {#if attrs.length > 0}
                  <span class="truncate block" title={attrs.map(p => `${p.name}: ${p.value}`).join(' · ')}>
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

              <!-- ⑦ Date (later of created/updated) -->
              <td class="px-2 py-1 text-slate-500 whitespace-nowrap text-[10px]">
                {fmtDate(c)}
              </td>

              <!-- ⑧ Actions: Inspect + Delete -->
              <td class="px-2 py-1 whitespace-nowrap" on:click|stopPropagation>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity
                            {inDel ? '!opacity-100' : ''}">

                  {#if !inDel}
                    <!-- Inspect -->
                    <button
                      on:click|stopPropagation={() => dispatch('inspect', { component: c })}
                      class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600
                             text-slate-300 hover:text-white transition-colors text-[10px]"
                      title="Open inspection panel"
                    >🔍</button>
                  {/if}

                  <!-- Delete (two-click confirm) -->
                  {#if inDel}
                    <button
                      on:click|stopPropagation={e => cancelDelete(c.id, e)}
                      class="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600
                             text-slate-400 transition-colors text-[10px]"
                      title="Cancel delete"
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
                      title="Delete component (click twice)"
                    >🗑</button>
                  {/if}

                </div>
              </td>

            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  <!-- ── Summary view ────────────────────────────────────────────── -->
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
                      <div class="w-2 h-2 rounded-full shrink-0"
                           style:background-color="#{row.system.colour}"></div>
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
