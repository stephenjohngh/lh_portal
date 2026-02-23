<!-- src/lib/apps/plans/components/BuildingReport.svelte -->
<!-- All-floors element report (doors / lights). No plan images.        -->
<!-- Floors with 0 matching elements are skipped. One page per floor.   -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }   from '$lib/utils/logger';
  import Modal           from '$lib/components/common/Modal.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import Icon            from '$lib/components/icons/Icon.svelte';
  import { plansStore }  from '../stores/plansStore';
  import { ELEMENT_SUBTYPES, getFloorLevelLabel } from '$lib/utils/planConstants';
  import { downloadResponse } from '$lib/utils/download';

  const logger   = getLogger('BuildingReport');
  const dispatch = createEventDispatcher();

  export let building;   // string
  export let plans;      // Plan[] sorted L→U→G→1→2…

  // ── Filters ──────────────────────────────────────────────────────────────
  let elementType     = 'communal_door';
  let filterFailed    = false;
  let filterEmergency = false;
  let filterSubtype   = '';

  $: isLight        = elementType === 'light';
  $: subtypeOptions = ELEMENT_SUBTYPES[elementType] ?? [];
  $: if (elementType) { filterSubtype = ''; filterEmergency = false; filterFailed = false; }

  // ── Preview ───────────────────────────────────────────────────────────────
  $: storeElements = $plansStore.elements;

  $: previewCounts = plans.map(plan => {
    const els     = storeElements[plan.id] ?? [];
    const matched = els.filter(matchesFilters);
    return { plan, count: matched.length, total: els.filter(e => e.element_type === elementType).length };
  });

  $: totalMatched   = previewCounts.reduce((s, p) => s + p.count, 0);
  $: floorsWithData = previewCounts.filter(p => p.count > 0).length;
  $: skippedFloors  = plans.length - floorsWithData;

  function matchesFilters(el) {
    if (el.element_type !== elementType)             return false;
    if (filterFailed    && el.status !== 'failed')   return false;
    if (filterEmergency && isLight && !el.emergency) return false;
    if (filterSubtype   && el.subtype !== filterSubtype) return false;
    return true;
  }

  // ── Load missing elements ─────────────────────────────────────────────────
  let loading   = false;
  let loadError = null;

  onMount(async () => {
    const missing = plans.filter(p => storeElements[p.id] === undefined).map(p => p.id);
    if (missing.length > 0) {
      loading = true; loadError = null;
      try   { await Promise.all(missing.map(id => plansStore.loadElements(id))); }
      catch (err) { loadError = err.message; }
      finally     { loading = false; }
    }
  });

  // ── Generation ────────────────────────────────────────────────────────────
  let generating    = false;
  let generateError = null;

  async function handleGenerate() {
    generating = true; generateError = null;
    try {
      const elementsByPlan = {};
      for (const plan of plans) {
        elementsByPlan[plan.id] = (storeElements[plan.id] ?? [])
          .filter(matchesFilters)
          .sort((a, b) => (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true }));
      }

      const response = await fetch('/api/plans/generate-building-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building, plans, elementsByPlan,
          options: {
            elementType,
            filterFailed,
            filterEmergency: isLight ? filterEmergency : false,
            filterSubtype,
            filterLabel: buildFilterLabel()
          }
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      await downloadResponse(response, buildFilename());
      dispatch('close');
    } catch (err) {
      generateError = err.message;
    } finally { generating = false; }
  }

  function buildFilterLabel() {
    const parts = [];
    if (filterFailed)               parts.push('Failed elements only');
    if (isLight && filterEmergency) parts.push('Emergency only');
    if (filterSubtype)              parts.push(`Subtype: ${filterSubtype}`);
    return parts.length ? parts.join(', ') : 'All';
  }

  function buildFilename() {
    const safe = building.replace(/[^a-z0-9]/gi, '_');
    const type = elementType.replace('_', '-');
    const sub  = filterSubtype   ? `-${filterSubtype.replace(/\s+/g, '-')}` : '';
    const fail = filterFailed    ? '-failed'    : '';
    const emrg = filterEmergency ? '-emergency' : '';
    return `${safe}_${type}${sub}${fail}${emrg}_report.docx`;
  }

  const TYPE_OPTIONS = [
    { value: 'communal_door',  label: 'Communal Doors',  icon: '🚪' },
    { value: 'apartment_door', label: 'Apartment Doors', icon: '🚪' },
    { value: 'light',          label: 'Lighting',        icon: '💡' }
  ];
</script>

<Modal show={true} size="large" on:close={() => dispatch('close')}>

  <h3 slot="header" class="text-xl font-bold flex items-center gap-2">
    <Icon name="chart" size={6} className="text-blue-400" />
    Building Report — {building}
  </h3>

  <div class="section-spacing">

    {#if loading}
      <div class="card-info flex items-center gap-3">
        <Icon name="loading" size={5} className="animate-spin text-blue-400" />
        <span class="text-sm">Loading element data…</span>
      </div>
    {/if}
    {#if loadError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">⚠ {loadError}</div>
    {/if}

    <!-- Element type -->
    <div>
      <p class="text-sm font-medium mb-3">Element Type</p>
      <div class="flex gap-2 flex-wrap">
        {#each TYPE_OPTIONS as opt}
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-colors"
            class:border-blue-500={elementType === opt.value}
            class:text-blue-300={elementType === opt.value}
            class:border-slate-600={elementType !== opt.value}
            class:text-gray-400={elementType !== opt.value}
            style={elementType === opt.value ? 'background:rgba(59,130,246,0.1)' : ''}
            on:click={() => elementType = opt.value}
          >{opt.icon} {opt.label}</button>
        {/each}
      </div>
    </div>

    <!-- Filters -->
    <div>
      <p class="text-sm font-medium mb-3">Filters</p>
      <div class="bg-slate-700/40 rounded-lg p-4 space-y-3">
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" class="checkbox" bind:checked={filterFailed} />
          <span class="text-sm text-gray-300">Failed elements only</span>
        </label>
        {#if isLight}
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" class="checkbox" bind:checked={filterEmergency} />
            <span class="text-sm text-gray-300">Emergency fittings only</span>
          </label>
        {/if}
        {#if subtypeOptions.length > 0}
          <div class="flex items-center gap-3">
            <span class="text-sm text-gray-300 flex-shrink-0">Subtype</span>
            <select class="select text-sm flex-1" bind:value={filterSubtype}>
              <option value="">All subtypes</option>
              {#each subtypeOptions as sub}<option value={sub}>{sub}</option>{/each}
            </select>
          </div>
        {/if}
      </div>
    </div>

    <!-- Preview per floor -->
    {#if !loading}
      <div>
        <p class="text-sm font-medium mb-3">
          Preview
          <span class="text-gray-400 font-normal ml-2">
            {totalMatched} element{totalMatched !== 1 ? 's' : ''} across {floorsWithData} floor{floorsWithData !== 1 ? 's' : ''}
            {#if skippedFloors > 0}
              <span class="text-amber-400">· {skippedFloors} floor{skippedFloors !== 1 ? 's' : ''} with no matches will be skipped</span>
            {/if}
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
                <tr class="border-b border-slate-700/50 last:border-0" class:opacity-40={count === 0}>
                  <td class="px-4 py-2 text-gray-300">
                    {getFloorLevelLabel(String(plan.floor_level))}
                    {#if count === 0}<span class="text-xs text-amber-500/70 italic ml-2">skipped</span>{/if}
                  </td>
                  <td class="px-4 py-2 text-right font-medium"
                      class:text-blue-300={count > 0} class:text-gray-500={count === 0}>{count}</td>
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

    {#if generateError}
      <div class="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-sm text-red-400">
        ⚠ {generateError}
      </div>
    {/if}

  </div>

  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={() => dispatch('close')} disabled={generating}>Cancel</Button>
    <Button variant="primary" size="large" icon="download" on:click={handleGenerate}
            disabled={generating || loading || totalMatched === 0}>
      {generating ? 'Generating…' : `Generate (${floorsWithData} floor${floorsWithData !== 1 ? 's' : ''})`}
    </Button>
  </div>

</Modal>
