<!-- src/lib/apps/plans/components/PlanViewer.svelte -->
<!-- FINAL: Removed Edit/View button, notes search working, removed unused Badge import -->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ElementMarker from './ElementMarker.svelte';
  import ElementModal from './ElementModal.svelte';
  import PlanFilters from './PlanFilters.svelte';
  import PlanInfoModal from './PlanInfoModal.svelte';
  import CopyPlanModal from './CopyPlanModal.svelte';
  import PlansReport from './reports/PlansReport.svelte';
  import { plansStore } from '../stores/plansStore';
  import {
    ELEMENT_TYPE_OPTIONS,
    ELEMENT_STATUS_OPTIONS,
    getElementDisplayName,
    getElementStatusConfig,
    getAttributeSummary
  } from '$lib/utils/planConstants';
  import { formatNotesForDisplay, parseNotesValue } from '$lib/utils/notesParser';
  import { permissions } from '$lib/stores/permissions';

  const logger = getLogger('PlanViewer');
  const dispatch = createEventDispatcher();

  export let plan;

  $: isAdmin  = $permissions.isAdmin;
  $: canEdit  = $permissions.isAdmin || $permissions.canModify;

  let imageElement;
  let containerElement;
  let elements           = [];
  let selectedElement    = null;
  let showElementModal   = false;
  let showPlanInfoModal  = false;
  let showCopyModal      = false;
  let showPlanReport     = false;
  let replacingImage     = false;
  let replaceImageError  = null;
  let replaceFileInput;
  let newElementPosition = null;
  let hoveredElement     = null;
  let imageLoaded        = false;
  let containerWidth     = 0;
  let containerHeight    = 0;

  let dragElement   = null;
  let dragMoved     = false;
  let dragJustEnded = false;

  let newMode = false;

  // View mode for inventory section
  let inventoryView = 'list'; // 'list' or 'summary'

  let filters = {
    types: [], statuses: [], searchText: '',
    lightFilters:     { subtypes: [], battery: [], emergency: false, movementSensor: false, lightSensor: false },
    communalFilters:  { subtypes: [], security: [], retained: false },
    apartmentFilters: {},
    fireFilters:      { subtypes: [] }
  };

  let lastLoadedPlanId = null;
  $: if (plan?.id && plan.id !== lastLoadedPlanId) {
    lastLoadedPlanId = plan.id;
    loadElements();
  }

  $: elementCounts = elements.reduce((acc, el) => {
    acc[el.element_type] = (acc[el.element_type] || 0) + 1;
    return acc;
  }, {});

  $: hasActiveFilters = (
    filters.types.length > 0 || filters.statuses.length > 0 || filters.searchText.length > 0 ||
    (filters.lightFilters?.subtypes?.length  > 0) || (filters.lightFilters?.battery?.length > 0) ||
    filters.lightFilters?.emergency || filters.lightFilters?.movementSensor || filters.lightFilters?.lightSensor ||
    (filters.communalFilters?.subtypes?.length > 0) || (filters.communalFilters?.security?.length > 0) ||
    filters.communalFilters?.retained ||
    (filters.fireFilters?.subtypes?.length > 0)
  );

  $: filteredElements   = hasActiveFilters ? applyFilters(elements, filters) : elements;
  $: filteredElementIds = new Set(filteredElements.map(e => e.id));

  $: sortedElementsForTable = [...filteredElements].sort((a, b) => {
    if (a.element_type !== b.element_type) return a.element_type.localeCompare(b.element_type);
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });

  // Calculate summary data from filtered elements
  $: summaryData = (() => {
    const summary = {};
    filteredElements.forEach(el => {
      const type = el.element_type;
      const subtype = el.subtype || 'No subtype';
      const status = el.status;
      
      if (!summary[type]) summary[type] = {};
      if (!summary[type][subtype]) summary[type][subtype] = {};
      if (!summary[type][subtype][status]) summary[type][subtype][status] = 0;
      
      summary[type][subtype][status]++;
    });
    return summary;
  })();

  onMount(() => {
    const ro = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        containerWidth  = width;
        containerHeight = height;
      }
    });
    if (containerElement) ro.observe(containerElement);
    return () => ro.disconnect();
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

  function applyFilters(allElements, f) {
    let result = [...allElements];

    if (f.types.length > 0)
      result = result.filter(el => f.types.includes(el.element_type));
    if (f.statuses.length > 0)
      result = result.filter(el => f.statuses.includes(el.status));
    if (f.searchText) {
      const q = f.searchText.toLowerCase();
      result = result.filter(el => {
        const notesValue = parseNotesValue(el.notes || '').toLowerCase();
        return (
          el.label?.toLowerCase().includes(q)    ||
          el.asset_id?.toLowerCase().includes(q) ||
          el.subtype?.toLowerCase().includes(q)  ||
          notesValue.includes(q)                 ||
          getElementDisplayName(el, plan.floor_level).toLowerCase().includes(q)
        );
      });
    }

    const lf = f.lightFilters;
    if (lf) {
      if (lf.subtypes?.length > 0) result = result.filter(el => el.element_type !== 'light' || lf.subtypes.includes(el.subtype));
      if (lf.battery?.length  > 0) result = result.filter(el => el.element_type !== 'light' || lf.battery.includes(el.battery));
      if (lf.emergency)             result = result.filter(el => el.element_type !== 'light' || el.emergency === true);
      if (lf.movementSensor)        result = result.filter(el => el.element_type !== 'light' || el.movement_sensor === true);
      if (lf.lightSensor)           result = result.filter(el => el.element_type !== 'light' || el.light_sensor === true);
    }

    const cf = f.communalFilters;
    if (cf) {
      if (cf.subtypes?.length > 0) result = result.filter(el => el.element_type !== 'communal_door' || cf.subtypes.includes(el.subtype));
      if (cf.security?.length > 0) result = result.filter(el => el.element_type !== 'communal_door' || cf.security.includes(el.security));
      if (cf.retained)              result = result.filter(el => el.element_type !== 'communal_door' || el.retained === true);
    }

    const ff = f.fireFilters;
    if (ff?.subtypes?.length > 0)
      result = result.filter(el => el.element_type !== 'fire_control' || ff.subtypes.includes(el.subtype));

    return result;
  }

  function handleContainerClick(event) {
    if (!canEdit || dragJustEnded || !newMode) return;

    let node = event.target;
    while (node && node !== containerElement) {
      if (node.classList?.contains('element-marker-group')) return;
      node = node.parentNode;
    }

    if (!imageElement || !imageLoaded) return;

    const rect = imageElement.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top  || event.clientY > rect.bottom) return;

    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top)  / rect.height;

    newElementPosition = { x: normalizedX, y: normalizedY };
    selectedElement    = null;
    showElementModal   = true;
  }

  function handleElementClick(element) {
    selectedElement    = element;
    newElementPosition = null;
    showElementModal   = true;
  }

  function handleElementHover(element) { hoveredElement = element; }
  function handleElementLeave()        { hoveredElement = null; }

  function handleMarkerMousedown(event, element) {
    if (!canEdit || !newMode) return;
    event.stopPropagation();
    dragElement = element;
    dragMoved   = false;

    const onMousemove = (e) => {
      if (!dragElement || !imageElement) return;
      const rect = imageElement.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - rect.top)  / rect.height));
      dragMoved = true;
      elements  = elements.map(el =>
        el.id === dragElement.id ? { ...el, x_position: nx, y_position: ny } : el
      );
    };

    const onMouseup = async (e) => {
      window.removeEventListener('mousemove', onMousemove);
      window.removeEventListener('mouseup',   onMouseup);
      if (!dragMoved || !dragElement || !imageElement) { dragElement = null; return; }

      const rect  = imageElement.getBoundingClientRect();
      const nx    = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const ny    = Math.min(1, Math.max(0, (e.clientY - rect.top)  / rect.height));
      const moved = dragElement;
      dragElement   = null;
      dragJustEnded = true;
      setTimeout(() => { dragJustEnded = false; }, 50);

      try {
        await plansStore.updateElement(moved.id, { x_position: nx, y_position: ny });
        await loadElements();
      } catch (error) {
        await loadElements();
        alert('Failed to move element: ' + error.message);
      }
    };

    window.addEventListener('mousemove', onMousemove);
    window.addEventListener('mouseup',   onMouseup);
  }

  async function handleElementSave(event) {
    const { element, isNew } = event.detail;
    try {
      if (isNew) {
        await plansStore.createElement(plan.id, element);
      } else {
        await plansStore.updateElement(element.id, element);
      }
      await loadElements();
      showElementModal   = false;
      selectedElement    = null;
      newElementPosition = null;
    } catch (error) {
      alert('Failed to save element: ' + error.message);
    }
  }

  async function handleElementDelete(event) {
    const { elementId, planId } = event.detail;
    try {
      await plansStore.deleteElement(elementId, planId);
      await loadElements();
      showElementModal = false;
      selectedElement  = null;
    } catch (error) {
      alert('Failed to delete element: ' + error.message);
    }
  }

  function handleFilterChange(event) { filters = event.detail; }
  function handleImageLoad()         { imageLoaded = true; }

  function getPixelPosition(element) {
    if (!imageElement) return { x: 0, y: 0 };
    const rect = imageElement.getBoundingClientRect();
    return { x: element.x_position * rect.width, y: element.y_position * rect.height };
  }

  async function handleReplaceImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    replacingImage    = true;
    replaceImageError = null;
    try {
      await plansStore.replaceImage(plan, file);
      dispatch('planUpdated');
    } catch (err) {
      replaceImageError = err.message;
    } finally {
      replacingImage = false;
      if (replaceFileInput) replaceFileInput.value = '';
    }
  }

  $: allPlansInBuilding = $plansStore.plans.filter(p => p.building === plan.building);
</script>

<div class="grid grid-cols-12 gap-6">
  <div class="col-span-3">
    <PlanFilters {elements} {elementCounts} on:change={handleFilterChange} />
  </div>

  <div class="col-span-9">
    <div class="card-info">
      <div class="flex items-center justify-between mb-4">
        <div class="flex-row-md">
          <div class="text-sm">
            <span class="font-semibold">{elements.length}</span>
            <span class="text-gray-400"> total elements</span>
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
          <Button variant="secondary" size="small" icon="download" on:click={() => showPlanReport = true}>
            Report
          </Button>
          {#if isAdmin}
            <Button variant={newMode ? 'primary' : 'secondary'} size="small" icon={newMode ? 'close' : 'plus'}
              on:click={() => newMode = !newMode}>
              {newMode ? 'New Off' : 'New'}
            </Button>
            <Button variant="secondary" size="small" icon="copy" on:click={() => showCopyModal = true}>
              Copy
            </Button>
            <Button variant="secondary" size="small" icon="edit" on:click={() => showPlanInfoModal = true}>
              Edit Info
            </Button>
            <input type="file" accept="image/*" bind:this={replaceFileInput} on:change={handleReplaceImage} class="hidden" />
            <Button variant="secondary" size="small" icon={replacingImage ? 'loading' : 'upload'} disabled={replacingImage}
              on:click={() => replaceFileInput.click()}>
              {replacingImage ? 'Replacing…' : 'Image'}
            </Button>
          {/if}
          {#if replaceImageError}
            <span class="text-xs text-red-400">{replaceImageError}</span>
          {/if}
        </div>
      </div>

      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div bind:this={containerElement} class="relative border-2 border-slate-600 rounded-lg overflow-hidden bg-slate-900"
        style="min-height: 600px; cursor: {newMode && canEdit ? 'crosshair' : 'default'};" on:click={handleContainerClick}>
        {#if !imageLoaded}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
              <p class="text-gray-400">Loading floor plan...</p>
            </div>
          </div>
        {/if}

        <img bind:this={imageElement} src={plan.image_url} alt={plan.building} class="w-full h-auto" on:load={handleImageLoad}
          style="display: {imageLoaded ? 'block' : 'none'};" />

        {#if imageLoaded && imageElement}
          <svg class="absolute inset-0 w-full h-full" style="z-index: 10; pointer-events: none;">
            {#each filteredElements as element (element.id)}
              <ElementMarker {element} floorLevel={plan.floor_level} position={getPixelPosition(element)}
                isHovered={hoveredElement?.id === element.id} isDragging={dragElement?.id === element.id} isFiltered={false}
                on:mousedown={(e) => handleMarkerMousedown(e, element)}
                on:click={() => { if (!dragMoved) handleElementClick(element); }}
                on:mouseenter={() => handleElementHover(element)}
                on:mouseleave={handleElementLeave} />
            {/each}
          </svg>
        {/if}

        {#if hoveredElement && filteredElementIds.has(hoveredElement.id)}
          {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === hoveredElement.element_type)}
          {@const pos = getPixelPosition(hoveredElement)}
          <div class="absolute bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-sm pointer-events-none border border-slate-600"
            style="left:{pos.x}px; top:{pos.y + 22}px; transform:translateX(-50%); z-index:20; max-width:250px;">
            <div class="font-semibold flex items-center gap-2">
              <span>{typeConfig?.icon}</span>
              <span>{getElementDisplayName(hoveredElement, plan.floor_level)}</span>
            </div>
            {#if hoveredElement.label}
              <div class="text-xs text-gray-200 mt-0.5">{hoveredElement.label}</div>
            {/if}
            <div class="text-xs text-gray-400 mt-0.5">{hoveredElement.subtype || hoveredElement.element_type}</div>
            {#if hoveredElement.status !== 'active'}
              <div class="text-xs text-amber-400 mt-1 capitalize">Status: {hoveredElement.status}</div>
            {/if}
          </div>
        {/if}
      </div>

      <div class="mt-4 flex items-start gap-2 text-sm text-gray-400">
        <Icon name="info" size={5} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p>
          {#if !canEdit}
            <strong>Click markers</strong> to view element details.
            <span class="text-amber-400"> Read-only access — editing is disabled.</span>
          {:else if newMode}
            <span class="text-green-400 font-medium">New mode on</span> —
            <strong>click anywhere</strong> on the plan to place a new element,
            or <strong>drag a marker</strong> to move it.
            Click <strong>New Off</strong> when done.
          {:else}
            <strong>Click a marker</strong> to view or edit details.
            Enable <strong>New</strong> mode to place or move elements.
          {/if}
          {#if hasActiveFilters}
            <span class="text-amber-400 ml-1">
              Filters active — {elements.length - filteredElements.length} elements hidden.
            </span>
          {/if}
        </p>
      </div>
    </div>

    {#if elements.length > 0}
      <div class="bg-slate-800/50 rounded-lg p-6 mt-6">
        <!-- Tab Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-4">
            <h3 class="text-xl font-bold flex items-center gap-2">
              <Icon name="table" size={5} className="text-purple-400" />
              Inventory
            </h3>
            <!-- Tab Switcher -->
            <div class="flex gap-1 border border-slate-600 rounded-lg p-1">
              <button
                class="px-3 py-1 text-sm rounded transition-colors"
                class:bg-purple-600={inventoryView === 'list'}
                class:text-white={inventoryView === 'list'}
                class:text-gray-400={inventoryView !== 'list'}
                class:hover:text-white={inventoryView !== 'list'}
                on:click={() => inventoryView = 'list'}
              >
                List
              </button>
              <button
                class="px-3 py-1 text-sm rounded transition-colors"
                class:bg-purple-600={inventoryView === 'summary'}
                class:text-white={inventoryView === 'summary'}
                class:text-gray-400={inventoryView !== 'summary'}
                class:hover:text-white={inventoryView !== 'summary'}
                on:click={() => inventoryView = 'summary'}
              >
                Summary
              </button>
            </div>
          </div>
          <div class="text-sm text-gray-400">
            {filteredElements.length} element{filteredElements.length !== 1 ? 's' : ''}
          </div>
        </div>

        <!-- List View -->
        {#if inventoryView === 'list'}
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-slate-700">
                  {#each ['Type','Name','Label','Subtype','Notes','Attributes','Status'] as col}
                    <th class="text-left py-3 px-4 font-semibold text-sm">{col}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each sortedElementsForTable as element (element.id)}
                  {@const typeConfig   = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type)}
                  {@const statusConfig = getElementStatusConfig(element.status)}
                  <tr class="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                    on:click={() => handleElementClick(element)}>
                    <td class="py-3 px-4">
                      <span class="text-sm">{typeConfig?.label ?? element.element_type}</span>
                    </td>
                    <td class="py-3 px-4 font-medium font-mono text-sm">{getElementDisplayName(element, plan.floor_level)}</td>
                    <td class="py-3 px-4 text-sm text-gray-400">{element.label || '—'}</td>
                    <td class="py-3 px-4 text-sm text-gray-400">{element.subtype || '—'}</td>
                    <td class="py-3 px-4 text-xs text-gray-400">{formatNotesForDisplay(element.notes, 40)}</td>
                    <td class="py-3 px-4 text-xs text-gray-400">{getAttributeSummary(element)}</td>
                    <td class="py-3 px-4">
                      <span class="text-sm font-medium" style="color: {statusConfig?.color ?? '#9ca3af'}">
                        {statusConfig?.label ?? element.status}
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        
        <!-- Summary View -->
        {:else if inventoryView === 'summary'}
          <div class="space-y-6">
            {#each Object.entries(summaryData).sort(([a], [b]) => a.localeCompare(b)) as [type, subtypes]}
              {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === type)}
              {@const typeTotal = Object.values(subtypes).reduce((sum, statuses) => 
                sum + Object.values(statuses).reduce((s, count) => s + count, 0), 0)}
              
              <div class="bg-slate-700/40 rounded-lg p-4">
                <!-- Type Header -->
                <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-600">
                  <div class="flex items-center gap-2">
                    <span class="text-2xl">{typeConfig?.icon || '📦'}</span>
                    <h4 class="text-lg font-semibold text-white">{typeConfig?.label ?? type}</h4>
                  </div>
                  <span class="text-lg font-bold text-purple-300">{typeTotal}</span>
                </div>
                
                <!-- Subtypes -->
                <div class="space-y-2">
                  {#each Object.entries(subtypes).sort(([a], [b]) => a.localeCompare(b)) as [subtype, statuses]}
                    {@const subtypeTotal = Object.values(statuses).reduce((sum, count) => sum + count, 0)}
                    
                    <div class="flex items-center justify-between py-2 px-3 rounded bg-slate-800/50 hover:bg-slate-800/70 transition-colors">
                      <div class="flex-1">
                        <div class="font-medium text-sm text-gray-200">{subtype}</div>
                        <!-- Status breakdown -->
                        <div class="flex gap-3 mt-1 text-xs">
                          {#each Object.entries(statuses) as [status, count]}
                            {@const statusConfig = getElementStatusConfig(status)}
                            <span class="flex items-center gap-1">
                              <span class="w-2 h-2 rounded-full" style="background-color: {statusConfig?.color ?? '#9ca3af'}"></span>
                              <span class="text-gray-400">{statusConfig?.label ?? status}:</span>
                              <span class="text-white font-medium">{count}</span>
                            </span>
                          {/each}
                        </div>
                      </div>
                      <div class="text-right ml-4">
                        <span class="text-lg font-semibold text-purple-300">{subtypeTotal}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}

            <!-- Grand Total -->
            {#if Object.keys(summaryData).length > 0}
              {@const grandTotal = Object.values(summaryData).reduce((sum, subtypes) => 
                sum + Object.values(subtypes).reduce((s, statuses) => 
                  s + Object.values(statuses).reduce((ss, count) => ss + count, 0), 0), 0)}
              
              <div class="bg-purple-600/20 border border-purple-500/50 rounded-lg p-4">
                <div class="flex items-center justify-between">
                  <span class="text-lg font-bold text-white">Grand Total</span>
                  <span class="text-2xl font-bold text-purple-300">{grandTotal}</span>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

{#if showElementModal}
  <ElementModal element={selectedElement} position={newElementPosition} {plan}
    on:save={handleElementSave} on:delete={handleElementDelete}
    on:close={() => { showElementModal = false; selectedElement = null; newElementPosition = null; }} />
{/if}

{#if showPlanInfoModal}
  <PlanInfoModal {plan} elementCount={elements.length}
    on:updated={() => { showPlanInfoModal = false; dispatch('planUpdated'); }}
    on:deleted={() => { showPlanInfoModal = false; dispatch('planDeleted'); }}
    on:close={() => showPlanInfoModal = false} />
{/if}

{#if showCopyModal}
  <CopyPlanModal {plan} {elements}
    on:copied={(e) => { showCopyModal = false; dispatch('planCopied', { planId: e.detail.planId }); }}
    on:close={() => showCopyModal = false} />
{/if}

{#if showPlanReport && allPlansInBuilding.length > 0}
  <PlansReport plans={allPlansInBuilding} contextSource="floor" contextPlanId={plan.id} initialFilters={filters}
    on:close={() => showPlanReport = false} />
{/if}
