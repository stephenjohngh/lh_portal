<!-- plan/ComponentInventory.svelte -->
<!-- Full-width inventory table rendered below the plan canvas.
     Responds to the same visibleComponents array as the plan markers.

     List view  — one row per component; type, ref/asset, label, primary attribute,
                  other attribute values, notes, status.
                  Clicking a row fires 'selectcomponent' to open the detail panel.

     Summary view — one row per type, grouped by building system;
                    counts broken down by status.

     Attribute display strategy:
       componentAttrs[id]  → raw DB rows: { type_attribute_id, value }
       attrDefs[typeId]    → merged defs:  { id, name, is_primary, visible, ... }
       Match via type_attribute_id === def.id.
       Only defs with visible=true are shown. Primary attr gets its own column.     -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { typeByCode, defsForType, systemById, attrValue as lookupAttrValue } from '../../lookups.js';

  export let components     = [];   // visibleComponents (filtered)
  export let componentAttrs = {};   // store.componentAttrs keyed by component id
  export let types          = [];
  export let systems        = [];
  export let attrDefs       = {};   // keyed by type id

  const dispatch = createEventDispatcher();

  let view = 'list';   // 'list' | 'summary'

  // ── Helpers ──────────────────────────────────────────────────────
  function typeFor(c) {
    return typeByCode(types, c.type_code);
  }

  function systemFor(t) {
    return t ? systemById(systems, t.building_system_id) : null;
  }

  // Visible attr defs for a component's type, sorted by presentation_order
  function defsFor(c) {
    return defsForType(attrDefs, types, c.type_code).filter(d => d.visible !== false);
  }

  // Primary attr def (is_primary: true, or first visible def as fallback)
  function primaryDef(c) {
    const defs = defsFor(c);
    return defs.find(d => d.is_primary) ?? defs[0] ?? null;
  }

  // Value string for a specific attr def on a component
  function attrValue(c, defId) {
    return lookupAttrValue(componentAttrs, c.id, defId);
  }

  // All visible attr values for a component (excluding primary), as { name, value } pairs
  function otherAttrPairs(c) {
    const pd   = primaryDef(c);
    const defs = defsFor(c).filter(d => d.id !== pd?.id);
    return defs
      .map(d => ({ name: d.name, value: attrValue(c, d.id) }))
      .filter(p => p.value != null && p.value !== '');
  }

  // ── Summary data ─────────────────────────────────────────────────
  $: summaryRows = (() => {
    // Group by system then type
    const rows = new Map();   // key = typeId
    for (const c of components) {
      const t   = typeFor(c);
      const key = t?.id ?? '__none__';
      if (!rows.has(key)) {
        rows.set(key, {
          type:    t,
          system:  systemFor(t),
          ok: 0, problem: 0, failed: 0, inactive: 0, total: 0
        });
      }
      const r = rows.get(key);
      r.total++;
      const s = c.status || 'ok';
      if (s in r) r[s]++;
    }
    // Sort: by system name then type name
    return [...rows.values()].sort((a, b) => {
      const sa = a.system?.name ?? 'ZZZ';
      const sb = b.system?.name ?? 'ZZZ';
      if (sa !== sb) return sa.localeCompare(sb);
      return (a.type?.name ?? '').localeCompare(b.type?.name ?? '');
    });
  })();

  // Summary footer totals
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

  // ── Status badge helper ───────────────────────────────────────────
  function statusCls(s) {
    if (s === 'problem')  return 'bg-amber-900/50 text-amber-400';
    if (s === 'failed')   return 'bg-red-900/50 text-red-400';
    if (s === 'inactive') return 'bg-slate-700 text-slate-500';
    return 'bg-green-900/50 text-green-400';
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">

  <!-- ── Header ──────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
    <p class="font-semibold text-white text-sm">Inventory</p>

    <!-- List / Summary toggle -->
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
          <tr class="border-b border-slate-700 text-left">
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Type</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Asset ID</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Label</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Subtype</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Attributes</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Notes</th>
            <th class="px-3 py-2 text-slate-500 font-medium uppercase tracking-wide">Status</th>
          </tr>
        </thead>
        <tbody>
          {#each components as c (c.id)}
            {@const t       = typeFor(c)}
            {@const pd      = primaryDef(c)}
            {@const primary = pd ? attrValue(c, pd.id) : null}
            {@const others  = otherAttrPairs(c)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <tr
              class="border-b border-slate-700/40 hover:bg-slate-700/40
                     cursor-pointer transition-colors group"
              on:click={() => dispatch('selectcomponent', { component: c })}
              title="Click to view / edit on plan"
            >

              <!-- Type -->
              <td class="px-3 py-2">
                <div class="flex items-center gap-1.5 whitespace-nowrap">
                  {#if t}
                    <div
                      class="w-4 h-4 flex items-center justify-center text-white
                             text-[9px] font-bold shrink-0
                             {t.marker_shape === 'circle' ? 'rounded-full' : 'rounded'}"
                      style:background-color="#{t.colour}"
                    >{t.initial}</div>
                    <span class="text-slate-300 group-hover:text-white transition-colors"
                    >{t.name}</span>
                  {:else}
                    <span class="text-slate-600 font-mono">{c.type_code}</span>
                  {/if}
                </div>
              </td>

              <!-- Asset ID / ref -->
              <td class="px-3 py-2 font-mono text-slate-400 whitespace-nowrap">
                {c.asset_id ?? '—'}
              </td>

              <!-- Label -->
              <td class="px-3 py-2 text-slate-300 whitespace-nowrap">
                {c.label ?? '—'}
              </td>

              <!-- Primary attribute (subtype) -->
              <td class="px-3 py-2">
                {#if primary}
                  <span class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 whitespace-nowrap">
                    {primary}
                  </span>
                {:else}
                  <span class="text-slate-700">—</span>
                {/if}
              </td>

              <!-- Other attributes as name: value chips -->
              <td class="px-3 py-2">
                {#if others.length > 0}
                  <div class="flex flex-wrap gap-1">
                    {#each others.slice(0, 5) as pair}
                      <span
                        class="px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 whitespace-nowrap"
                        title="{pair.name}: {pair.value}"
                      >{pair.name}: {pair.value}</span>
                    {/each}
                    {#if others.length > 5}
                      <span class="text-slate-600 self-center">+{others.length - 5} more</span>
                    {/if}
                  </div>
                {:else}
                  <span class="text-slate-700">—</span>
                {/if}
              </td>

              <!-- Notes -->
              <td class="px-3 py-2 text-slate-500 max-w-[180px]">
                <span class="truncate block" title={c.notes ?? ''}>
                  {c.notes ?? '—'}
                </span>
              </td>

              <!-- Status -->
              <td class="px-3 py-2 whitespace-nowrap">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium
                             {statusCls(c.status)}">
                  {c.status ?? 'ok'}
                </span>
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

              <!-- System -->
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

              <!-- Type -->
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

        <!-- Totals footer -->
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
