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
  import CopyPlanModal from './CopyPlanModal.svelte';
  import { plansStore } from '../stores/plansStore';
  import {
    ELEMENT_TYPE_OPTIONS,
    ELEMENT_STATUS_OPTIONS,
    getElementDisplayName,
    getElementStatusConfig,
    getAttributeSummary
  } from '$lib/utils/planConstants';
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
  let showReportModal    = false;
  let showPlanInfoModal  = false;
  let showCopyModal      = false;
  let replacingImage     = false;
  let replaceImageError  = null;
  let replaceFileInput;   // bound to hidden <input type="file">
  let newElementPosition = null;
  let hoveredElement     = null;
  let imageLoaded        = false;
  let containerWidth     = 0;
  let containerHeight    = 0;

  // Drag-to-move state
  let dragElement  = null;
  let dragMoved    = false;
  let dragJustEnded = false;

  // New-element mode — must be explicitly enabled before clicking to place or dragging
  let newMode = false;

  let filters = {
    types:    [], statuses: [], searchText: '',
    lightFilters:    { subtypes: [], battery: [], emergency: false, movementSensor: false, lightSensor: false },
    communalFilters: { subtypes: [], security: [], retained: false },
    apartmentFilters:{},
    fireFilters:     { subtypes: [] }
  };

  // Only reload when plan.id changes
  let lastLoadedPlanId = null;
  $: if (plan?.id && plan.id !== lastLoadedPlanId) {
    lastLoadedPlanId = plan.id;
    loadElements();
  }

  $: elementCounts = elements.reduce((acc, el) => {
    acc[el.element_type] = (acc[el.element_type] || 0) + 1;
    return acc;
  }, {});

  // hasActiveFilters covers both top-level and attribute sub-filters
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
      result = result.filter(el =>
        el.label?.toLowerCase().includes(q)    ||
        el.asset_id?.toLowerCase().includes(q) ||
        el.subtype?.toLowerCase().includes(q)  ||
        getElementDisplayName(el, plan.floor_level).toLowerCase().includes(q)
      );
    }

    const lf = f.lightFilters;
    if (lf) {
      if (lf.subtypes?.length > 0)
        result = result.filter(el => el.element_type !== 'light' || lf.subtypes.includes(el.subtype));
      if (lf.battery?.length > 0)
        result = result.filter(el => el.element_type !== 'light' || lf.battery.includes(el.battery));
      if (lf.emergency)
        result = result.filter(el => el.element_type !== 'light' || el.emergency === true);
      if (lf.movementSensor)
        result = result.filter(el => el.element_type !== 'light' || el.movement_sensor === true);
      if (lf.lightSensor)
        result = result.filter(el => el.element_type !== 'light' || el.light_sensor === true);
    }

    const cf = f.communalFilters;
    if (cf) {
      if (cf.subtypes?.length > 0)
        result = result.filter(el => el.element_type !== 'communal_door' || cf.subtypes.includes(el.subtype));
      if (cf.security?.length > 0)
        result = result.filter(el => el.element_type !== 'communal_door' || cf.security.includes(el.security));
      if (cf.retained)
        result = result.filter(el => el.element_type !== 'communal_door' || el.retained === true);
    }

    const ff = f.fireFilters;
    if (ff?.subtypes?.length > 0)
      result = result.filter(el => el.element_type !== 'fire_control' || ff.subtypes.includes(el.subtype));

    return result;
  }

  function handleContainerClick(event) {
    if (!canEdit || dragJustEnded) return;
    if (!newMode) return;  // must be in New mode to place elements

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

    logger('Plan clicked at:', { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) });

    newElementPosition = { x: normalizedX, y: normalizedY };
    selectedElement    = null;
    showElementModal   = true;
  }

  function handleElementClick(element) {
    logger('Element clicked:', element.id, element.asset_id);
    selectedElement    = element;
    newElementPosition = null;
    showElementModal   = true;
  }

  function handleElementHover(element) { hoveredElement = element; }
  function handleElementLeave()        { hoveredElement = null; }

  // ── Drag-to-move ──────────────────────────────────────────────────────────
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

      const rect = imageElement.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const ny = Math.min(1, Math.max(0, (e.clientY - rect.top)  / rect.height));

      const movedEl    = dragElement;
      dragElement      = null;
      dragJustEnded    = true;
      setTimeout(() => { dragJustEnded = false; }, 50);

      try {
        await plansStore.updateElement(movedEl.id, { x_position: nx, y_position: ny });
        logger('✅ Element moved:', movedEl.id);
        await loadElements();
      } catch (error) {
        logger('❌ Error moving element:', error.message);
        await loadElements();
        alert('Failed to move element: ' + error.message);
      }
    };

    window.addEventListener('mousemove', onMousemove);
    window.addEventListener('mouseup',   onMouseup);
  }
  // ─────────────────────────────────────────────────────────────────────────

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
      showElementModal   = false;
      selectedElement    = null;
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
      selectedElement  = null;
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

  function getPixelPosition(element) {
    if (!imageElement) return { x: 0, y: 0 };
    const rect = imageElement.getBoundingClientRect();
    return {
      x: element.x_position * rect.width,
      y: element.y_position * rect.height
    };
  }
  // ── Replace plan image ────────────────────────────────────────────────────
  async function handleReplaceImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    replacingImage    = true;
    replaceImageError = null;
    try {
      await plansStore.replaceImage(plan, file);
      dispatch('planUpdated');
      logger('✅ Plan image replaced');
    } catch (err) {
      replaceImageError = err.message;
      logger('❌ Replace image error:', err.message);
    } finally {
      replacingImage = false;
      // Reset file input so the same file can be re-selected if needed
      if (replaceFileInput) replaceFileInput.value = '';
    }
  }

</script>

<div class="grid grid-cols-12 gap-6">
  <!-- Filters Sidebar -->
  <div class="col-span-3">
    <PlanFilters {elements} {elementCounts} on:change={handleFilterChange} />
  </div>

  <!-- Floor Plan Viewer -->
  <div class="col-span-9">
    <div class="card-info">
      <!-- Stats Bar -->
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
          {#if isAdmin}
            <Button
              variant={newMode ? 'primary' : 'secondary'}
              size="small"
              icon={newMode ? 'close' : 'plus'}
              on:click={() => newMode = !newMode}
            >
              {newMode ? 'New Off' : 'New'}
            </Button>
            <Button variant="secondary" size="small" icon="copy" on:click={() => showCopyModal = true}>
              Copy
            </Button>
          {/if}
          <Button variant="secondary" size="small" icon="download" on:click={() => showReportModal = true}>
            Create Report
          </Button>
          {#if isAdmin}
            <Button variant="secondary" size="small" icon="edit" on:click={() => showPlanInfoModal = true}>
              Edit Info
            </Button>
            <!-- Hidden file input for image replacement -->
            <input
              type="file"
              accept="image/*"
              bind:this={replaceFileInput}
              on:change={handleReplaceImage}
              class="hidden"
            />
            <Button
              variant="secondary"
              size="small"
              icon={replacingImage ? 'loading' : 'upload'}
              disabled={replacingImage}
              on:click={() => replaceFileInput.click()}
            >
              {replacingImage ? 'Replacing…' : 'Image'}
            </Button>
          {/if}
          {#if replaceImageError}
            <span class="text-xs text-red-400">{replaceImageError}</span>
          {/if}
        </div>
      </div>

      <!-- Image Container -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        bind:this={containerElement}
        class="relative border-2 border-slate-600 rounded-lg overflow-hidden bg-slate-900"
        style="min-height: 600px; cursor: {newMode && canEdit ? 'crosshair' : 'default'};"
        on:click={handleContainerClick}
      >
        {#if !imageLoaded}
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
              <p class="text-gray-400">Loading floor plan...</p>
            </div>
          </div>
        {/if}

        <img
          bind:this={imageElement}
          src={plan.image_url}
          alt={plan.building}
          class="w-full h-auto"
          on:load={handleImageLoad}
          style="display: {imageLoaded ? 'block' : 'none'};"
        />

        {#if imageLoaded && imageElement}
          <svg class="absolute inset-0 w-full h-full" style="z-index: 10; pointer-events: none;">
            {#each filteredElements as element (element.id)}
              <ElementMarker
                {element}
                floorLevel={plan.floor_level}
                position={getPixelPosition(element)}
                isHovered={hoveredElement?.id === element.id}
                isDragging={dragElement?.id === element.id}
                isFiltered={false}
                on:mousedown={(e) => handleMarkerMousedown(e, element)}
                on:click={() => { if (!dragMoved) handleElementClick(element); }}
                on:mouseenter={() => handleElementHover(element)}
                on:mouseleave={handleElementLeave}
              />
            {/each}
          </svg>
        {/if}

        <!-- Hover Tooltip -->
        {#if hoveredElement && filteredElementIds.has(hoveredElement.id)}
          {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === hoveredElement.element_type)}
          {@const pos = getPixelPosition(hoveredElement)}
          <div
            class="absolute bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-sm pointer-events-none border border-slate-600"
            style="left:{pos.x}px; top:{pos.y + 40}px; transform:translateX(-50%); z-index:20; max-width:250px;"
          >
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

      <!-- Instructions -->
      <div class="mt-4 flex items-start gap-2 text-sm text-gray-400">
        <Icon name="info" size={5} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p>
          {#if !canEdit}
            <strong>Click markers</strong> to view element details.
            <span class="text-amber-400"> Read-only access — editing is disabled.</span>
          {:else if canEdit}
            {#if newMode}
              <span class="text-green-400 font-medium">New mode on</span> —
              <strong>click anywhere</strong> on the plan to place a new element,
              or <strong>drag a marker</strong> to move it.
              Click <strong>New Off</strong> when done.
            {:else}
              <strong>Click a marker</strong> to view or edit details.
              Enable <strong>New</strong> mode to place or move elements.
            {/if}
          {/if}
          {#if hasActiveFilters}
            <span class="text-amber-400 ml-1">
              Filters active — {elements.length - filteredElements.length} elements hidden.
            </span>
          {/if}
        </p>
      </div>
    </div>

    <!-- Elements Table -->
    {#if elements.length > 0}
      <div class="bg-slate-800/50 rounded-lg p-6 mt-6">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <Icon name="table" size={5} className="text-purple-400" />
          Inventory
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-slate-700">
                {#each ['Type','Name','Label','Subtype','Attributes','Status','Actions'] as col}
                  <th class="text-left py-3 px-4 font-semibold text-sm">{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each sortedElementsForTable as element (element.id)}
                {@const typeConfig   = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type)}
                {@const statusConfig = getElementStatusConfig(element.status)}
                <tr
                  class="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                  on:click={() => handleElementClick(element)}
                >
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">{typeConfig?.icon}</span>
                      <span class="text-sm">{typeConfig?.label ?? element.element_type}</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 font-medium font-mono text-sm">{getElementDisplayName(element, plan.floor_level)}</td>
                  <td class="py-3 px-4 text-sm text-gray-400">{element.label   || '—'}</td>
                  <td class="py-3 px-4 text-sm text-gray-400">{element.subtype || '—'}</td>
                  <td class="py-3 px-4 text-xs text-gray-400">{getAttributeSummary(element)}</td>
                  <td class="py-3 px-4">
                    <span class="text-sm font-medium" style="color: {statusConfig?.color ?? '#9ca3af'}">
                      {statusConfig?.label ?? element.status}
                    </span>
                  </td>
                  <td class="py-3 px-4">
                    <Button
                      variant="secondary"
                      size="small"
                      icon={canEdit ? 'edit' : 'eye'}
                      on:click={(e) => { e.stopPropagation(); handleElementClick(element); }}
                    >
                      {canEdit ? 'Edit' : 'View'}
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

<!-- Modals -->
{#if showElementModal}
  <ElementModal
    element={selectedElement}
    position={newElementPosition}
    {plan}
    on:save={handleElementSave}
    on:delete={handleElementDelete}
    on:close={() => { showElementModal = false; selectedElement = null; newElementPosition = null; }}
  />
{/if}

{#if showReportModal}
  <PlansReport {plan} {elements} {filters} on:close={() => showReportModal = false} />
{/if}

{#if showPlanInfoModal}
  <PlanInfoModal
    {plan}
    elementCount={elements.length}
    on:updated={() => { showPlanInfoModal = false; dispatch('planUpdated'); }}
    on:deleted={() => { showPlanInfoModal = false; dispatch('planDeleted'); }}
    on:close={() => showPlanInfoModal = false}
  />
{/if}

{#if showCopyModal}
  <CopyPlanModal
    {plan}
    {elements}
    on:copied={(e) => { showCopyModal = false; dispatch('planCopied', { planId: e.detail.planId }); }}
    on:close={() => showCopyModal = false}
  />
{/if}
