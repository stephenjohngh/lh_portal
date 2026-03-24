<!-- src/lib/apps/plans/components/BuildingOverview.svelte -->
<!-- Building Overview: Combined view of all floors (no floor plan image) -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Icon from '$lib/components/icons/Icon.svelte';
  import PlanFilters from './PlanFilters.svelte';
  import ElementModal from './ElementModal.svelte';
  import { plansStore }       from '../stores/plansStore';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import { getFloorOrder } from '$lib/utils/floorSorting';
  import {
    ELEMENT_TYPE_OPTIONS,
    getElementDisplayName,
    getElementStatusConfig,
    getAttributeSummary
  } from '$lib/utils/planConstants';
  import { formatNotesForDisplay, parseNotesValue } from '$lib/utils/notesParser';

  const logger = getLogger('BuildingOverview');
  const dispatch = createEventDispatcher();

  export let plans;

  // Load all elements for all plans
  let allElements = [];
  let selectedElement = null;
  let showElementModal = false;
  let saveError        = '';
  let inventoryView = 'summary'; // Default to summary for building overview

  let filters = {
    types: [], statuses: [], searchText: '',
    lightFilters: { subtypes: [], battery: [], emergency: false, movementSensor: false, lightSensor: false },
    communalFilters: { subtypes: [], security: [], retained: false },
    apartmentFilters: {},
    fireFilters: { subtypes: [] }
  };

  $: storeElements = $plansStore.elements;
  
  // Combine all elements from all plans
  $: allElements = plans.flatMap(plan => (storeElements[plan.id] || []).map(el => ({
    ...el,
    _planId: plan.id,
    _floorLevel: plan.floor_level,
    _building: plan.building
  })));

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

  $: sortedElementsForTable = [...filteredElements].sort((a, b) => {
    // Sort by FLOOR FIRST with correct order: L, U, G, 1-7
    const floorA = getFloorOrder(a._floorLevel);
    const floorB = getFloorOrder(b._floorLevel);
    if (floorA !== floorB) return floorA - floorB;
    
    // Then by element type
    if (a.element_type !== b.element_type) return a.element_type.localeCompare(b.element_type);
    
    // Finally by asset ID
    return (a.asset_id || '').localeCompare(b.asset_id || '', undefined, { numeric: true });
  });

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
          el.label?.toLowerCase().includes(q) ||
          el.asset_id?.toLowerCase().includes(q) ||
          el.subtype?.toLowerCase().includes(q) ||
          notesValue.includes(q) ||
          getElementDisplayName(el, el._floorLevel).toLowerCase().includes(q)
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

  function handleElementClick(element) {
    selectedElement = element;
    showElementModal = true;
  }

  async function handleElementSave(event) {
    const { element, isNew } = event.detail;
    try {
      if (!isNew) {
        // Strip client-side _* fields added by allElements reactive (e.g. _planId, _floorLevel, _building)
        // before sending to the DB — Supabase will reject unknown columns.
        const planId = element._planId;
        const { _planId, _floorLevel, _building, ...elementData } = element;
        await plansStore.updateElement(elementData.id, elementData);
        await plansStore.loadElements(planId);
        dispatch('planUpdated');
      }
      showElementModal = false;
      selectedElement = null;
    } catch (error) {
      saveError = 'Failed to save element: ' + error.message;
    }
  }

  async function handleElementDelete(event) {
    const { elementId, planId } = event.detail;
    try {
      await plansStore.deleteElement(elementId, planId);
      await plansStore.loadElements(planId);
      dispatch('planUpdated');
      showElementModal = false;
      selectedElement = null;
    } catch (error) {
      saveError = 'Failed to delete element: ' + error.message;
    }
  }

  function handleFilterChange(event) { filters = event.detail; }
</script>

<div class="grid grid-cols-12 gap-6">
  <div class="col-span-3">
    <PlanFilters elements={allElements} {elementCounts} on:change={handleFilterChange} />
  </div>

  <div class="col-span-9">
    <div class="card-info">
      <div class="flex items-center justify-between mb-4">
        <div class="flex-row-md">
          <div class="text-sm">
            <span class="font-semibold">{allElements.length}</span>
            <span class="text-gray-400"> total elements across all floors</span>
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

      <div class="bg-slate-700/50 rounded-lg p-4 mb-4">
        <div class="flex items-start gap-2 text-sm text-gray-300">
          <Icon name="info" size={5} className="text-blue-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Building Overview</strong> combines all elements from all floors in this building.
            {#if hasActiveFilters}
              <span class="text-amber-400 ml-1">
                Filters active — {allElements.length - filteredElements.length} elements hidden.
              </span>
            {/if}
          </p>
        </div>
      </div>
    </div>

    {#if allElements.length > 0}
      <div class="bg-slate-800/50 rounded-lg p-6 mt-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-4">
            <h3 class="text-xl font-bold flex items-center gap-2">
              <Icon name="table" size={5} className="text-purple-400" />
              Inventory
            </h3>
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

        {#if inventoryView === 'list'}
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-slate-700">
                  {#each ['Floor','Type','Name','Label','Subtype','Notes','Status'] as col}
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
                    <td class="py-3 px-4 text-sm text-gray-400">{element._floorLevel}</td>
                    <td class="py-3 px-4">
                      <span class="text-sm">{typeConfig?.label ?? element.element_type}</span>
                    </td>
                    <td class="py-3 px-4 font-medium font-mono text-sm">{getElementDisplayName(element, element._floorLevel)}</td>
                    <td class="py-3 px-4 text-sm text-gray-400">{element.label || '—'}</td>
                    <td class="py-3 px-4 text-sm text-gray-400">{element.subtype || '—'}</td>
                    <td class="py-3 px-4 text-xs text-gray-400">{formatNotesForDisplay(element.notes, 40)}</td>
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
        
        {:else if inventoryView === 'summary'}
          <div class="space-y-6">
            {#each Object.entries(summaryData).sort(([a], [b]) => a.localeCompare(b)) as [type, subtypes]}
              {@const typeConfig = ELEMENT_TYPE_OPTIONS.find(t => t.value === type)}
              {@const typeTotal = Object.values(subtypes).reduce((sum, statuses) => 
                sum + Object.values(statuses).reduce((s, count) => s + count, 0), 0)}
              
              <div class="bg-slate-700/40 rounded-lg p-4">
                <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-600">
                  <div class="flex items-center gap-2">
                    <span class="text-2xl">{typeConfig?.icon || '📦'}</span>
                    <h4 class="text-lg font-semibold text-white">{typeConfig?.label ?? type}</h4>
                  </div>
                  <span class="text-lg font-bold text-purple-300">{typeTotal}</span>
                </div>
                
                <div class="space-y-2">
                  {#each Object.entries(subtypes).sort(([a], [b]) => a.localeCompare(b)) as [subtype, statuses]}
                    {@const subtypeTotal = Object.values(statuses).reduce((sum, count) => sum + count, 0)}
                    
                    <div class="flex items-center justify-between py-2 px-3 rounded bg-slate-800/50 hover:bg-slate-800/70 transition-colors">
                      <div class="flex-1">
                        <div class="font-medium text-sm text-gray-200">{subtype}</div>
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

  {#if saveError}
    <ErrorDisplay message={saveError} onDismiss={() => saveError = ''} />
  {/if}
</div>

{#if showElementModal && selectedElement}
  {@const sourcePlan = plans.find(p => p.id === selectedElement._planId)}
  <ElementModal
    element={selectedElement}
    plan={sourcePlan}
    on:save={handleElementSave}
    on:delete={handleElementDelete}
    on:close={() => { showElementModal = false; selectedElement = null; }}
  />
{/if}
