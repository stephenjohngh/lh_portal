<!-- src/lib/apps/plans/components/reports/PlansReport.svelte -->
<!-- Generate Word document report for floor plan with elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { ELEMENT_TYPE_OPTIONS, ELEMENT_STATUS_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  import ElementTypeFilter from '../ElementTypeFilter.svelte';
  
  const logger = getLogger('PlansReport');
  const dispatch = createEventDispatcher();
  
  export let plan;
  export let elements   = [];
  export let filters    = null;  // current PlanViewer filters to pre-populate

  let generating = false;
  let options = {
    includeImage:       true,
    includeElementList: true,
  };

  // groupByType is always on — no checkbox needed
  const groupByType = true;

  // Status filter — pre-populated from current viewer filters; empty = all statuses shown
  let selectedStatuses = [];

  // Type + sub-filters from ElementTypeFilter component
  let typeFilters   = { types: [], lightFilters: {}, communalFilters: {}, fireFilters: {} };
  let typeFilterRef;

  function handleTypeChange(event) {
    typeFilters = event.detail;
  }

  function toggleStatus(status) {
    selectedStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status];
  }

  // Pre-populate status from carried-in viewer filters
  $: if (filters?.statuses) selectedStatuses = filters.statuses;

  // Compute element counts for badges in ElementTypeFilter
  $: elementCounts = ELEMENT_TYPE_OPTIONS.reduce((acc, t) => {
    acc[t.value] = elements.filter(e => e.element_type === t.value).length;
    return acc;
  }, {});

  // Filter elements: status selection + type/subtype filters from ElementTypeFilter
  $: filteredElements = elements.filter(e => {
    // Status — empty selectedStatuses means show all
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(e.status)) return false;
    // Type filter — empty types means all
    if (typeFilters.types?.length > 0 && !typeFilters.types.includes(e.element_type)) return false;
    // Light sub-filters
    if (e.element_type === 'light') {
      const lf = typeFilters.lightFilters ?? {};
      if (lf.subtypes?.length > 0 && !lf.subtypes.includes(e.subtype))         return false;
      if (lf.battery?.length  > 0 && !lf.battery.includes(e.battery))          return false;
      if (lf.emergency        && !e.emergency)                                  return false;
      if (lf.movementSensor   && !e.movement_sensor)                            return false;
      if (lf.lightSensor      && !e.light_sensor)                               return false;
    }
    // Communal door sub-filters
    if (e.element_type === 'communal_door') {
      const cf = typeFilters.communalFilters ?? {};
      if (cf.subtypes?.length > 0 && !cf.subtypes.includes(e.subtype))         return false;
      if (cf.security?.length > 0 && !cf.security.includes(e.security))        return false;
      if (cf.retained         && !e.retained)                                   return false;
    }
    // Fire control sub-filters
    if (e.element_type === 'fire_control') {
      const ff = typeFilters.fireFilters ?? {};
      if (ff.subtypes?.length > 0 && !ff.subtypes.includes(e.subtype))         return false;
    }
    return true;
  });

  $: elementsByType = filteredElements.reduce((acc, element) => {
    if (!acc[element.element_type]) acc[element.element_type] = [];
    acc[element.element_type].push(element);
    return acc;
  }, {});

  $: sortedTypes = Object.keys(elementsByType).sort();

  // ── Element type colours and shape rules (mirrors ElementMarker.svelte) ──
  const TYPE_CONFIG = {
    communal_door:  { color: '#c2410c', shape: 'square' },
    apartment_door: { color: '#a855f7', shape: 'square_inner' },
    fire_control:   { color: '#ef4444', shape: 'square_inner' },
    light:          { color: '#eab308', shape: 'circle' },
  };
  const MARKER_RADIUS = 12;

  // Draw annotated plan (plan image + element markers) on an offscreen canvas
  async function buildAnnotatedImageBase64(imageUrl, els, imgW, imgH) {
    const planImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = imageUrl;
    });

    const W = imgW || planImg.naturalWidth  || 800;
    const H = imgH || planImg.naturalHeight || 600;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(planImg, 0, 0, W, H);

    const R = MARKER_RADIUS;
    for (const el of els) {
      const cx  = el.x_position * W;
      const cy  = el.y_position * H;
      const cfg = TYPE_CONFIG[el.element_type] || { color: '#888888', shape: 'circle' };
      ctx.globalAlpha = el.status === 'active' ? 1 : 0.5;
      ctx.strokeStyle = 'white';
      ctx.lineWidth   = 2;
      ctx.fillStyle   = cfg.color;

      if (cfg.shape === 'circle') {
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.roundRect(cx - R, cy - R, R * 2, R * 2, 3); ctx.fill(); ctx.stroke();
        if (cfg.shape === 'square_inner') {
          const ir = R * 0.45;
          ctx.fillStyle = 'white';
          ctx.beginPath(); ctx.roundRect(cx - ir, cy - ir, ir * 2, ir * 2, 1); ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      if (el.status === 'failed') {
        ctx.fillStyle = '#ef4444'; ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx + R - 3, cy - R + 3, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else if (el.status === 'inactive') {
        ctx.fillStyle = '#64748b'; ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx + R - 3, cy - R + 3, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }

      // ID label below marker
      const label = el.asset_id || '?';
      ctx.globalAlpha  = 0.9;
      ctx.font         = `bold ${R * 0.85 + 6}px Arial, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle  = 'white'; ctx.lineWidth = 3;
      ctx.strokeText(label, cx, cy + R + 2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fillText(label, cx, cy + R + 2);
    }

    ctx.globalAlpha = 1;
    return canvas.toDataURL('image/png').split(',')[1];
  }

  // Build a human-readable summary of active filters for the report header
  function buildFilterSummary(typeFilters, selectedStatuses, totalElements, filteredCount) {
    const parts = [];

    // Type filter
    if (typeFilters.types?.length > 0) {
      const labels = typeFilters.types.map(t => {
        const cfg = ELEMENT_TYPE_OPTIONS.find(o => o.value === t);
        return cfg?.label ?? t;
      });
      parts.push(`Types: ${labels.join(', ')}`);
    }

    // Light sub-filters
    const lf = typeFilters.lightFilters ?? {};
    if (lf.subtypes?.length > 0)  parts.push(`Light subtypes: ${lf.subtypes.join(', ')}`);
    if (lf.battery?.length  > 0)  parts.push(`Battery: ${lf.battery.join(', ')}`);
    if (lf.emergency)              parts.push('Emergency lights only');
    if (lf.movementSensor)         parts.push('Movement sensor only');
    if (lf.lightSensor)            parts.push('Light sensor only');

    // Communal door sub-filters
    const cf = typeFilters.communalFilters ?? {};
    if (cf.subtypes?.length > 0)  parts.push(`Door subtypes: ${cf.subtypes.join(', ')}`);
    if (cf.security?.length > 0)  parts.push(`Security: ${cf.security.join(', ')}`);
    if (cf.retained)               parts.push('Retained doors only');

    // Fire control sub-filters
    const ff = typeFilters.fireFilters ?? {};
    if (ff.subtypes?.length > 0)  parts.push(`Fire subtypes: ${ff.subtypes.join(', ')}`);

    // Status
    if (selectedStatuses.length > 0) {
      const labels = selectedStatuses.map(s => {
        const opt = ELEMENT_STATUS_OPTIONS.find(o => o.value === s);
        return opt?.label ?? s;
      });
      parts.push(`Status: ${labels.join(', ')}`);
    }

    if (parts.length === 0) return null;  // no filters — don't show anything

    const excluded = totalElements - filteredCount;
    const suffix   = excluded > 0 ? ` (${excluded} element${excluded !== 1 ? 's' : ''} excluded)` : '';
    return parts.join(' · ') + suffix;
  }

  async function generateReport() {
    generating = true;
    logger('Generating report for plan:', plan.id, '| elements:', filteredElements.length);
    
    try {
      let imageBase64 = null;
      if (options.includeImage && plan.image_url) {
        try {
          imageBase64 = await buildAnnotatedImageBase64(
            plan.image_url, filteredElements, plan.image_width, plan.image_height
          );
          logger('Annotated image built, base64 length:', imageBase64?.length);
        } catch (imgErr) {
          logger('⚠️ Annotated image build failed, continuing without image:', imgErr.message);
        }
      }

      const response = await fetch('/api/plans/generate-report', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          plan,
          elements: filteredElements,
          options:  {
            ...options,
            imageBase64,
            groupByType,
            filterSummary: buildFilterSummary(typeFilters, selectedStatuses, elements.length, filteredElements.length)
          }
        })
      });
      
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${plan.building}_${plan.name}_Report.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      logger('✅ Report generated successfully');
      dispatch('close');
      
    } catch (error) {
      logger('❌ Error generating report:', error.message);
      alert('Failed to generate report: ' + error.message);
    } finally {
      generating = false;
    }
  }
  
  function handleClose() { dispatch('close'); }
</script>

<Modal show={true} size="medium" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold">Create Report</h3>
  
  <div class="section-spacing">
    <!-- Plan summary -->
    <div class="card-info">
      <h4 class="font-semibold mb-2">Report Details</h4>
      <div class="text-sm space-y-1">
        <p><strong>Plan:</strong> {plan.name}</p>
        <p><strong>Building:</strong> {plan.building}</p>
        <p><strong>Floor:</strong> Level {plan.floor_level}</p>
        <p><strong>Total Elements:</strong> {elements.length}</p>
        <p><strong>Elements to Include:</strong> {filteredElements.length}</p>
      </div>
    </div>
    
    <!-- Report Options -->
    <div>
      <h4 class="font-semibold mb-3">Report Options</h4>
      <div class="space-y-3">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={options.includeImage}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
          <span class="text-sm">Include floor plan image</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={options.includeElementList}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500" />
          <span class="text-sm">Include element list</span>
        </label>
      </div>
    </div>

    <!-- Status filter — matches sidebar -->
    <div>
      <h4 class="font-semibold mb-3">Status</h4>
      <div class="space-y-2">
        {#each ELEMENT_STATUS_OPTIONS as status}
          <label class="flex items-center gap-2 cursor-pointer hover:bg-slate-700/50 px-2 py-1 rounded">
            <input
              type="checkbox"
              checked={selectedStatuses.includes(status.value)}
              on:change={() => toggleStatus(status.value)}
              class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
            />
            <span class="flex-1 text-sm">{status.label}</span>
          </label>
        {/each}
      </div>
    </div>



    <!-- Element type filter — same component as plan sidebar -->
    <div>
      <h4 class="font-semibold mb-2">Element Types</h4>
      <ElementTypeFilter
        bind:this={typeFilterRef}
        {elementCounts}
        initialFilters={filters}
        on:change={handleTypeChange}
      />
    </div>

    <!-- Preview grouped by type -->
    {#if options.includeElementList}
      <div>
        <h4 class="font-semibold mb-2">Preview: Elements by Type</h4>
        <div class="bg-slate-700/50 rounded p-3 max-h-48 overflow-y-auto">
          {#if sortedTypes.length === 0}
            <p class="text-xs text-gray-400 italic">No elements match current filters.</p>
          {:else}
            {#each sortedTypes as type}
              {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === type)}
              <div class="mb-2">
                <p class="text-sm font-medium flex items-center gap-2">
                  <span>{typeConfig?.icon}</span>
                  <span class="capitalize">{typeConfig?.label ?? type} ({elementsByType[type].length})</span>
                </p>
                <ul class="text-xs text-gray-400 ml-6 mt-1">
                  {#each elementsByType[type].slice(0, 3) as element}
                    <li>• {getElementDisplayName(element, plan.floor_level)}{element.label ? ` — ${element.label}` : ''}</li>
                  {/each}
                  {#if elementsByType[type].length > 3}
                    <li class="italic">... and {elementsByType[type].length - 3} more</li>
                  {/if}
                </ul>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
  
  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={handleClose} disabled={generating}>
      Cancel
    </Button>
    <Button variant="primary" size="large" icon="download" on:click={generateReport} disabled={generating}>
      {generating ? 'Generating...' : 'Generate Report'}
    </Button>
  </div>
</Modal>
