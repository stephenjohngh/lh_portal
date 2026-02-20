<!-- src/lib/apps/plans/components/BuildingReport.svelte -->
<!-- Building-level report: covers all floors for a building, filtered by element type -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }   from '$lib/utils/logger';
  import Modal           from '$lib/components/common/Modal.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import Icon            from '$lib/components/icons/Icon.svelte';
  import { plansStore }  from '../stores/plansStore';
  import {
    ELEMENT_SUBTYPES,
    FLOOR_LEVELS,
    getFloorLevelLabel
  } from '$lib/utils/planConstants';

  const logger   = getLogger('BuildingReport');
  const dispatch = createEventDispatcher();

  // All plans for this building, already sorted by floor level (guaranteed by plansStore sort)
  export let building;   // string — building name
  export let plans;      // Plan[] — all plans for this building, sorted L→U→G→1→2…

  // ── Filter state ────────────────────────────────────────────────────────────

  // Element type: only doors and lights are reportable
  let elementType = 'communal_door'; // 'communal_door' | 'apartment_door' | 'light'

  // Shared filter
  let filterFailed    = false;

  // Light-only filters
  let filterEmergency = false;
  let filterSubtype   = '';   // '' = All, or a specific subtype string

  // Door-only filters
  // (doors share subtype filter; no emergency flag)

  // ── Derived ─────────────────────────────────────────────────────────────────
  $: isLight = elementType === 'light';
  $: isDoor  = elementType === 'communal_door' || elementType === 'apartment_door';

  $: subtypeOptions = ELEMENT_SUBTYPES[elementType] ?? [];

  // Reset subtype when type changes
  $: if (elementType) { filterSubtype = ''; filterEmergency = false; filterFailed = false; }

  // Preview: count of matching elements across all floors using cached store elements
  $: storeElements = $plansStore.elements;
  $: previewCounts = plans.map(plan => {
    const els = storeElements[plan.id] ?? [];
    const matched = els.filter(el => matchesFilters(el));
    return { plan, count: matched.length, total: els.filter(e => e.element_type === elementType).length };
  });
  $: totalMatched = previewCounts.reduce((s, p) => s + p.count, 0);
  $: floorCount   = previewCounts.filter(p => p.count > 0).length;

  function matchesFilters(el) {
    if (el.element_type !== elementType)     return false;
    if (filterFailed    && el.status !== 'failed') return false;
    if (isLight && filterEmergency && !el.emergency) return false;
    if (filterSubtype   && el.subtype !== filterSubtype) return false;
    return true;
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  let loading    = false;
  let loadError  = null;

  // Check which plans have elements loaded; load any that are missing
  $: missingPlanIds = plans
    .filter(p => storeElements[p.id] === undefined)
    .map(p => p.id);

  // Auto-load missing elements when the modal opens
  import { onMount } from 'svelte';
  onMount(async () => {
    if (missingPlanIds.length > 0) {
      loading   = true;
      loadError = null;
      try {
        await Promise.all(missingPlanIds.map(id => plansStore.loadElements(id)));
      } catch (err) {
        loadError = err.message;
      } finally {
        loading = false;
      }
    }
  });

  // ── Report generation ────────────────────────────────────────────────────────
  let generating   = false;
  let generateError = null;

  async function handleGenerate() {
    generating    = true;
    generateError = null;
    logger('Generating building report:', { building, elementType, filterFailed, filterEmergency, filterSubtype });

    try {
      // Build elementsByPlan: for each plan, the FILTERED elements sorted floor→id
      const elementsByPlan = {};
      for (const plan of plans) {
        const els = (storeElements[plan.id] ?? []).filter(matchesFilters);
        // Sort by asset_id numeric-aware within each floor
        elementsByPlan[plan.id] = els.slice().sort((a, b) =>
          (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true })
        );
      }

      const options = {
        elementType,
        filterFailed,
        filterEmergency: isLight ? filterEmergency : false,
        filterSubtype,
        // human-readable filter description for the doc header
        filterLabel: buildFilterLabel()
      };

      const response = await fetch('/api/plans/generate-building-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ building, plans, elementsByPlan, options })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const blob     = await response.blob();
      const url      = URL.createObjectURL(blob);
      const filename = buildFilename();
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = filename;
      a.click();
      URL.revokeObjectURL(url);

      logger('✅ Building report downloaded:', filename);
    } catch (err) {
      logger('❌ Report generation failed:', err.message);
      generateError = err.message;
    } finally {
      generating = false;
    }
  }

  function buildFilterLabel() {
    const parts = [];
    if (filterFailed)    parts.push('Failed elements only');
    if (isLight && filterEmergency) parts.push('Emergency only');
    if (filterSubtype)   parts.push(`Subtype: ${filterSubtype}`);
    return parts.length ? parts.join(', ') : 'All';
  }

  function buildFilename() {
    const typeSlug  = elementType.replace('_', '-');
    const filterSlug = filterSubtype ? `-${filterSubtype.replace(/\s+/g, '-')}` : '';
    const failedSlug = filterFailed  ? '-failed' : '';
    const emergSlug  = filterEmergency ? '-emergency' : '';
    const safeBuilding = building.replace(/[^a-z0-9]/gi, '_');
    return `${safeBuilding}_${typeSlug}${filterSlug}${failedSlug}${emergSlug}_report.docx`;
  }

  // ── Type labels ──────────────────────────────────────────────────────────────
  const TYPE_OPTIONS = [
    { value: 'communal_door',  label: 'Communal Doors',  icon: '🚪' },
    { value: 'apartment_door', label: 'Apartment Doors', icon: '🚪' },
    { value: 'light',          label: 'Lighting',        icon: '💡' }
  ];

  function floorLabel(fl) {
    return getFloorLevelLabel(String(fl));
  }
</script>

<Modal show={true} size="large" on:close={() => dispatch('close')}>

  <h3 slot="header" class="text-xl font-bold flex items-center gap-2">
    <Icon name="chart" size={6} className="text-blue-400" />
    Building Report — {building}
  </h3>

  <div class="section-spacing">

    <!-- ── Loading / error ───────────────────────────────────────────────── -->
    {#if loading}
      <div class="card-info flex items-center gap-3">
        <Icon name="loading" size={5} className="animate-spin text-blue-400" />
        <span class="text-sm">Loading element data for all floors…</span>
      </div>
    {/if}

    {#if loadError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">
        ⚠ Could not load element data: {loadError}
      </div>
    {/if}

    <!-- ── Element type ───────────────────────────────────────────────────── -->
    <div>
      <p class="text-sm font-medium mb-3">Element Type</p>
      <div class="flex gap-2 flex-wrap">
        {#each TYPE_OPTIONS as opt}
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors"
            class:border-blue-500={elementType === opt.value}
            class:bg-blue-500-10={elementType === opt.value}
            class:text-blue-300={elementType === opt.value}
            class:border-slate-600={elementType !== opt.value}
            class:text-gray-400={elementType !== opt.value}
            style={elementType === opt.value ? 'background:rgba(59,130,246,0.1)' : ''}
            on:click={() => elementType = opt.value}
          >
            <span>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- ── Filters ────────────────────────────────────────────────────────── -->
    <div>
      <p class="text-sm font-medium mb-3">Filters</p>
      <div class="bg-slate-700/40 rounded-lg p-4 space-y-3">

        <!-- Failed filter (all types) -->
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" class="checkbox" bind:checked={filterFailed} />
          <span class="text-sm text-gray-300">Failed elements only</span>
        </label>

        <!-- Emergency (light only) -->
        {#if isLight}
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" class="checkbox" bind:checked={filterEmergency} />
            <span class="text-sm text-gray-300">Emergency fittings only</span>
          </label>
        {/if}

        <!-- Subtype filter -->
        {#if subtypeOptions.length > 0}
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-300 flex-shrink-0">Subtype</span>
            <select class="select text-sm flex-1" bind:value={filterSubtype}>
              <option value="">All subtypes</option>
              {#each subtypeOptions as sub}
                <option value={sub}>{sub}</option>
              {/each}
            </select>
          </div>
        {/if}

      </div>
    </div>

    <!-- ── Preview counts ─────────────────────────────────────────────────── -->
    {#if !loading}
      <div>
        <p class="text-sm font-medium mb-3">
          Preview
          <span class="text-gray-400 font-normal ml-2">
            {totalMatched} element{totalMatched !== 1 ? 's' : ''} across {floorCount} floor{floorCount !== 1 ? 's' : ''}
          </span>
        </p>
        <div class="bg-slate-700/40 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-600">
                <th class="text-left px-4 py-2 text-gray-400 font-medium">Floor</th>
                <th class="text-right px-4 py-2 text-gray-400 font-medium">Matching</th>
                <th class="text-right px-4 py-2 text-gray-400 font-medium">Total on floor</th>
              </tr>
            </thead>
            <tbody>
              {#each previewCounts as { plan, count, total }}
                <tr class="border-b border-slate-700/50 last:border-0"
                    class:opacity-40={count === 0}>
                  <td class="px-4 py-2 text-gray-300">{floorLabel(plan.floor_level)}</td>
                  <td class="px-4 py-2 text-right font-medium"
                      class:text-blue-300={count > 0}
                      class:text-gray-500={count === 0}>
                    {count}
                  </td>
                  <td class="px-4 py-2 text-right text-gray-500">{total}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if totalMatched === 0}
        <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
          ⚠ No elements match the current filters. Adjust the filters above before generating.
        </div>
      {/if}
    {/if}

    <!-- ── Generate error ─────────────────────────────────────────────────── -->
    {#if generateError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">
        ⚠ Report generation failed: {generateError}
      </div>
    {/if}

  </div>

  <!-- ── Footer ────────────────────────────────────────────────────────────── -->
  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={() => dispatch('close')} disabled={generating}>
      Cancel
    </Button>
    <Button
      variant="primary"
      size="large"
      icon="download"
      on:click={handleGenerate}
      disabled={generating || loading || totalMatched === 0}
    >
      {generating ? 'Generating…' : 'Generate Report'}
    </Button>
  </div>

</Modal>
