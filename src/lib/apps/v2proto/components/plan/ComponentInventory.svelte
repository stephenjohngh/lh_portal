<!-- plan/ComponentInventory.svelte -->
<!-- Thin wrapper around ComponentInventoryTable for the plan view.
     Always shows the current plan floor's components (already filtered by PlanViewTab).
     No floor selector here — floor is fixed by the active plan. -->

<script>
  import ComponentInventoryTable from '../ComponentInventoryTable.svelte';

  export let components     = [];
  export let componentAttrs = {};
  export let types          = [];
  export let systems        = [];
  export let attrDefs       = {};
  export let floors         = [];

  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<ComponentInventoryTable
  {components}
  {componentAttrs}
  {attrDefs}
  {types}
  {systems}
  {floors}
  title="Inventory"
  on:selectcomponent={e => dispatch('selectcomponent', e.detail)}
  on:deletecomponent={e => dispatch('deletecomponent', e.detail)}
  on:inspect={e => dispatch('inspect', e.detail)}
/>
