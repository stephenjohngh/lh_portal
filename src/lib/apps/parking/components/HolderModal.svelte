<!-- src/lib/apps/parking/components/HolderModal.svelte -->
<!-- Add or edit a holder. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { validateHolder } from '../utils/agreementModel.js';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import HolderFields from './HolderFields.svelte';

  export let show = false;
  export let holder = null;      // null to add

  const dispatch = createEventDispatcher();
  let form = {};
  let openedFor = undefined;
  let saving = false;
  let error = '';

  // Reset only when the modal opens for a different holder (a primitive key).
  $: key = show ? (holder?.id ?? 'new') : null;
  $: if (key !== openedFor) {
    openedFor = key;
    form = holder ? { ...holder } : { holder_type: '' };
    error = '';
  }

  async function save() {
    const id = holder?.id ?? null;
    const problem = validateHolder(form);
    if (problem) { error = problem; return; }
    saving = true; error = '';
    try {
      const saved = await parkingStore.saveHolder(id, form);
      dispatch('saved', saved);
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<Modal {show} title={holder ? 'Edit holder' : 'Add a holder'} size="medium" on:close={() => dispatch('close')}>
  <HolderFields bind:holder={form} />
  {#if error}<div class="mt-3"><ErrorDisplay message={error} /></div>{/if}
  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary" loading={saving} disabled={saving} on:click={save}>Save</Button>
  </div>
</Modal>
