<!-- src/lib/apps/plans/components/reports/PlansReport.svelte -->
<!--
  Unified Plan Report — replaces both PlansReport and BuildingReport.

  Modes (reportMode):
    'plan'     — one page per floor, optional annotated image + element list
                 calls /api/plans/generate-report
    'building' — element-list only (no images), elements sorted by asset_id
                 calls /api/plans/generate-building-report

  Both modes share:
    • Floor scope selector (All / individual floor)
    • Full ElementTypeFilter with all sub-filters
    • Status filter
    • Per-floor preview table with Matching / Total columns
    • Generate button disabled when no matches
-->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }     from '$lib/utils/logger';
  import Modal             from '$lib/components/common/Modal.svelte';
  import Button            from '$lib/components/common/Button.svelte';
  import Icon              from '$lib/components/icons/Icon.svelte';
  import ElementTypeFilter from '../ElementTypeFilter.svelte';
  import { plansStore }    from '../../stores/plansStore';
  import {
    ELEMENT_TYPE_OPTIONS, ELEMENT_STATUS_OPTIONS,
    MARKER_RADIUS, getElementDisplayName, getElementTypeConfig,
    getFloorLevelLabel
  } from '$lib/utils/planConstants';
  import { applyElementFilters } from '$lib/apps/plans/utils/filterHelpers';
  import { downloadResponse }    from '$lib/utils/download';

  const logger   = getLogger('PlansReport');
  const dispatch = createEventDispatcher();

  export let plans;     // Plan[] — all plans sorted by floor
  export let building = plans[0]?.building ?? 'Building';

  // ── Report mode ───────────────────────────────────────────────────────────
  let reportMode = 'plan';  // 'plan' | 'building'

  // ── Floor scope ───────────────────────────────────────────────────────────
  let floorScope = 'all';
  $: activePlans = floorScope === 'all' ? plans : plans.filter(p => p.id === floorScope);

  // ── Load all floors' elements on mount ───────────────────────────────────
  $: storeElements = $plansStore.elements;
  let loading   = false;
  let loadError = null;

  onMount(async () => {
    const missing = plans.filter(p => storeElements[p.id] === undefined).map(p => p.id);
    if (!missing.length) return;
    loading = true; loadError = null;
    try   { await Promise.all(missing.map(id => plansStore.loadElements(id))); }
    catch (err) { loadError = err.message; }
    finally     { loading = false; }
  });

  // ── Plan-mode options ─────────────────────────────────────────────────────
  let options = { includeImage: true, includeElementList: true };

  // ── Filters ───────────────────────────────────────────────────────────────
  let selectedStatuses = [];
  let typeFilters      = {
    types: [], lightFilters: {}, communalFilters: {}, fireFilters: {}, otherFilters: {}
  };

  function toggleStatus(s) {
    selectedStatuses = selectedStatuses.includes(s)
      ? selectedStatuses.filter(x => x !== s)
      : [...selectedStatuses, s];
  }
  function handleTypeChange(e) { typeFilters = e.detail; }

  // ── Per-floor preview — reactive to filters + scope ───────────────────────
  $: previewRows = [selectedStatuses, typeFilters] && activePlans.map(plan => {
    const all      = storeElements[plan.id] ?? [];
    const filtered = applyElementFilters(all, { statuses: selectedStatuses, ...typeFilters });
    return { plan, count: filtered.length, total: all.length };
  });

  $: totalMatched   = previewRows.reduce((n, r) => n + r.count, 0);
  $: floorsIncluded = previewRows.filter(r => r.count > 0).length;
  $: floorsSkipped  = activePlans.length - floorsIncluded;

  // elementCounts for type-filter badges — aggregate across all plans in scope
  $: elementCounts = ELEMENT_TYPE_OPTIONS.reduce((acc, t) => {
    acc[t.value] = activePlans.reduce(
      (n, p) => n + (storeElements[p.id] ?? []).filter(e => e.element_type === t.value).length, 0
    );
    return acc;
  }, {});

  // ── Annotated image builder (plan mode only) ──────────────────────────────
  const MARKER_SHAPE = {
    communal_door:  'square',
    apartment_door: 'square_inner',
    fire_control:   'square_inner',
    light:          'circle',
    other:          'circle'
  };

  async function buildAnnotatedImage(plan, els) {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload  = () => res(i);
      i.onerror = () => rej(new Error('Image load failed'));
      i.src = plan.image_url;
    });

    const W = plan.image_width  || img.naturalWidth  || 800;
    const H = plan.image_height || img.naturalHeight || 600;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);

    const R = MARKER_RADIUS;
    for (const el of els) {
      const cx    = el.x_position * W;
      const cy    = el.y_position * H;
      const conf  = getElementTypeConfig(el.element_type);
      const color = conf?.color ?? '#888888';
      const shape = MARKER_SHAPE[el.element_type] ?? 'circle';

      ctx.globalAlpha = el.status === 'active' ? 1 : 0.5;
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.fillStyle = color;

      if (shape === 'circle') {
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.roundRect(cx - R, cy - R, R * 2, R * 2, 3); ctx.fill(); ctx.stroke();
        if (shape === 'square_inner') {
          const ir = R * 0.45;
          ctx.fillStyle = 'white';
          ctx.beginPath(); ctx.roundRect(cx - ir, cy - ir, ir * 2, ir * 2, 1); ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      const lbl = el.asset_id || '?';
      ctx.font = `bold ${R * 0.85 + 6}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.strokeStyle = 'white'; ctx.lineWidth = 3;
      ctx.strokeText(lbl, cx, cy + R + 2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillText(lbl, cx, cy + R + 2);
    }

    ctx.globalAlpha = 1;
    return c.toDataURL('image/png').split(',')[1];
  }

  // ── Filter summary string (embedded in the generated doc) ─────────────────
  function buildFilterSummary() {
    const parts = [];
    if (typeFilters.types?.length > 0)
      parts.push(`Types: ${typeFilters.types.map(t => ELEMENT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t).join(', ')}`);
    const lf = typeFilters.lightFilters ?? {};
    if (lf.subtypes?.length > 0) parts.push(`Light subtypes: ${lf.subtypes.join(', ')}`);
    if (lf.battery?.length  > 0) parts.push(`Battery: ${lf.battery.join(', ')}`);
    if (lf.emergency)             parts.push('Emergency lights only');
    if (lf.movementSensor)        parts.push('Movement sensor only');
    if (lf.lightSensor)           parts.push('Light sensor only');
    const cf = typeFilters.communalFilters ?? {};
    if (cf.subtypes?.length > 0) parts.push(`Door subtypes: ${cf.subtypes.join(', ')}`);
    if (cf.security?.length > 0) parts.push(`Security: ${cf.security.join(', ')}`);
    if (cf.retained)              parts.push('Retained doors only');
    const ff = typeFilters.fireFilters ?? {};
    if (ff.subtypes?.length > 0) parts.push(`Fire subtypes: ${ff.subtypes.join(', ')}`);
    const of_ = typeFilters.otherFilters ?? {};
    if (of_.subtypes?.length > 0) parts.push(`Other subtypes: ${of_.subtypes.join(', ')}`);
    if (selectedStatuses.length > 0)
      parts.push(`Status: ${selectedStatuses.map(s => ELEMENT_STATUS_OPTIONS.find(o => o.value === s)?.label ?? s).join(', ')}`);
    return parts.length ? parts.join(' · ') : null;
  }

  // ── Generation ────────────────────────────────────────────────────────────
  let generating  = false;
  let genProgress = '';
  let genError    = null;

  async function generateReport() {
    generating = true; genError = null; genProgress = '';
    try {
      if (reportMode === 'plan') {
        await generatePlanReport();
      } else {
        await generateBuildingReport();
      }
      dispatch('close');
    } catch (err) {
      logger('❌ Report failed:', err.message);
      genError = err.message;
    } finally {
      generating = false; genProgress = '';
    }
  }

  async function generatePlanReport() {
    const floors = [];
    for (const plan of activePlans) {
      const els = applyElementFilters(
        storeElements[plan.id] ?? [],
        { statuses: selectedStatuses, ...typeFilters }
      );
      if (els.length === 0) continue;

      let imageBase64 = null;
      if (options.includeImage && plan.image_url) {
        genProgress = `Building image for floor ${plan.floor_level}…`;
        try { imageBase64 = await buildAnnotatedImage(plan, els); }
        catch (e) { logger('⚠ Image failed floor', plan.floor_level, e.message); }
      }

      floors.push({ plan, elements: els, imageBase64 });
    }

    if (!floors.length) { genError = 'No floors have elements matching the filters.'; return; }

    genProgress = 'Generating document…';

    const response = await fetch('/api/plans/generate-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floors,
        options: { ...options, groupByType: true, filterSummary: buildFilterSummary(), building }
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const slug     = floorScope === 'all' ? 'AllFloors' : `Floor${activePlans[0]?.floor_level}`;
    const filename = `${building}_${slug}_PlanReport.docx`;
    await downloadResponse(response, filename);
  }

  async function generateBuildingReport() {
    genProgress = 'Preparing elements…';
    const elementsByPlan = {};
    for (const plan of activePlans) {
      elementsByPlan[plan.id] = applyElementFilters(
        storeElements[plan.id] ?? [],
        { statuses: selectedStatuses, ...typeFilters }
      ).sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }));
    }

    genProgress = 'Generating document…';

    const response = await fetch('/api/plans/generate-building-report', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        building,
        plans: activePlans,
        elementsByPlan,
        options: {
          filterSummary: buildFilterSummary()
        }
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const slug     = floorScope === 'all' ? 'AllFloors' : `Floor${activePlans[0]?.floor_level}`;
    const filename = `${building}_${slug}_BuildingReport.docx`;
    await downloadResponse(response, filename);
  }
</script>

<Modal show={true} size="medium" on:close={() => dispatch('close')}>
  <h3 slot="header" class="text-xl font-bold">Plan Report — {building}</h3>

  <div class="section-spacing">

    <!-- ── Report mode ────────────────────────────────────────────────────── -->
    <div>
      <h4 class="font-semibold mb-3">Report Type</h4>
      <div class="flex gap-3">
        <button
          class="type-btn"
          class:type-btn-active={reportMode === 'plan'}
          on:click={() => reportMode = 'plan'}
        >
          <span class="type-icon">🗺</span>
          <div>
            <div class="font-semibold text-sm">Floor Plan Report</div>
            <div class="text-xs text-gray-400 mt-0.5">One page per floor — annotated image + element list</div>
          </div>
        </button>
        <button
          class="type-btn"
          class:type-btn-active={reportMode === 'building'}
          on:click={() => reportMode = 'building'}
        >
          <span class="type-icon">🏢</span>
          <div>
            <div class="font-semibold text-sm">Building Report</div>
            <div class="text-xs text-gray-400 mt-0.5">Element list only, sorted by asset ID — no images</div>
          </div>
        </button>
      </div>
    </div>

    <!-- ── Plan-mode options (hidden in building mode) ────────────────────── -->
    {#if reportMode === 'plan'}
      <div>
        <h4 class="font-semibold mb-3">Options</h4>
        <div class="space-y-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={options.includeImage}
              class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
            <span class="text-sm">Include annotated floor plan image per floor</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={options.includeElementList}
              class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
            <span class="text-sm">Include element list per floor</span>
          </label>
        </div>
      </div>
    {/if}

    <!-- ── Floor scope ────────────────────────────────────────────────────── -->
    <div>
      <h4 class="font-semibold mb-3">Floors</h4>
      <div class="flex gap-2 flex-wrap">
        <button
          class="scope-btn"
          class:scope-btn-active={floorScope === 'all'}
          on:click={() => floorScope = 'all'}
        >
          All floors <span class="text-xs opacity-60 ml-1">({plans.length})</span>
        </button>
        {#each plans as plan}
          <button
            class="scope-btn"
            class:scope-btn-active={floorScope === plan.id}
            on:click={() => floorScope = plan.id}
          >
            Floor {plan.floor_level}
          </button>
        {/each}
      </div>
    </div>

    <!-- ── Loading indicator ──────────────────────────────────────────────── -->
    {#if loading}
      <div class="flex items-center gap-2 text-sm text-gray-400">
        <Icon name="loading" size={4} className="animate-spin" /> Loading element data…
      </div>
    {:else if loadError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">⚠ {loadError}</div>
    {/if}

    <!-- ── Status filter ──────────────────────────────────────────────────── -->
    <div>
      <h4 class="font-semibold mb-3">Status</h4>
      <div class="space-y-2">
        {#each ELEMENT_STATUS_OPTIONS as status}
          <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 px-2 py-1 rounded">
            <input type="checkbox"
              checked={selectedStatuses.includes(status.value)}
              on:change={() => toggleStatus(status.value)}
              class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
            <span class="flex-1 text-sm">{status.label}</span>
          </label>
        {/each}
      </div>
    </div>

    <!-- ── Element type + sub-filters ────────────────────────────────────── -->
    <div>
      <h4 class="font-semibold mb-2">Element Types</h4>
      <ElementTypeFilter {elementCounts} on:change={handleTypeChange} />
    </div>

    <!-- ── Per-floor preview table ────────────────────────────────────────── -->
    {#if !loading}
      <div>
        <h4 class="font-semibold mb-2">
          Preview
          <span class="font-normal text-sm text-gray-400 ml-2">
            {totalMatched} element{totalMatched !== 1 ? 's' : ''}
            · {floorsIncluded} floor{floorsIncluded !== 1 ? 's' : ''} included
            {#if floorsSkipped > 0}
              <span class="text-amber-400">· {floorsSkipped} skipped</span>
            {/if}
          </span>
        </h4>
        <div class="bg-slate-700/40 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-600">
                <th class="text-left px-4 py-2 text-gray-400 font-medium">Floor</th>
                <th class="text-right px-4 py-2 text-gray-400 font-medium">Matching</th>
                <th class="text-right px-4 py-2 text-gray-400 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each previewRows as { plan, count, total }}
                <tr class="border-b border-slate-700/50 last:border-0" class:opacity-40={count === 0}>
                  <td class="px-4 py-2 text-gray-300">
                    {getFloorLevelLabel(String(plan.floor_level))}
                    {#if count === 0}
                      <span class="text-xs text-amber-500/70 italic ml-2">skipped</span>
                    {/if}
                  </td>
                  <td class="px-4 py-2 text-right font-medium"
                      class:text-purple-300={count > 0}
                      class:text-gray-500={count === 0}>{count}</td>
                  <td class="px-4 py-2 text-right text-gray-500">{total}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if totalMatched === 0}
        <div class="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-400">
          ⚠ No elements match the current filters.
        </div>
      {/if}
    {/if}

    {#if genError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">⚠ {genError}</div>
    {/if}

  </div>

  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={() => dispatch('close')} disabled={generating}>
      Cancel
    </Button>
    <Button variant="primary" size="large" icon="download" on:click={generateReport}
            disabled={generating || loading || totalMatched === 0}>
      {#if generating}
        {genProgress || 'Generating…'}
      {:else}
        Generate ({floorsIncluded} floor{floorsIncluded !== 1 ? 's' : ''})
      {/if}
    </Button>
  </div>
</Modal>

<style>
  .type-btn {
    flex: 1; display: flex; align-items: flex-start; gap: 0.75rem;
    padding: 0.875rem 1rem; border-radius: 8px; text-align: left;
    border: 1px solid rgb(71 85 105);
    background: rgb(51 65 85 / 0.3);
    cursor: pointer; transition: all 0.15s; color: #e2e8f0;
  }
  .type-btn:hover      { border-color: rgb(139 92 246 / 0.5); background: rgb(139 92 246 / 0.05); }
  .type-btn-active     { border-color: rgb(139 92 246); background: rgb(139 92 246 / 0.1); }
  .type-icon           { font-size: 1.25rem; flex-shrink: 0; }

  .scope-btn {
    padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid rgb(71 85 105);
    font-size: 0.875rem; color: rgb(156 163 175); background: transparent;
    cursor: pointer; transition: all 0.15s;
  }
  .scope-btn:hover      { border-color: rgb(139 92 246 / 0.5); color: rgb(196 181 253); }
  .scope-btn-active     { border-color: rgb(139 92 246); color: rgb(196 181 253); background: rgb(139 92 246 / 0.1); }
</style>
