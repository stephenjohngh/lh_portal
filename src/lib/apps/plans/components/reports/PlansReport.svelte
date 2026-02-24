<!-- src/lib/apps/plans/components/reports/PlansReport.svelte -->
<!-- Floor Plan Report: one page per floor — annotated plan image + element table.  -->
<!-- All floors or a specific floor. Floors with 0 matching elements are skipped.   -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }      from '$lib/utils/logger';
  import Modal              from '$lib/components/common/Modal.svelte';
  import Button             from '$lib/components/common/Button.svelte';
  import Icon               from '$lib/components/icons/Icon.svelte';
  import ElementTypeFilter  from '../ElementTypeFilter.svelte';
  import { plansStore }     from '../../stores/plansStore';
  import {
    ELEMENT_TYPE_OPTIONS, ELEMENT_STATUS_OPTIONS,
    MARKER_RADIUS, getElementDisplayName, getElementTypeConfig,
    getFloorLevelLabel
  } from '$lib/utils/planConstants';

  const logger   = getLogger('PlansReport');
  const dispatch = createEventDispatcher();

  export let plans;   // Plan[] — all plans sorted by floor

  // ── Floor scope ───────────────────────────────────────────────────────────────
  // 'all' | 'basement' | 'residential' | specific plan.id
  let floorScope  = 'all';
  
  // Compute active plans based on scope
  $: activePlans = (() => {
    if (floorScope === 'all') return plans;
    if (floorScope === 'basement') {
      // U (Upper) + L (Lower)
      return plans.filter(p => p.floor_level === 'U' || p.floor_level === 'L');
    }
    if (floorScope === 'residential') {
      // G (Ground) + 1-7
      return plans.filter(p => ['G', '1', '2', '3', '4', '5', '6', '7'].includes(p.floor_level));
    }
    // Specific floor
    return plans.filter(p => p.id === floorScope);
  })();

  // ── Load ALL floors' elements on mount ────────────────────────────────────────
  $: storeElements = $plansStore.elements;
  let loading  = false;
  let loadError = null;

  onMount(async () => {
    const missing = plans.filter(p => storeElements[p.id] === undefined).map(p => p.id);
    if (!missing.length) return;
    loading = true; loadError = null;
    try   { await Promise.all(missing.map(id => plansStore.loadElements(id))); }
    catch (err) { loadError = err.message; }
    finally     { loading = false; }
  });

  // ── Options ───────────────────────────────────────────────────────────────────
  let options = { 
    includeImage: true, 
    includeElementList: true,
    includeSummary: true
  };

  let selectedStatuses = [];
  let typeFilters      = { types: [], lightFilters: {}, communalFilters: {}, fireFilters: {} };

  function toggleStatus(s) {
    selectedStatuses = selectedStatuses.includes(s)
      ? selectedStatuses.filter(x => x !== s)
      : [...selectedStatuses, s];
  }
  function handleTypeChange(e) { typeFilters = e.detail; }

  // ── Filter function (applied per-floor) ───────────────────────────────────────
  function filterEls(els) {
    return els.filter(e => {
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(e.status))       return false;
      if (typeFilters.types?.length > 0 && !typeFilters.types.includes(e.element_type)) return false;
      if (e.element_type === 'light') {
        const lf = typeFilters.lightFilters ?? {};
        if (lf.subtypes?.length > 0 && !lf.subtypes.includes(e.subtype))  return false;
        if (lf.battery?.length  > 0 && !lf.battery.includes(e.battery))   return false;
        if (lf.emergency        && !e.emergency)                           return false;
        if (lf.movementSensor   && !e.movement_sensor)                     return false;
        if (lf.lightSensor      && !e.light_sensor)                        return false;
      }
      if (e.element_type === 'communal_door') {
        const cf = typeFilters.communalFilters ?? {};
        if (cf.subtypes?.length > 0 && !cf.subtypes.includes(e.subtype))  return false;
        if (cf.security?.length > 0 && !cf.security.includes(e.security)) return false;
        if (cf.retained         && !e.retained)                            return false;
      }
      if (e.element_type === 'fire_control') {
        const ff = typeFilters.fireFilters ?? {};
        if (ff.subtypes?.length > 0 && !ff.subtypes.includes(e.subtype))  return false;
      }
      return true;
    });
  }

  // ── Per-floor preview — reactive to filters + scope ─────────────────────────
  $: previewRows = [selectedStatuses, typeFilters] && activePlans.map(plan => {
    const all      = storeElements[plan.id] ?? [];
    const filtered = filterEls(all);
    return { plan, count: filtered.length, total: all.length };
  });

  $: totalMatched    = previewRows.reduce((n, r) => n + r.count, 0);
  $: floorsIncluded  = previewRows.filter(r => r.count > 0).length;
  $: floorsSkipped   = activePlans.length - floorsIncluded;

  // elementCounts for the type-filter badge
  $: elementCounts = ELEMENT_TYPE_OPTIONS.reduce((acc, t) => {
    acc[t.value] = activePlans.reduce(
      (n, p) => n + (storeElements[p.id] ?? []).filter(e => e.element_type === t.value).length, 0
    );
    return acc;
  }, {});

  // Check if basement or residential options are available
  $: hasBasement = plans.some(p => p.floor_level === 'U' || p.floor_level === 'L');
  $: hasResidential = plans.some(p => ['G', '1', '2', '3', '4', '5', '6', '7'].includes(p.floor_level));

  // ── Annotated image builder ───────────────────────────────────────────────────
  const MARKER_SHAPE = {
    communal_door:  'square',
    apartment_door: 'square_inner',
    fire_control:   'square_inner',
    light:          'circle',
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
    if (selectedStatuses.length > 0)
      parts.push(`Status: ${selectedStatuses.map(s => ELEMENT_STATUS_OPTIONS.find(o => o.value === s)?.label ?? s).join(', ')}`);
    return parts.length ? parts.join(' · ') : null;
  }

  // ── Generation ────────────────────────────────────────────────────────────────
  let generating  = false;
  let genProgress = '';
  let genError    = null;

  async function generateReport() {
    generating = true; genError = null; genProgress = '';
    try {
      const floors = [];
      for (const plan of activePlans) {
        const els = filterEls(storeElements[plan.id] ?? []);
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

      const building = plans[0]?.building ?? 'Building';
      const response = await fetch('/api/plans/generate-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floors,
          options: { 
            ...options, 
            groupByType: true, 
            filterSummary: buildFilterSummary(), 
            building 
          }
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const slug = floorScope === 'all' ? 'AllFloors' : 
                   floorScope === 'basement' ? 'Basement' :
                   floorScope === 'residential' ? 'Residential' :
                   `Floor${activePlans[0]?.floor_level}`;
      a.href     = url;
      a.download = `${building}_${slug}_PlanReport.docx`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);

      dispatch('close');
    } catch (err) {
      logger('❌ Report failed:', err.message);
      genError = err.message;
    } finally {
      generating = false; genProgress = '';
    }
  }
</script>

<Modal show={true} size="medium" on:close={() => dispatch('close')}>
  <!-- Compact header -->
  <div slot="header" class="text-lg font-bold">Floor Plan Report</div>

  <div class="space-y-3">

    <!-- Floor scope - BUTTONS + DROPDOWN -->
    <div>
      <h4 class="text-sm font-semibold mb-2">Floors</h4>
      <div class="flex gap-2 items-center flex-wrap">
        <button
          class="scope-btn"
          class:scope-btn-active={floorScope === 'all'}
          on:click={() => floorScope = 'all'}
        >
          All <span class="count">({plans.length})</span>
        </button>
        
        {#if hasBasement}
          <button
            class="scope-btn"
            class:scope-btn-active={floorScope === 'basement'}
            on:click={() => floorScope = 'basement'}
          >
            Basement <span class="count">(U+L)</span>
          </button>
        {/if}
        
        {#if hasResidential}
          <button
            class="scope-btn"
            class:scope-btn-active={floorScope === 'residential'}
            on:click={() => floorScope = 'residential'}
          >
            Residential <span class="count">(G-7)</span>
          </button>
        {/if}
        
        <span class="text-sm text-gray-400">or</span>
        
        <select 
          bind:value={floorScope}
          class="select text-sm py-1.5 px-3"
        >
          <option value="all">-- Select single floor --</option>
          {#each plans as plan}
            <option value={plan.id}>Floor {plan.floor_level} - {plan.name}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Loading -->
    {#if loading}
      <div class="flex items-center gap-2 text-xs text-gray-400">
        <Icon name="loading" size={4} className="animate-spin" /> Loading…
      </div>
    {:else if loadError}
      <div class="p-2 bg-red-500/10 border border-red-500/50 rounded text-xs text-red-400">⚠ {loadError}</div>
    {/if}

    <!-- Options - TRUE ONE LINE -->
    <div class="flex items-center gap-4 flex-wrap text-sm">
      <span class="font-semibold">Options:</span>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" bind:checked={options.includeImage} class="checkbox-sm" />
        <span>Floor Plan</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" bind:checked={options.includeElementList} class="checkbox-sm" />
        <span>List</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" bind:checked={options.includeSummary} class="checkbox-sm" />
        <span>Summary</span>
      </label>
    </div>

    <!-- Status - TRUE ONE LINE -->
    <div class="flex items-center gap-3 flex-wrap text-sm">
      <span class="font-semibold">Status:</span>
      {#each ELEMENT_STATUS_OPTIONS as status}
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox"
            checked={selectedStatuses.includes(status.value)}
            on:change={() => toggleStatus(status.value)}
            class="checkbox-sm" />
          <span>{status.label}</span>
        </label>
      {/each}
    </div>

    <!-- Element type filter - REDUCED SPACING -->
    <div>
      <h4 class="text-sm font-semibold mb-1.5">Element Types</h4>
      <div class="element-types-compact">
        <ElementTypeFilter {elementCounts} on:change={handleTypeChange} />
      </div>
    </div>

    <!-- Preview - COMPACT -->
    {#if !loading}
      <div>
        <h4 class="text-sm font-semibold mb-1.5">
          Preview
          <span class="font-normal text-xs text-gray-400 ml-2">
            {totalMatched} element{totalMatched !== 1 ? 's' : ''}
            · {floorsIncluded} floor{floorsIncluded !== 1 ? 's' : ''}
            {#if floorsSkipped > 0}
              <span class="text-amber-400">· {floorsSkipped} skipped</span>
            {/if}
          </span>
        </h4>
        <div class="bg-slate-700/40 rounded overflow-hidden">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-slate-600">
                <th class="text-left px-3 py-1.5 text-gray-400 font-medium">Floor</th>
                <th class="text-right px-3 py-1.5 text-gray-400 font-medium">Match</th>
                <th class="text-right px-3 py-1.5 text-gray-400 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each previewRows as { plan, count, total }}
                <tr class="border-b border-slate-700/50 last:border-0" class:opacity-40={count === 0}>
                  <td class="px-3 py-1.5 text-gray-300">
                    {getFloorLevelLabel(String(plan.floor_level))}
                    {#if count === 0}
                      <span class="text-xs text-amber-500/70 italic ml-1">skip</span>
                    {/if}
                  </td>
                  <td class="px-3 py-1.5 text-right font-medium"
                      class:text-purple-300={count > 0}
                      class:text-gray-500={count === 0}>{count}</td>
                  <td class="px-3 py-1.5 text-right text-gray-500">{total}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      {#if totalMatched === 0}
        <div class="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
          ⚠ No elements match the current filters.
        </div>
      {/if}
    {/if}

    {#if genError}
      <div class="p-2 bg-red-500/10 border border-red-500/50 rounded text-xs text-red-400">⚠ {genError}</div>
    {/if}

  </div>

  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="medium" on:click={() => dispatch('close')} disabled={generating}>
      Cancel
    </Button>
    <Button variant="primary" size="medium" icon="download" on:click={generateReport}
            disabled={generating || loading || totalMatched === 0}>
      {#if generating}
        {genProgress || 'Generating…'}
      {:else}
        Generate ({floorsIncluded})
      {/if}
    </Button>
  </div>
</Modal>

<style>
  /* Compact scope buttons */
  .scope-btn {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    border-radius: 0.375rem;
    border: 1px solid rgb(71 85 105);
    background: rgb(51 65 85 / 0.3);
    color: rgb(156 163 175);
    transition: all 0.15s;
    cursor: pointer;
  }
  .scope-btn:hover {
    border-color: rgb(139 92 246 / 0.5);
    background: rgb(139 92 246 / 0.05);
  }
  .scope-btn-active {
    border-color: rgb(139 92 246);
    background: rgb(139 92 246 / 0.15);
    color: rgb(196 181 253);
  }
  .count {
    font-size: 0.7rem;
    opacity: 0.6;
    margin-left: 0.25rem;
  }

  /* Compact element types filter */
  :global(.element-types-compact) {
    font-size: 0.8125rem;
  }
  :global(.element-types-compact .space-y-1) {
    gap: 0.25rem;
  }
  :global(.element-types-compact label) {
    padding: 0.25rem 0.375rem;
  }
</style>
