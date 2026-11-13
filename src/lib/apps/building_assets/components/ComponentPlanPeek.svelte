<!-- src/lib/apps/building_assets/components/ComponentPlanPeek.svelte -->
<!-- Where is this one? — a pop-up around ComponentLocation (the schematic with
     the component marked). Answers "which one is that?" without leaving the
     list you are working through (Works). The Components tab shows the same
     drawing beside a component's details instead. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ComponentLocation from './ComponentLocation.svelte';

  export let show = false;
  /** The components row — needs schematic_id, x_position, y_position. */
  export let component = null;
  /** plans[] from the store; the right one is found by schematic_id. */
  export let plans = [];
  /** Canonical reference, e.g. "G/L/L-042". */
  export let componentRef = '';
  /** Human type name, e.g. "LED Batten". */
  export let typeName = '';

  const dispatch = createEventDispatcher();

  function close() { show = false; dispatch('close'); }
</script>

<Modal bind:show title={componentRef || 'Location'} size="large" on:close={close}>
  <ComponentLocation {component} {plans} {typeName} active={show} />

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={close}>Close</Button>
  </div>
</Modal>
