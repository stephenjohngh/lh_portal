<!-- src/lib/apps/plans/components/reports/PlansReport.svelte -->
<!-- Generate Word document report for floor plan with elements -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
  
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
  
  $: filteredElements = options.includeInactive 
    ? elements 
    : elements.filter(e => e.status !== 'inactive' && e.status !== 'removed');
  
  $: elementsByType = filteredElements.reduce((acc, element) => {
    if (!acc[element.element_type]) {
      acc[element.element_type] = [];
    }
    acc[element.element_type].push(element);
    return acc;
  }, {});
  
  $: sortedTypes = Object.keys(elementsByType).sort();
  
  async function generateReport() {
    generating = true;
    logger('Generating report for plan:', plan.id);
    
    try {
      const response = await fetch('/api/plans/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan,
          elements: filteredElements,
          options
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
                  <li>• {element.name}</li>
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
