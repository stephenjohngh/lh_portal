<!-- src/lib/apps/building_assets/components/SpacesTab.svelte -->
<!-- Building-wide Spaces register: one row per space with reference, kind,
     usage, floor, area, component count and a status breakdown. Read-only
     report view (all authenticated users); filterable + CSV export. The
     space-grain counterpart to the Components tab. Rows are derived at read
     time from the store (membership + area), reusing buildSpacesRegister() +
     spaceReport.js — the same helpers the sidebar used to expose as CSV. -->
<script>
  import { buildingAssetsStore } from '../stores/buildingAssetsStore.js';
  import { buildSpacesRegisterRows, spacesRegisterCsvRows } from '../utils/spaceReport.js';
  import { KIND_LABEL } from '$lib/utils/spaceRef.js';
  import { downloadCsvRows } from '$lib/utils/download.js';
  import { permissions } from '$lib/stores/permissions';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  $: store = $buildingAssetsStore;

  // Register rows — derived at read time via the PURE builder (not the store's
  // buildSpacesRegister(), whose update() would loop when called reactively).
  $: registerRows = buildSpacesRegisterRows(store);

  // -- Filters -------------------------------------------------------
  let search      = '';
  let kindFilter  = 'all';   // 'all' | 'space' | 'slot'
  let floorFilter = 'all';   // 'all' | floor short_name
  let usageFilter = 'all';   // 'all' | usage value

  // Floor options present in the register (short_name), floor order preserved.
  $: floorOptions = store.floors
    .map(f => f.short_name)
    .filter(sn => registerRows.some(r => r.floor === sn));
  // Usage options: the configured list, restricted to usages actually present.
  $: usageFilterOptions = (store.spaceUsages?.length
      ? store.spaceUsages.map(u => u.value)
      : [...new Set(registerRows.map(r => r.usage).filter(Boolean))])
    .filter(v => registerRows.some(r => r.usage === v));

  $: filteredRows = registerRows.filter(r => {
    if (kindFilter !== 'all'  && r.kind  !== kindFilter)  return false;
    if (floorFilter !== 'all' && r.floor !== floorFilter) return false;
    if (usageFilter !== 'all' && (r.usage ?? '') !== usageFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!`${r.reference} ${r.name} ${r.usage}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Column totals for the footer.
  $: totals = filteredRows.reduce(
    (a, r) => ({
      total:    a.total    + (r.total    ?? 0),
      ok:       a.ok       + (r.ok       ?? 0),
      problem:  a.problem  + (r.problem  ?? 0),
      failed:   a.failed   + (r.failed   ?? 0),
      inactive: a.inactive + (r.inactive ?? 0),
    }),
    { total: 0, ok: 0, problem: 0, failed: 0, inactive: 0 },
  );

  function exportCsv() {
    downloadCsvRows(`spaces-register-${new Date().toISOString().slice(0, 10)}.csv`,
      spacesRegisterCsvRows(filteredRows));
  }

  // -- Delete a space (admin only, confirmed) ------------------------
  let errorMsg      = '';
  let pendingDelete = null;   // register row awaiting confirmation
  let deletingId    = null;

  function requestDelete(row) { pendingDelete = row; }
  async function confirmDelete() {
    if (!pendingDelete?.id) { pendingDelete = null; return; }
    const id = pendingDelete.id;
    deletingId = id;
    try {
      await buildingAssetsStore.deleteSpace(id);
    } catch (e) {
      errorMsg = e.message;
    } finally {
      deletingId = null; pendingDelete = null;
    }
  }

  const kindLabel = k => KIND_LABEL[k] ?? k ?? '';
  const inp = 'bg-slate-700 border border-slate-600 rounded text-sm text-white px-2 py-1.5 focus:outline-none focus:border-purple-500';
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700">

  <!-- Header -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700 flex-wrap">
    <p class="font-semibold text-white text-sm shrink-0">Spaces register</p>
    <span class="text-xs text-slate-500 shrink-0">
      {filteredRows.length} space{filteredRows.length !== 1 ? 's' : ''}
    </span>
    <button
      on:click={exportCsv}
      disabled={filteredRows.length === 0}
      class="ml-auto text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600
             text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed
             transition-colors shrink-0"
    >⬇ CSV</button>
  </div>

  <!-- Filters -->
  <div class="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 bg-slate-800/40 flex-wrap">
    <div class="relative">
      <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm
                   select-none pointer-events-none">🔍</span>
      <input
        type="search"
        placeholder="reference / name / usage…"
        bind:value={search}
        class="{inp} pl-8 w-56"
      />
    </div>

    <select bind:value={kindFilter} class={inp} aria-label="Filter by kind">
      <option value="all">All kinds</option>
      <option value="space">Space</option>
      <option value="slot">Slot</option>
    </select>

    <select bind:value={floorFilter} class={inp} aria-label="Filter by floor">
      <option value="all">All floors</option>
      {#each floorOptions as sn}
        <option value={sn}>{sn}</option>
      {/each}
    </select>

    {#if usageFilterOptions.length > 0}
      <select bind:value={usageFilter} class={inp} aria-label="Filter by usage">
        <option value="all">All usages</option>
        {#each usageFilterOptions as u}
          <option value={u}>{u}</option>
        {/each}
      </select>
    {/if}
  </div>

  {#if errorMsg}
    <p class="mx-4 mt-3 text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-2 py-1.5">{errorMsg}</p>
  {/if}

  <!-- Table -->
  {#if registerRows.length === 0}
    <p class="px-4 py-8 text-sm text-slate-600 italic text-center">
      No spaces have been drawn yet. Add spaces in <strong class="text-slate-400">Plan View</strong>.
    </p>
  {:else if filteredRows.length === 0}
    <p class="px-4 py-8 text-sm text-slate-600 italic text-center">
      No spaces match the current filters.
    </p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-xs border-collapse">
        <thead>
          <tr class="border-b border-slate-700 text-left sticky top-0 bg-slate-800">
            <th class="px-3 py-2 text-slate-300 font-semibold uppercase tracking-wide">Reference</th>
            <th class="px-3 py-2 text-slate-300 font-semibold uppercase tracking-wide">Name</th>
            <th class="px-3 py-2 text-slate-300 font-semibold uppercase tracking-wide">Kind</th>
            <th class="px-3 py-2 text-slate-300 font-semibold uppercase tracking-wide">Usage</th>
            <th class="px-3 py-2 text-slate-300 font-semibold uppercase tracking-wide">Floor</th>
            <th class="px-3 py-2 text-right text-slate-300 font-semibold uppercase tracking-wide">Area m²</th>
            <th class="px-3 py-2 text-right text-slate-300 font-semibold uppercase tracking-wide">Cmp</th>
            <th class="px-3 py-2 text-right text-green-600 font-medium uppercase tracking-wide">OK</th>
            <th class="px-3 py-2 text-right text-amber-600 font-medium uppercase tracking-wide">Problem</th>
            <th class="px-3 py-2 text-right text-red-600 font-medium uppercase tracking-wide">Failed</th>
            <th class="px-3 py-2 text-right text-slate-600 font-medium uppercase tracking-wide">Inactive</th>
            {#if $permissions.isAdmin}<th class="px-3 py-2 w-16"></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each filteredRows as r (r.reference)}
            <tr class="border-b border-slate-700/40 hover:bg-slate-700/20 transition-colors">
              <td class="px-3 py-2 font-mono text-teal-400/90 whitespace-nowrap">{r.reference}</td>
              <td class="px-3 py-2 text-slate-300">{r.name || '—'}</td>
              <td class="px-3 py-2 text-slate-400">{kindLabel(r.kind)}</td>
              <td class="px-3 py-2 text-slate-400">{r.usage || '—'}</td>
              <td class="px-3 py-2 text-slate-400 whitespace-nowrap">{r.floor || '—'}</td>
              <td class="px-3 py-2 text-right tabular-nums text-slate-300">
                {r.area_m2 != null ? r.area_m2.toFixed(1) : '—'}
              </td>
              <td class="px-3 py-2 text-right font-semibold text-white">{r.total}</td>
              <td class="px-3 py-2 text-right {r.ok       > 0 ? 'text-green-400' : 'text-slate-800'}">{r.ok       || '—'}</td>
              <td class="px-3 py-2 text-right {r.problem  > 0 ? 'text-amber-400' : 'text-slate-800'}">{r.problem  || '—'}</td>
              <td class="px-3 py-2 text-right {r.failed   > 0 ? 'text-red-400'   : 'text-slate-800'}">{r.failed   || '—'}</td>
              <td class="px-3 py-2 text-right {r.inactive > 0 ? 'text-slate-400' : 'text-slate-800'}">{r.inactive || '—'}</td>
              {#if $permissions.isAdmin}
                <td class="px-3 py-2 text-right whitespace-nowrap">
                  <button
                    on:click={() => requestDelete(r)}
                    class="px-2 py-0.5 rounded bg-red-900/40 hover:bg-red-800/50
                           text-red-400 border border-red-800/40 transition-colors text-[11px]"
                    title="Delete space (admin)"
                  >🗑</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-slate-600">
            <td class="px-3 py-2 text-slate-500 font-semibold" colspan="6">Total</td>
            <td class="px-3 py-2 text-right font-bold text-white">{totals.total}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.ok       > 0 ? 'text-green-400' : 'text-slate-700'}">{totals.ok       || '—'}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.problem  > 0 ? 'text-amber-400' : 'text-slate-700'}">{totals.problem  || '—'}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.failed   > 0 ? 'text-red-400'   : 'text-slate-700'}">{totals.failed   || '—'}</td>
            <td class="px-3 py-2 text-right font-semibold {totals.inactive > 0 ? 'text-slate-400' : 'text-slate-700'}">{totals.inactive || '—'}</td>
            {#if $permissions.isAdmin}<td></td>{/if}
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}

</div>

<ConfirmDialog
  show={!!pendingDelete}
  title="Delete space"
  message={pendingDelete ? `Delete space ${pendingDelete.reference}${pendingDelete.name ? ` (${pendingDelete.name})` : ''}? This removes the outline and its overrides. Components are not deleted.` : ''}
  confirmText="Delete"
  danger={true}
  processing={!!deletingId}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
