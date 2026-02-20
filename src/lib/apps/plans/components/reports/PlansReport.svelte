<!-- src/lib/apps/plans/components/reports/PlansReport.svelte -->
<!-- Generate Word document report for floor plan with elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { ELEMENT_TYPE_OPTIONS, getElementDisplayName } from '$lib/utils/planConstants';
  
  const logger = getLogger('PlansReport');
  const dispatch = createEventDispatcher();
  
  export let plan;
  export let elements = [];
  
  let generating = false;
  let options = {
    includeImage: true,
    includeElementList: true,
    groupByType: true,
    includeInactive: false
  };

  // Type filter — all types shown by default; user can deselect
  $: allTypes = [...new Set(elements.map(e => e.element_type))].sort();
  let selectedTypes = new Set();                   // empty = all types shown
  $: if (allTypes) selectedTypes = new Set(allTypes); // initialise when elements load

  function toggleType(type) {
    const s = new Set(selectedTypes);
    s.has(type) ? s.delete(type) : s.add(type);
    selectedTypes = s;
  }

  $: filteredElements = elements.filter(e => {
    if (e.status !== 'active' && !options.includeInactive &&
        (e.status === 'inactive' || e.status === 'removed')) return false;
    if (selectedTypes.size > 0 && !selectedTypes.has(e.element_type)) return false;
    return true;
  });
  
  $: elementsByType = filteredElements.reduce((acc, element) => {
    if (!acc[element.element_type]) {
      acc[element.element_type] = [];
    }
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

  // Draw all element markers onto an offscreen canvas over the plan image,
  // then export as a PNG base64 string. This produces a fully-annotated
  // image that embeds directly into the Word doc.
  async function buildAnnotatedImageBase64(imageUrl, elements, imgW, imgH) {
    // Load the plan image
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

    // Draw base plan image
    ctx.drawImage(planImg, 0, 0, W, H);

    const R = MARKER_RADIUS;

    for (const el of elements) {
      const cx = el.x_position * W;
      const cy = el.y_position * H;
      const cfg = TYPE_CONFIG[el.element_type] || { color: '#888888', shape: 'circle' };
      const alpha = el.status === 'active' ? 1 : 0.5;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'white';
      ctx.lineWidth   = 2;
      ctx.fillStyle   = cfg.color;

      if (cfg.shape === 'circle') {
        // Light: yellow circle
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Door types: rounded square
        const x = cx - R, y = cy - R, s = R * 2;
        ctx.beginPath();
        ctx.roundRect(x, y, s, s, 3);
        ctx.fill();
        ctx.stroke();

        if (cfg.shape === 'square_inner') {
          // Apartment door / fire control: white inner square
          const ir = R * 0.45;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.roundRect(cx - ir, cy - ir, ir * 2, ir * 2, 1);
          ctx.fill();
        }
      }

      // Status dot
      ctx.globalAlpha = 1;
      if (el.status === 'failed') {
        ctx.fillStyle   = '#ef4444';
        ctx.strokeStyle = 'white';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(cx + R - 3, cy - R + 3, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (el.status === 'inactive') {
        ctx.fillStyle   = '#64748b';
        ctx.strokeStyle = 'white';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(cx + R - 3, cy - R + 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // ID label below marker
      const TYPE_INITIALS = { communal_door: 'D', apartment_door: 'A', light: 'L', fire_control: 'F' };
      const label = `${el.asset_id || '?'}`;
      ctx.globalAlpha = 0.9;
      ctx.font        = `bold ${R * 0.85 + 6}px Arial, sans-serif`;
      ctx.textAlign   = 'center';
      ctx.textBaseline = 'top';
      // White shadow for legibility
      ctx.strokeStyle = 'white';
      ctx.lineWidth   = 3;
      ctx.strokeText(label, cx, cy + R + 2);
      ctx.fillStyle   = '#1a1a2e';
      ctx.fillText(label, cx, cy + R + 2);
    }

    ctx.globalAlpha = 1;
    // Export as PNG base64 (strip "data:image/png;base64," prefix)
    return canvas.toDataURL('image/png').split(',')[1];
  }
  
  async function generateReport() {
    generating = true;
    logger('Generating report for plan:', plan.id);
    
    try {
      // Build annotated plan image (plan + element markers) client-side
      let imageBase64 = null;
      if (options.includeImage && plan.image_url) {
        try {
          imageBase64 = await buildAnnotatedImageBase64(
            plan.image_url,
            filteredElements,
            plan.image_width,
            plan.image_height
          );
          logger('Annotated image built, base64 length:', imageBase64?.length);
        } catch (imgErr) {
          logger('⚠️ Annotated image build failed, continuing without image:', imgErr.message);
        }
      }

      const response = await fetch('/api/plans/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          elements: filteredElements,
          options: { ...options, imageBase64 }
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
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
  
  function handleClose() {
    dispatch('close');
  }
</script>

<Modal show={true} size="medium" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold">Generate Floor Plan Report</h3>
  
  <div class="section-spacing">
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
          <input
            type="checkbox"
            bind:checked={options.includeImage}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
          />
          <span class="text-sm">Include floor plan image</span>
        </label>
        
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={options.includeElementList}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
          />
          <span class="text-sm">Include element list</span>
        </label>
        
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={options.groupByType}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
          />
          <span class="text-sm">Group elements by type</span>
        </label>
        
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={options.includeInactive}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
          />
          <span class="text-sm">Include inactive/removed elements</span>
        </label>
      </div>
    </div>

    <!-- Type filter -->
    {#if allTypes.length > 1}
      <div>
        <h4 class="font-semibold mb-2">Element types to include</h4>
        <div class="space-y-2">
          {#each allTypes as type}
            {@const cfg = ELEMENT_TYPE_OPTIONS.find(t => t.value === type)}
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedTypes.has(type)}
                on:change={() => toggleType(type)}
                class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
              />
              <span class="text-sm">{cfg?.label ?? type}</span>
              <span class="text-xs text-gray-400">
                ({elements.filter(e => e.element_type === type).length})
              </span>
            </label>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- Preview -->
    {#if options.includeElementList && options.groupByType}
      <div>
        <h4 class="font-semibold mb-2">Preview: Elements by Type</h4>
        <div class="bg-slate-700/50 rounded p-3 max-h-48 overflow-y-auto">
          {#each sortedTypes as type}
            {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === type)}
            <div class="mb-2">
              <p class="text-sm font-medium flex items-center gap-2">
                <span>{typeConfig?.icon}</span>
                <span class="capitalize">{type}s ({elementsByType[type].length})</span>
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
        </div>
      </div>
    {/if}
  </div>
  
  <div slot="footer" class="btn-group justify-end">
    <Button
      variant="secondary"
      size="large"
      on:click={handleClose}
      disabled={generating}
    >
      Cancel
    </Button>
    <Button
      variant="primary"
      size="large"
      icon="download"
      on:click={generateReport}
      disabled={generating}
    >
      {generating ? 'Generating...' : 'Generate Report'}
    </Button>
  </div>
</Modal>
