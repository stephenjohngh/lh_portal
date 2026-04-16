<!-- plan/ComponentInventory.svelte -->
<!-- Thin wrapper around ComponentInventoryTable for the plan view.
     Always shows the current plan floor's components (already filtered by PlanViewTab).
     Reference data (types, systems, floors, attrDefs, componentAttrs, componentLinks)
     is sourced directly from buildingAssetsStore — no prop drilling required.
     Only the filtered component list and readOnly flag come from PlanViewTab. -->

<script>
  import { createEventDispatcher }  from 'svelte';
  import { buildingAssetsStore }    from '../stores/buildingAssetsStore.js';
  import ComponentInventoryTable    from '../ComponentInventoryTable.svelte';

  export let components = [];   // filtered components[] passed down from PlanViewTab
  export let readOnly   = false;

  $: store = $buildingAssetsStore;

  const dispatch = createEventDispatcher();
</script>

<ComponentInventoryTable
  {components}
  componentAttrs={store.componentAttrs}
  componentLinks={store.componentLinks}
  attrDefs={store.attrDefs}
  types={store.types}
  systems={store.systems}
  floors={store.floors}
  {readOnly}
  title="Inventory"
  on:selectcomponent={e => dispatch('selectcomponent', e.detail)}
  on:deletecomponent={e => dispatch('deletecomponent', e.detail)}
  on:inspect={e => dispatch('inspect', e.detail)}
/>
