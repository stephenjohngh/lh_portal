<!-- src/lib/apps/building_assets/components/V2ReportsTab.svelte -->
<!-- Report builder for V2 components. Lets the user configure scope + filters,
     then generates a .docx for download.
     Per-floor content (in order): Plan graphic | Full component table | Floor summary table
     Optional separate section: Full summary across all selected floors. -->
<script>
  import { buildingAssetsStore }         from '../stores/buildingAssetsStore.js';
  import { generateReportDocument } from './plan/reportGenerator.js';
  import Button         from '$lib/components/common/Button.svelte';
  import Checkbox       from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay   from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  // ── Store data ────────────────────────────────────────────────────────────────
  $: store          = $buildingAssetsStore;
  $: systems        = store.systems;
  $: types          = store.types;
  $: floors         = store.floors;
  $: components     = store.components;
  $: componentAttrs = store.componentAttrs;
  $: attrDefs       = store.attrDefs;
  $: plans          = store.plans;
  $: facilities     = store.facilities;

  // ── Report section toggles ────────────────────────────────────────────────────
  // Per-floor sections (all appear together for each floor in this order):
  let includePlan              = false;   // plan graphic
  let includeList              = true;    // full component table
  let includeFloorSummary      = true;    // type/status count table for that floor
  let includeNotes             = false;   // latest inspection notes column (per-floor table)
  // Separate final sections:
  let includeFullSummary       = false;   // aggregate pivot across all floors
  let includeFullComponentList = false;   // all-floors combined component table

  $: noneSelected = !includePlan && !includeList && !includeFloorSummary && !includeFullSummary && !includeFullComponentList;

  // ── Scope: floors ─────────────────────────────────────────────────────────────
  // empty set = all floors; floorsCleared = true means user explicitly unchecked all
  let selectedFloorIds  = new Set();
  let floorsCleared     = false;

  // ── Filters ───────────────────────────────────────────────────────────────────
  // empty set = all systems; systemsCleared = true means user explicitly unchecked all
  let selectedSystemIds = new Set();
  let systemsCleared    = false;

  const ALL_STATUSES = ['ok', 'problem', 'failed', 'inactive'];
  let selectedStatuses  = new Set(ALL_STATUSES);

  // ── Preferences: persist report settings across sessions ─────────────────────
  const REPORT_PREF_KEY = 'lh_v2report_prefs';

  // Restore once, after floor + system data has loaded (to validate stored IDs)
  let prefsRestored = false;
  $: if (!prefsRestored && floors.length > 0 && systems.length > 0) {
    try {
      const saved = localStorage.getItem(REPORT_PREF_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        includePlan              = p.includePlan              ?? false;
        includeList              = p.includeList              ?? true;
        includeFloorSummary      = p.includeFloorSummary      ?? true;
        includeNotes             = p.includeNotes             ?? false;
        includeFullSummary       = p.includeFullSummary       ?? false;
        includeFullComponentList = p.includeFullComponentList ?? false;
        floorsCleared       = p.floorsCleared       ?? false;
        systemsCleared      = p.systemsCleared      ?? false;
        const validFloors   = new Set(floors.map(f => f.id));
        const validSystems  = new Set(systems.map(s => s.id));
        selectedFloorIds    = new Set((p.selectedFloorIds  ?? []).filter(id => validFloors.has(id)));
        selectedSystemIds   = new Set((p.selectedSystemIds ?? []).filter(id => validSystems.has(id)));
        const restoredSt    = new Set((p.selectedStatuses  ?? []).filter(s => ALL_STATUSES.includes(s)));
        selectedStatuses    = restoredSt.size > 0 ? restoredSt : new Set(ALL_STATUSES);
      }
    } catch { /* ignore corrupt data */ }
    prefsRestored = true;
  }

  // Auto-save whenever any setting changes (all Set changes use reassignment so Svelte tracks them)
  $: if (prefsRestored) {
    localStorage.setItem(REPORT_PREF_KEY, JSON.stringify({
      includePlan, includeList, includeFloorSummary, includeNotes, includeFullSummary, includeFullComponentList,
      selectedFloorIds:  [...selectedFloorIds],
      floorsCleared,
      selectedSystemIds: [...selectedSystemIds],
      systemsCleared,
      selectedStatuses:  [...selectedStatuses],
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function typeOf(c)  { return types.find(t => t.code === c.type_code); }
  function systemOf(t){ return t ? systems.find(s => s.id === t.building_system_id) : null; }

  // Resolve all non-checkable, visible attr name/value pairs for a component.
  // Merges stored component_attributes with type-level default_value fallback.
  // Rules:
  //   - Values of 'None' or 'No' are suppressed entirely.
  //   - display_type is forwarded so the server can format number attrs differently.
  function resolveAttrs(c) {
    const t = typeOf(c);
    if (!t) return [];
    const defs   = attrDefs[t.id] ?? [];
    const stored = componentAttrs[c.id] ?? [];
    const storedMap = {};
    for (const a of stored) storedMap[a.type_attribute_id] = a.value;
    return defs
      .filter(d => d.visible !== false && !d.checkable)
      .map(d => {
        const raw = storedMap[d.id] ?? d.default_value ?? null;
        if (raw == null || raw === '') return null;
        if (d.display_type === 'checkbox') {
          return raw === 'true' ? { name: d.name, value: 'Yes', display_type: 'checkbox' } : null;
        }
        const value = String(raw);
        if (value === 'None' || value === 'No' || value === 'Unknown') return null;
        return { name: d.name, value, display_type: d.display_type ?? 'text' };
      })
      .filter(Boolean);
  }

  // ── Filtered component set ────────────────────────────────────────────────────
  $: filteredComponents = components.filter(c => {
    if (floorsCleared) return false;
    if (selectedFloorIds.size  > 0 && !selectedFloorIds.has(c.floor_id))  return false;
    if (systemsCleared) return false;
    if (selectedSystemIds.size > 0) {
      const t = typeOf(c);
      if (!t || !selectedSystemIds.has(t.building_system_id)) return false;
    }
    if (!selectedStatuses.has(c.status)) return false;
    return true;
  });

  // Group filtered components by floor, preserving floor level_order
  $: filteredByFloor = (() => {
    const map = {};
    for (const c of filteredComponents) {
      if (!map[c.floor_id]) map[c.floor_id] = [];
      map[c.floor_id].push(c);
    }
    return floors
      .filter(f => map[f.id]?.length > 0)
      .map(f => ({ floor: f, components: map[f.id] }));
  })();

  // Human-readable filter description for the document header
  $: filterSummary = (() => {
    const parts = [];
    if (floorsCleared) {
      parts.push('Floors: none');
    } else if (selectedFloorIds.size > 0) {
      const names = floors.filter(f => selectedFloorIds.has(f.id)).map(f => f.short_name).join(', ');
      parts.push(`Floors: ${names}`);
    }
    if (selectedSystemIds.size > 0) {
      const names = systems.filter(s => selectedSystemIds.has(s.id)).map(s => s.name).join(', ');
      parts.push(`Systems: ${names}`);
    }
    if (selectedStatuses.size < ALL_STATUSES.length) {
      parts.push(`Status: ${[...selectedStatuses].join(', ')}`);
    }
    return parts.join(' · ') || 'All components';
  })();

  // Preview: floor breakdown table
  $: floorBreakdown = filteredByFloor.map(({ floor, components: comps }) => ({
    name:  `${floor.name} (${floor.short_name})`,
    count: comps.length,
  }));

  // ── Toggle helpers ─────────────────────────────────────────────────────────────
  function toggleFloor(id) {
    const s = new Set(selectedFloorIds);
    s.has(id) ? s.delete(id) : s.add(id);
    selectedFloorIds = s;
  }
  function toggleSystem(id) {
    const s = new Set(selectedSystemIds);
    s.has(id) ? s.delete(id) : s.add(id);
    selectedSystemIds = s;
  }
  function toggleStatus(v) {
    const s = new Set(selectedStatuses);
    s.has(v) ? s.delete(v) : s.add(v);
    selectedStatuses = s;
  }

  // ── Quick report presets ──────────────────────────────────────────────────────
  // Each preset applies a set of filter + section options to the general report.
  // The user then reviews the configuration and clicks Generate.
  let configuredPreset = '';   // name of the last applied preset (for feedback)

  function configureFailuresReport() {
    // Status: failed only; all floors; all systems
    selectedStatuses  = new Set(['failed']);
    floorsCleared     = false;
    selectedFloorIds  = new Set();
    systemsCleared    = false;
    selectedSystemIds = new Set();
    // Sections: per-floor component table + floor summary; combined full list; notes on
    includePlan              = false;
    includeList              = true;
    includeFloorSummary      = true;
    includeNotes             = true;
    includeFullComponentList = true;
    includeFullSummary       = false;
    configuredPreset = 'Failed Components';
  }

  $: failedCount = components.filter(c => c.status === 'failed').length;

  // ── Report generation ─────────────────────────────────────────────────────────
  let generating = false;
  let error      = '';

  async function generateReport() {
    if (noneSelected) {
      error = 'Select at least one report section.';
      return;
    }
    if (filteredComponents.length === 0) {
      error = 'No components match the current filters.';
      return;
    }

    generating = true;
    error = '';
    try {
      const building    = facilities[0]?.name ?? 'Lancaster House';
      const generatedAt = new Date().toLocaleDateString('en-GB',
        { day: '2-digit', month: 'short', year: 'numeric' });
      const reportTypes = [
        ...(includePlan              ? ['plan']               : []),
        ...(includeList              ? ['full_list']           : []),
        ...(includeFloorSummary      ? ['floor_summary']       : []),
        ...(includeFullSummary       ? ['full_summary']        : []),
        ...(includeFullComponentList ? ['full_component_list'] : []),
      ];

      await generateReportDocument({
        reportTypes, building, filterSummary, generatedAt,
        includeNotes, includeFullComponentList, includePlan,
        filteredByFloor,
        plans,
        inspections: $buildingAssetsStore.inspections,
        typeOfFn:       typeOf,
        systemOfFn:     systemOf,
        resolveAttrsFn: resolveAttrs,
      });
    } catch (err) {
      error = err.message;
    } finally {
      generating = false;
    }
  }
</script>

<div class="space-y-6">

  <!-- Header -->
  <div>
    <h2 class="text-lg font-semibold text-white mb-1">Component Reports</h2>
    <p class="text-sm text-slate-400">
      Configure the scope and filters below, then generate a Word document for printing.
    </p>
  </div>

  <!-- ── Quick report presets ─────────────────────────────────────────────── -->
  <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
    <h3 class="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wide">Quick Reports</h3>
    <p class="text-xs text-slate-500 mb-3">
      Pre-configured filter presets — click <strong class="text-slate-400">Configure</strong>
      to apply, then use <strong class="text-slate-400">Generate</strong> below.
    </p>

    {#if configuredPreset}
      <p class="text-xs text-green-400 mb-3">✓ "{configuredPreset}" preset applied — review filters below, then Generate.</p>
    {/if}

    <div class="flex flex-wrap gap-3">

      <!-- Failed Components -->
      <div class="quick-card border-red-900/60 bg-red-950/20">
        <div class="quick-card-header">
          <span class="text-red-400 text-lg">✗</span>
          <div>
            <div class="font-semibold text-sm text-red-300">Failed Components</div>
            <div class="text-xs text-slate-500 mt-0.5">
              All failed, all floors · per-floor table + combined list · with notes
            </div>
          </div>
          <span class="ml-auto text-xl font-bold tabular-nums
            {failedCount > 0 ? 'text-red-400' : 'text-slate-600'}">{failedCount}</span>
        </div>
        <Button
          variant="secondary"
          size="small"
          disabled={failedCount === 0}
          on:click={configureFailuresReport}
          class="mt-3"
        >
          Configure
        </Button>
      </div>

    </div>
  </div>

  <!-- ── General report (configurable) ────────────────────────────────────── -->
  <div>
    <h3 class="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wide">General Report</h3>
    <p class="text-xs text-slate-500 mb-3">Configure scope and filters, then generate.</p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

    <!-- ── Left column: config ─────────────────────────────────────────────── -->
    <div class="lg:col-span-2 space-y-5">

      <!-- Report sections -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-slate-300 mb-1 uppercase tracking-wide">Include in Report</h3>
        <p class="text-xs text-slate-500 mb-3">Per-floor sections appear together for each floor, in the order shown.</p>

        <p class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Per Floor</p>
        <div class="flex flex-wrap gap-6 mb-4 pl-1">
          <Checkbox bind:checked={includePlan}         label="🗺 Plan Graphic" />
          <Checkbox bind:checked={includeList}         label="📋 Full Component Table" />
          <Checkbox bind:checked={includeFloorSummary} label="📊 Floor Summary" />
          <Checkbox bind:checked={includeNotes}        label="📝 Inspection Notes" />
        </div>

        {#if includePlan}
          <p class="mb-3 text-xs text-amber-400 pl-1">
            ⚠ Plan images are only included for floors where a plan has been set up in the Plan View tab.
          </p>
        {/if}

        <div class="border-t border-slate-700 pt-3">
          <p class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Separate Final Section</p>
          <div class="pl-1 space-y-2">
            <Checkbox bind:checked={includeFullSummary}       label="📈 Full Summary (all selected floors combined)" />
            <Checkbox bind:checked={includeFullComponentList} label="📋 Full Component List (all selected floors combined)" />
          </div>
        </div>
      </div>

      <!-- Floor scope -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wide">Floor Scope</h3>
          <button class="text-xs text-purple-400 hover:text-purple-300"
            on:click={() => {
              if (!floorsCleared && selectedFloorIds.size === 0) {
                floorsCleared = true;
              } else {
                floorsCleared = false;
                selectedFloorIds = new Set();
              }
            }}>
            {!floorsCleared && selectedFloorIds.size === 0 ? 'Clear All' : 'Choose All'}
          </button>
        </div>
        <div class="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto">
          {#each floors as f (f.id)}
            <label class="flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-slate-700
              {selectedFloorIds.has(f.id) ? 'bg-slate-700' : ''}">
              <input type="checkbox"
                checked={!floorsCleared && (selectedFloorIds.size === 0 || selectedFloorIds.has(f.id))}
                on:change={() => {
                  if (floorsCleared) {
                    // Exit cleared mode: select just this floor
                    floorsCleared = false;
                    selectedFloorIds = new Set([f.id]);
                  } else if (selectedFloorIds.size === 0) {
                    // Switch to explicit mode: select all except this
                    selectedFloorIds = new Set(floors.filter(x => x.id !== f.id).map(x => x.id));
                  } else {
                    toggleFloor(f.id);
                    if (selectedFloorIds.size === floors.length) selectedFloorIds = new Set();
                  }
                }}
                class="accent-purple-500"
              />
              <span class="text-sm text-slate-300 truncate">{f.name}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- System filter -->
      {#if systems.length > 0}
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wide">Systems</h3>
            <button class="text-xs text-purple-400 hover:text-purple-300"
              on:click={() => {
                if (!systemsCleared && selectedSystemIds.size === 0) {
                  systemsCleared = true;
                } else {
                  systemsCleared = false;
                  selectedSystemIds = new Set();
                }
              }}>
              {!systemsCleared && selectedSystemIds.size === 0 ? 'Clear All' : 'Choose All'}
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each systems as sys (sys.id)}
              {@const count = filteredComponents.filter(c => typeOf(c)?.building_system_id === sys.id).length}
              <label class="flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors
                {!systemsCleared && (selectedSystemIds.size === 0 || selectedSystemIds.has(sys.id))
                  ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                  : 'border-slate-600 text-slate-500 hover:border-slate-500'}">
                <input type="checkbox"
                  checked={!systemsCleared && (selectedSystemIds.size === 0 || selectedSystemIds.has(sys.id))}
                  on:change={() => {
                    if (systemsCleared) {
                      systemsCleared = false;
                      selectedSystemIds = new Set([sys.id]);
                    } else if (selectedSystemIds.size === 0) {
                      selectedSystemIds = new Set(systems.filter(x => x.id !== sys.id).map(x => x.id));
                    } else {
                      toggleSystem(sys.id);
                      if (selectedSystemIds.size === systems.length) selectedSystemIds = new Set();
                    }
                  }}
                  class="sr-only"
                />
                <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:#{sys.colour}"></div>
                <span class="text-sm font-medium">{sys.name}</span>
                <span class="text-xs opacity-60">({count})</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Status filter -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Status</h3>
        <div class="flex flex-wrap gap-4">
          {#each ALL_STATUSES as s}
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox"
                checked={selectedStatuses.has(s)}
                on:change={() => toggleStatus(s)}
                class="accent-purple-500"
              />
              <span class="text-sm capitalize
                {s === 'ok'       ? 'text-green-400'  :
                 s === 'problem'  ? 'text-amber-400'  :
                 s === 'failed'   ? 'text-red-400'    : 'text-slate-400'}">
                {s}
              </span>
              <span class="text-xs text-slate-500 tabular-nums">
                ({filteredComponents.filter(c => c.status === s).length})
              </span>
            </label>
          {/each}
        </div>
      </div>

    </div>

    <!-- ── Right column: preview + generate ───────────────────────────────── -->
    <div class="space-y-4">

      <!-- Preview summary -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">Preview</h3>

        <div class="text-3xl font-bold text-white mb-1 tabular-nums">
          {filteredComponents.length}
        </div>
        <div class="text-xs text-slate-400 mb-4">components matched</div>

        {#if floorBreakdown.length > 0}
          <div class="space-y-1 max-h-52 overflow-y-auto">
            {#each floorBreakdown as row}
              <div class="flex justify-between text-xs py-0.5 border-b border-slate-700 last:border-0">
                <span class="text-slate-300">{row.name}</span>
                <span class="text-slate-400 tabular-nums font-medium">{row.count}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-slate-500 italic">No components match the current filters.</p>
        {/if}

        <div class="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-500">
          {filterSummary}
        </div>
      </div>

      <!-- Report sections included -->
      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <h3 class="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wide">Report will include</h3>
        <ul class="space-y-1 text-xs text-slate-400">
          {#if includePlan}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Plan graphic (per floor)</li>
          {/if}
          {#if includeList}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Full component table (per floor)</li>
          {/if}
          {#if includeNotes}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Inspection notes column (latest per component)</li>
          {/if}
          {#if includeFloorSummary}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Floor summary by type (per floor)</li>
          {/if}
          {#if includeFullSummary}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Full summary — all floors combined</li>
          {/if}
          {#if includeFullComponentList}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Full component list — all floors combined</li>
          {/if}
          {#if noneSelected}
            <li class="text-amber-400">⚠ Nothing selected</li>
          {/if}
        </ul>
      </div>

      <!-- Error -->
      {#if error}
        <ErrorDisplay message={error} onDismiss={() => error = ''} />
      {/if}

      <!-- Generate button -->
      <Button
        variant="primary"
        on:click={generateReport}
        disabled={generating || filteredComponents.length === 0 || noneSelected}
      >
        {#if generating}
          <LoadingSpinner size="sm" /> Generating…
        {:else}
          ⬇ Download Report ({filteredComponents.length} components)
        {/if}
      </Button>

    </div>
  </div>
</div>

<style>
  .quick-card {
    flex: 1; min-width: 260px; max-width: 420px;
    border: 1px solid; border-radius: 8px;
    padding: 0.875rem 1rem;
    display: flex; flex-direction: column;
  }
  .quick-card-header {
    display: flex; align-items: flex-start; gap: 0.75rem;
  }
</style>
