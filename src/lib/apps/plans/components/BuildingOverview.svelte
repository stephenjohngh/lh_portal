<!-- src/lib/apps/plans/components/BuildingOverview.svelte -->
<!-- Building-wide overview showing all elements across all floors with filters -->
<script>
  import { onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import PlanFilters from './PlanFilters.svelte';
  import ElementModal from './ElementModal.svelte';
  import { plansStore } from '../stores/plansStore';
  import {
    ELEMENT_TYPE_OPTIONS,
    ELEMENT_STATUS_OPTIONS,
    FLOOR_LEVELS,
    getElementDisplayName,
    getElementStatusConfig,
    getAttributeSummary
  } from '$lib/utils/planConstants';
  import { permissions } from '$lib/stores/permissions';

  const logger = getLogger('BuildingOverview');

  export let plans = [];
  export let buildingImageUrl = null;  // Optional building image

  $: isAdmin = $permissions.isAdmin;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  let allElements = [];
  let loading = true;
  let selectedElement = null;
  let showElementModal = false;

  let filters = {
    types: [], statuses: [], searchText: '',
    lightFilters:     { subtypes: [], battery: [], emergency: false, movementSensor: false, lightSensor: false },
    communalFilters:  { subtypes: [], security: [], retained: false },
    apartmentFilters: {},
    fireFilters:      { subtypes: [] }
  };

  $: elementCounts = allElements.reduce((acc, el) => {
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

  $: filteredElements = hasActiveFilters ? applyFilters(allElements, filters) : allElements;

  $: sortedElements = [...filteredElements].sort((a, b) => {
    // Sort by floor level first (using standard order)
    const floorA = a.floor_level ?? '';
    const floorB = b.floor_level ?? '';
    const floorOrder = getFloorOrder(floorA) - getFloorOrder(floorB);
    if (floorOrder !== 0) return floorOrder;

    // Then by element type
    if (a.element_type !== b.element_type) return a.element_type.localeCompare(b.element_type);

    // Finally by asset ID
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });

  onMount(async () => {
    await loadAllElements();
  });

  async function loadAllElements() {
    logger('Loading all elements across all floors');
    loading = true;
    try {
      const elementsWithFloor = [];
      
      for (const plan of plans) {
        const elements = await plansStore.loadElements(plan.id);
        
        // Add floor_level and plan_name to each element for display
        elements.forEach(el => {
          elementsWithFloor.push({
            ...el,
            floor_level: plan.floor_level,
            plan_name: plan.name,
            building: plan.building,
            plan_id: plan.id
          });
        });
      }
      
      allElements = elementsWithFloor;
      logger('✅ Loaded', allElements.length, 'elements across', plans.length, 'floors');
    } catch (error) {
      logger('❌ Error loading elements:', error.message);
    } finally {
      loading = false;
    }
  }

  function getFloorOrder(floorLevel) {
    const order = { 'L': 0, 'U': 1, 'G': 2, '1': 3, '2': 4, '3': 5, '4': 6, '5': 7, '6': 8, '7': 9 };
    return order[String(floorLevel)] ?? 999;
  }

  function applyFilters(allEls, f) {
    let result = [...allEls];

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
        el.notes?.toLowerCase().includes(q)    ||
        getElementDisplayName(el, el.floor_level).toLowerCase().includes(q)
      );
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

  function handleFilterChange(event) {
    filters = event.detail;
  }

  function handleElementClick(element) {
    selectedElement = element;
    showElementModal = true;
  }

  async function handleElementSave(event) {
    const { element, isNew } = event.detail;
    try {
      if (!isNew) {
        await plansStore.updateElement(element.id, element);
      }
      await loadAllElements();
      showElementModal = false;
      selectedElement = null;
    } catch (error) {
      alert('Failed to save element: ' + error.message);
    }
  }

  async function handleElementDelete(event) {
    const { elementId, planId } = event.detail;
    try {
      await plansStore.deleteElement(elementId, planId);
      await loadAllElements();
      showElementModal = false;
      selectedElement = null;
    } catch (error) {
      alert('Failed to delete element: ' + error.message);
    }
  }

  function getFloorLabel(floorLevel) {
    const level = FLOOR_LEVELS.find(f => f.value === String(floorLevel));
    return level ? level.label : `Floor ${floorLevel}`;
  }
</script>

<div class="grid grid-cols-12 gap-6">
  <!-- Filters Sidebar -->
  <div class="col-span-3">
    <PlanFilters elements={allElements} {elementCounts} on:change={handleFilterChange} />
  </div>

  <!-- Main Content -->
  <div class="col-span-9">
    <div class="card-info">
      <!-- Stats Bar -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex-row-md">
          <div class="text-sm">
            <span class="font-semibold">{allElements.length}</span>
            <span class="text-gray-400"> total elements across </span>
            <span class="font-semibold">{plans.length}</span>
            <span class="text-gray-400"> floors</span>
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
      </div>

      <!-- Building Image Preview (if provided) -->
      {#if buildingImageUrl}
        <div class="mb-6 border-2 border-slate-600 rounded-lg overflow-hidden bg-slate-900">
          <img
            src={buildingImageUrl}
            alt="Building"
            class="w-full h-auto max-h-96 object-contain"
          />
        </div>
      {/if}

      <!-- Info Box -->
      <div class="mb-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
        <div class="flex items-start gap-3">
          <Icon name="info" size={5} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <div class="text-sm text-gray-300">
            <p class="font-semibold mb-1">Building Overview</p>
            <p>
              This view shows all elements across all floors in the building. 
              Use filters to narrow down results. Click any element to view details.
              {#if hasActiveFilters}
                <span class="text-amber-400 ml-1">
                  Filters active — {allElements.length - filteredElements.length} elements hidden.
                </span>
              {/if}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Elements Table -->
    {#if loading}
      <div class="bg-slate-800/50 rounded-lg p-12 text-center">
        <Icon name="loading" size={12} className="animate-spin mx-auto mb-4 text-purple-400" />
        <p class="text-gray-400">Loading all elements...</p>
      </div>
    {:else if allElements.length === 0}
      <div class="bg-slate-800/50 rounded-lg p-12 text-center">
        <Icon name="map" size={12} className="text-gray-600 mx-auto mb-4" />
        <h3 class="text-xl font-bold mb-2">No Elements Found</h3>
        <p class="text-gray-400">No elements have been added to any floor plans yet.</p>
      </div>
    {:else}
      <div class="bg-slate-800/50 rounded-lg p-6">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <Icon name="table" size={5} className="text-purple-400" />
          Building Inventory
          <span class="text-sm font-normal text-gray-400">
            ({filteredElements.length} {filteredElements.length === 1 ? 'element' : 'elements'})
          </span>
        </h3>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead>
              <tr class="border-b border-slate-700">
                {#each ['Floor','Type','Name','Label','Subtype','Attributes','Status','Actions'] as col}
                  <th class="text-left py-3 px-4 font-semibold text-sm">{col}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each sortedElements as element (element.id)}
                {@const typeConfig   = ELEMENT_TYPE_OPTIONS.find(t => t.value === element.element_type)}
                {@const statusConfig = getElementStatusConfig(element.status)}
                <tr
                  class="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                  on:click={() => handleElementClick(element)}
                >
                  <td class="py-3 px-4">
                    <div class="text-sm font-medium text-purple-400">
                      {getFloorLabel(element.floor_level)}
                    </div>
                    <div class="text-xs text-gray-500">{element.building}</div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <span class="text-lg">{typeConfig?.icon}</span>
                      <span class="text-sm">{typeConfig?.label ?? element.element_type}</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 font-medium font-mono text-sm">{getElementDisplayName(element, element.floor_level)}</td>
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

<!-- Element Modal -->
{#if showElementModal && selectedElement}
  {@const plan = plans.find(p => p.id === selectedElement.plan_id)}
  <ElementModal
    element={selectedElement}
    position={null}
    {plan}
    on:save={handleElementSave}
    on:delete={handleElementDelete}
    on:close={() => { showElementModal = false; selectedElement = null; }}
  />
{/if}
