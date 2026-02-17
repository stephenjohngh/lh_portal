<!-- src/lib/apps/plans/components/PlanViewer.svelte -->
<!-- Interactive floor plan viewer with clickable elements -->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import ElementMarker from './ElementMarker.svelte';
  import ElementModal from './ElementModal.svelte';
  import PlanFilters from './PlanFilters.svelte';
  import PlansReport from './reports/PlansReport.svelte';
  import PlanInfoModal from './PlanInfoModal.svelte';
  import { plansStore } from '../stores/plansStore';
  import { ELEMENT_TYPE_OPTIONS } from '$lib/utils/planConstants';
  
  const logger = getLogger('PlanViewer');
  const dispatch = createEventDispatcher();
  
  export let plan;
  
  let imageElement;
  let containerElement;
  let elements = [];
  let filteredElementIds = new Set();
  let selectedElement = null;
  let showElementModal = false;
  let showReportModal = false;
  let showPlanInfoModal = false;
  let newElementPosition = null;
  let hoveredElement = null;
  let imageLoaded = false;
  let containerWidth = 0;
  let containerHeight = 0;
  let filters = {
    types: [],
    statuses: [],
    searchText: ''
  };
  
  $: if (plan) {
    loadElements();
  }
  
  $: elementCounts = elements.reduce((acc, el) => {
    acc[el.element_type] = (acc[el.element_type] || 0) + 1;
    return acc;
  }, {});
  
  // Sort elements for table display: type then name
  $: sortedElementsForTable = [...elements].sort((a, b) => {
    // First sort by element type
    if (a.element_type !== b.element_type) {
      return a.element_type.localeCompare(b.element_type);
    }
    // Then sort by name
    return a.name.localeCompare(b.name);
  });
  
  $: {
    // Apply filters and store filtered IDs
    const filtered = applyFilters(elements, filters);
    filteredElementIds = new Set(filtered.map(e => e.id));
  }
  
  $: hasActiveFilters = filters.types.length > 0 || filters.statuses.length > 0 || filters.searchText.length > 0;
  
  onMount(() => {
    // Setup resize observer for responsive rendering
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        containerWidth = width;
        containerHeight = height;
      }
    });
    
    if (containerElement) {
      resizeObserver.observe(containerElement);
    }
    
    return () => resizeObserver.disconnect();
  });
  
  async function loadElements() {
    logger('Loading elements for plan:', plan.id);
    try {
      elements = await plansStore.loadElements(plan.id);
      logger('✅ Loaded elements:', elements.length);
    } catch (error) {
      logger('❌ Error loading elements:', error.message);
    }
  }
  
  function applyFilters(allElements, filters) {
    let result = [...allElements];
    
    // Filter by type
    if (filters.types.length > 0) {
      result = result.filter(el => filters.types.includes(el.element_type));
    }
    
    // Filter by status
    if (filters.statuses.length > 0) {
      result = result.filter(el => filters.statuses.includes(el.status));
    }
    
    // Filter by search text
    if (filters.searchText) {
      const search = filters.searchText.toLowerCase();
      result = result.filter(el => 
        el.name.toLowerCase().includes(search) ||
        el.asset_id?.toLowerCase().includes(search) ||
        el.subtype?.toLowerCase().includes(search)
      );
    }
    
    return result;
  }
  
  function handleImageClick(event) {
    // Only handle clicks directly on the image, not on markers
    if (event.target !== imageElement) return;
    
    const rect = imageElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Normalize coordinates (0-1 range)
    const normalizedX = x / rect.width;
    const normalizedY = y / rect.height;
    
    logger('Image clicked at:', { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) });
    
    newElementPosition = {
      x: normalizedX,
      y: normalizedY
    };
    
    selectedElement = null;
    showElementModal = true;
  }
  
  function handleElementClick(element) {
    logger('Element clicked:', element.id, element.name);
    selectedElement = element;
    newElementPosition = null;
    showElementModal = true;
  }
  
  function handleElementHover(element) {
    hoveredElement = element;
  }
  
  function handleElementLeave() {
    hoveredElement = null;
  }
  
  async function handleElementSave(event) {
    const { element, isNew } = event.detail;
    
    try {
      if (isNew) {
        await plansStore.createElement(plan.id, element);
        logger('✅ Element created');
      } else {
        await plansStore.updateElement(element.id, element);
        logger('✅ Element updated');
      }
      
      await loadElements();
      showElementModal = false;
      selectedElement = null;
      newElementPosition = null;
    } catch (error) {
      logger('❌ Error saving element:', error.message);
      alert('Failed to save element: ' + error.message);
    }
  }
  
  async function handleElementDelete(event) {
    const { elementId, planId } = event.detail;
    
    try {
      await plansStore.deleteElement(elementId, planId);
      logger('✅ Element deleted');
      
      await loadElements();
      showElementModal = false;
      selectedElement = null;
    } catch (error) {
      logger('❌ Error deleting element:', error.message);
      alert('Failed to delete element: ' + error.message);
    }
  }
  
  function handleFilterChange(event) {
    filters = event.detail;
    logger('Filters changed:', filters);
  }
  
  function handleImageLoad() {
    imageLoaded = true;
    logger('Image loaded successfully');
  }
  
  // Convert normalized coordinates (0-1) to pixel coordinates
  function getPixelPosition(element) {
    if (!imageElement) return { x: 0, y: 0 };
    
    const rect = imageElement.getBoundingClientRect();
    return {
      x: element.x_position * rect.width,
      y: element.y_position * rect.height
    };
  }
  
  // Check if element is in filtered set
  function isElementFiltered(element) {
    if (!hasActiveFilters) return false;
    return !filteredElementIds.has(element.id);
  }
</script>

<div class="grid grid-cols-12 gap-6">
  <!-- Filters Sidebar -->
  <div class="col-span-3">
    <PlanFilters
      {elements}
      {elementCounts}
      on:change={handleFilterChange}
    />
  </div>

  <!-- Floor Plan Viewer -->
  <div class="col-span-9">
    <div class="card-info">
      <!-- Stats Bar -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex-row-md">
          <div class="text-sm">
            <span class="font-semibold">{elements.length}</span>
            <span class="text-gray-400">total elements</span>
          </div>
          <div class="flex-row-sm">
            {#each ELEMENT_TYPE_OPTIONS as type}
              {#if elementCounts[type.value] > 0}
                <div 
                  class="px-2 py-1 rounded text-xs flex items-center gap-1"
                  style="background-color: {type.color}20; border: 1px solid {type.color}40;"
                >
                  <span>{type.icon}</span>
                  <span class="font-medium">{elementCounts[type.value]}</span>
                </div>
              {/if}
            {/each}
          </div>
        </div>
        
        <div class="btn-group">
          <Button
            variant="secondary"
            size="small"
            icon="download"
            on:click={() => showReportModal = true}
          >
            Export Report
          </Button>
          <Button
            variant="secondary"
            size="small"
            icon="edit"
            on:click={() => showPlanInfoModal = true}
          >
            Edit Plan Info
          </Button>
        </div>
      </div>

      <!-- Image Container -->
      <div 
        bind:this={containerElement}
        class="relative border-2 border-slate-600 rounded-lg overflow-hidden bg-slate-900"
        style="min-height: 600px;"
      >
        {#if !imageLoaded}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
              <p class="text-gray-400">Loading floor plan...</p>
            </div>
          </div>
        {/if}
        
        <!-- Floor Plan Image -->
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
        <img
          bind:this={imageElement}
          src={plan.image_url}
          alt={plan.name}
          class="w-full h-auto cursor-crosshair"
          on:click={handleImageClick}
          on:load={handleImageLoad}
          style="display: {imageLoaded ? 'block' : 'none'};"
        />
        
        <!-- SVG Overlay for Elements -->
        {#if imageLoaded && imageElement}
          <svg
            class="absolute inset-0 w-full h-full"
            style="z-index: 10;"
          >
            {#each elements as element (element.id)}
              <ElementMarker
                {element}
                position={getPixelPosition(element)}
                isHovered={hoveredElement?.id === element.id}
                isFiltered={isElementFiltered(element)}
                on:click={() => handleElementClick(element)}
                on:mouseenter={() => handleElementHover(element)}
                on:mouseleave={handleElementLeave}
              />
            {/each}
          </svg>
        {/if}
        
        <!-- Hover Tooltip -->
        {#if hoveredElement && !isElementFiltered(hoveredElement)}
          {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === hoveredElement.element_type)}
          {@const pos = getPixelPosition(hoveredElement)}
          <div 
            class="absolute bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-sm pointer-events-none border border-slate-600"
            style="
              left: {pos.x}px;
              top: {pos.y - 60}px;
              transform: translateX(-50%);
              z-index: 20;
              max-width: 250px;
            "
          >
            <div class="font-semibold flex items-center gap-2">
              <span>{typeConfig?.icon}</span>
              <span>{hoveredElement.name}</span>
            </div>
            <div class="text-xs text-gray-300 mt-1">
              {hoveredElement.subtype || hoveredElement.element_type}
              {#if hoveredElement.asset_id}
                · {hoveredElement.asset_id}
              {/if}
            </div>
            {#if hoveredElement.status !== 'active'}
              <div class="text-xs text-amber-400 mt-1 capitalize">
                Status: {hoveredElement.status}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      
      <!-- Instructions -->
      <div class="mt-4 flex items-start gap-2 text-sm text-gray-400">
        <Icon name="info" size={5} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p>
          <strong>Click anywhere</strong> on the floor plan to add a new element, 
          or <strong>click existing markers</strong> to view and edit details.
          {#if hasActiveFilters}
            <span class="text-amber-400">Filters active - some elements are dimmed.</span>
          {/if}
        </p>
      </div>
    </div>

    <!-- Elements Table -->
    {#if elements.length > 0}
      <div class="bg-slate-800/50 rounded-lg p-6 mt-6">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <Icon name="table" size={5} className="text-purple-400" />
          Elements List
        </h3>
        
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-slate-700">
                <th class="text-left py-3 px-4 font-semibold text-sm">Type</th>
                <th class="text-left py-3 px-4 font-semibold text-sm">Name</th>
                <th class="text-left py-3 px-4 font-semibold text-sm">Subtype</th>
                <th class="text-left py-3 px-4 font-semibold text-sm">Asset ID</th>
                <th class="text-left py-3 px-4 font-semibold text-sm">Status</th>
                <th class="text-left py-3 px-4 font-semibold text-sm">Position</th>
                <th class="text-left py-3 px-4 font-semibold text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each sortedElementsForTable as element (element.id)}
                {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type)}
                {@const statusConfig = { active: 'text-green-400', inactive: 'text-gray-400', maintenance: 'text-amber-400', removed: 'text-red-400' }}
                <tr 
                  class="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                  on:click={() => handleElementClick(element)}
                >
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">{typeConfig?.icon}</span>
                      <span class="text-sm capitalize">{element.element_type}</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 font-medium">{element.name}</td>
                  <td class="py-3 px-4 text-sm text-gray-400">{element.subtype || '-'}</td>
                  <td class="py-3 px-4 text-sm text-gray-400">{element.asset_id || '-'}</td>
                  <td class="py-3 px-4">
                    <span class="text-sm capitalize {statusConfig[element.status] || 'text-gray-400'}">
                      {element.status}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-xs text-gray-500">
                    ({(element.x_position * 100).toFixed(1)}%, {(element.y_position * 100).toFixed(1)}%)
                  </td>
                  <td class="py-3 px-4">
                    <Button
                      variant="secondary"
                      size="small"
                      icon="edit"
                      on:click={(e) => {
                        e.stopPropagation();
                        handleElementClick(element);
                      }}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Element Modal -->
{#if showElementModal}
  <ElementModal
    element={selectedElement}
    position={newElementPosition}
    {plan}
    on:save={handleElementSave}
    on:delete={handleElementDelete}
    on:close={() => {
      showElementModal = false;
      selectedElement = null;
      newElementPosition = null;
    }}
  />
{/if}

<!-- Report Modal -->
{#if showReportModal}
  <PlansReport
    {plan}
    {elements}
    on:close={() => showReportModal = false}
  />
{/if}

<!-- Plan Info Modal -->
{#if showPlanInfoModal}
  <PlanInfoModal
    {plan}
    on:updated={() => {
      showPlanInfoModal = false;
      dispatch('planUpdated');
    }}
    on:deleted={() => {
      showPlanInfoModal = false;
      dispatch('planDeleted');
    }}
    on:close={() => showPlanInfoModal = false}
  />
{/if}
