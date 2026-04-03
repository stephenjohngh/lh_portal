<!-- src/lib/apps/v2proto/components/V2ReportsTab.svelte -->
<!-- Report builder for V2 components. Lets the user configure scope + filters,
     then generates a .docx for download.
     Per-floor content (in order): Plan graphic | Full component table | Floor summary table
     Optional separate section: Full summary across all selected floors. -->
<script>
  import { v2protoStore } from '../stores/v2protoStore.js';
  import Button        from '$lib/components/common/Button.svelte';
  import Checkbox      from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  // ── Store data ────────────────────────────────────────────────────────────────
  $: store          = $v2protoStore;
  $: systems        = store.systems;
  $: types          = store.types;
  $: floors         = store.floors;
  $: components     = store.components;
  $: componentAttrs = store.componentAttrs;
  $: attrDefs       = store.attrDefs;
  $: plans          = store.plans;
  $: facilities     = store.facilities;

  // Flat map: type_attribute_id → attribute name (for resolving attr labels)
  $: attrIdToName = (() => {
    const map = {};
    for (const defs of Object.values(attrDefs)) {
      for (const d of defs) map[d.id] = d.name;
    }
    return map;
  })();

  // ── Report section toggles ────────────────────────────────────────────────────
  // Per-floor sections (all appear together for each floor in this order):
  let includePlan         = false;   // plan graphic
  let includeList         = true;    // full component table
  let includeFloorSummary = true;    // type/status count table for that floor
  // Separate final section:
  let includeFullSummary  = false;   // aggregate pivot across all floors

  $: noneSelected = !includePlan && !includeList && !includeFloorSummary && !includeFullSummary;

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
        includePlan         = p.includePlan         ?? false;
        includeList         = p.includeList         ?? true;
        includeFloorSummary = p.includeFloorSummary ?? true;
        includeFullSummary  = p.includeFullSummary  ?? false;
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
      includePlan, includeList, includeFloorSummary, includeFullSummary,
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

  // ── Plan image annotation ──────────────────────────────────────────────────────
  // Draws component markers on a canvas copy of the floor plan image.
  // Returns { base64, width, height } or null if no plan available.
  async function drawFloorPlan(floor, floorComps) {
    const plan = plans.find(p => p.floor_id === floor.id);
    if (!plan?.image_url) return null;

    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      const img    = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        canvas.width  = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        for (const c of floorComps) {
          if (c.x_position == null || c.y_position == null || c.plan_id !== plan.id) continue;
          const t      = typeOf(c);
          const colour = t?.colour ? `#${t.colour}` : '#8b5cf6';
          const x      = c.x_position * canvas.width;
          const y      = c.y_position * canvas.height;

          // Filled circle with white border
          ctx.shadowColor = 'rgba(0,0,0,0.4)';
          ctx.shadowBlur  = 4;
          ctx.fillStyle   = colour;
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = 1.5;
          ctx.stroke();

          // Type initial inside circle
          ctx.fillStyle    = '#ffffff';
          ctx.font         = 'bold 8px Arial';
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t?.initial ?? '?', x, y);

          // Asset ID below circle — white text with black outline for contrast
          const assetId = c.asset_id ?? '';
          if (assetId) {
            ctx.font          = 'bold 13px Arial';
            ctx.textAlign     = 'center';
            ctx.textBaseline  = 'top';
            ctx.lineWidth     = 2.5;
            ctx.strokeStyle   = 'rgba(0,0,0,0.85)';
            ctx.strokeText(assetId, x, y + 13);
            ctx.fillStyle     = '#ffffff';
            ctx.fillText(assetId, x, y + 13);
          }
        }

        resolve({
          base64: canvas.toDataURL('image/png').replace('data:image/png;base64,', ''),
          width:  canvas.width,
          height: canvas.height,
        });
      };

      img.onerror = () => resolve(null);
      img.src = plan.image_url;
    });
  }

  // ── Report generation ──────────────────────────────────────────────────────────
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
      const now         = new Date();
      const generatedAt = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const reportTypes = [
        ...(includePlan         ? ['plan']          : []),
        ...(includeList         ? ['full_list']      : []),
        ...(includeFloorSummary ? ['floor_summary']  : []),
        ...(includeFullSummary  ? ['full_summary']   : []),
      ];

      // Build per-floor payload (including optional annotated plan images)
      const floorsPayload = await Promise.all(
        filteredByFloor.map(async ({ floor, components: comps }) => {
          const imageData = includePlan ? await drawFloorPlan(floor, comps) : null;

          // Sort System → Type → Asset ID before sending to server
          const sortedComps = [...comps].sort((a, b) => {
            const ta = typeOf(a), tb = typeOf(b);
            const sa = systemOf(ta)?.name ?? '';
            const sb = systemOf(tb)?.name ?? '';
            return sa.localeCompare(sb) ||
                   (ta?.name ?? '').localeCompare(tb?.name ?? '') ||
                   (a.asset_id ?? '').localeCompare(b.asset_id ?? '', undefined, { numeric: true, sensitivity: 'base' });
          });

          const resolvedComponents = sortedComps.map(c => {
            const t   = typeOf(c);
            const sys = systemOf(t);
            const attrs = (componentAttrs[c.id] ?? [])
              .map(a => ({ name: attrIdToName[a.type_attribute_id] ?? '', value: a.value }))
              .filter(a => a.name && a.value != null && a.value !== '');
            return {
              id:               c.id,
              asset_id:         c.asset_id,
              label:            c.label,
              type_code:        c.type_code,
              type_name:        t?.name    ?? c.type_code,
              type_initial:     t?.initial ?? '?',
              type_colour:      t?.colour  ?? '888888',
              system_name:      sys?.name  ?? '',
              status:           c.status,
              primary_attribute: c.primary_attribute,
              attributes:       attrs,
            };
          });

          return {
            floor: {
              id:          floor.id,
              short_name:  floor.short_name,
              name:        floor.name,
              level_order: floor.level_order,
            },
            components:  resolvedComponents,
            imageBase64: imageData?.base64  ?? null,
            imageWidth:  imageData?.width   ?? null,
            imageHeight: imageData?.height  ?? null,
          };
        })
      );

      const res = await fetch('/api/v2/generate-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          options: { reportTypes, building, filterSummary, generatedAt },
          floors:  floorsPayload,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `components-${now.toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);

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
        </div>

        {#if includePlan}
          <p class="mb-3 text-xs text-amber-400 pl-1">
            ⚠ Plan images are only included for floors where a plan has been set up in the Plan View tab.
          </p>
        {/if}

        <div class="border-t border-slate-700 pt-3">
          <p class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Separate Final Section</p>
          <div class="pl-1">
            <Checkbox bind:checked={includeFullSummary} label="📈 Full Summary (all selected floors combined)" />
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
          {#if includeFloorSummary}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Floor summary by type (per floor)</li>
          {/if}
          {#if includeFullSummary}
            <li class="flex items-center gap-2"><span class="text-green-400">✓</span> Full summary — all floors combined</li>
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
