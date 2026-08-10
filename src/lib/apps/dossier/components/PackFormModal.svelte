<!-- src/lib/apps/dossier/components/PackFormModal.svelte -->
<!-- Create / edit a Pack. Parent owns the save; this component owns validation
     and its own saving/error state (done()/fail() callbacks, house pattern). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show = false;
  export let pack = null;   // null = create, object = edit

  const dispatch = createEventDispatcher();

  let title       = '';
  let description = '';
  let saving      = false;
  let error       = '';
  let titleError  = '';

  $: if (show) {
    title       = pack?.title       ?? '';
    description = pack?.description ?? '';
    error       = '';
    titleError  = '';
  }

  function validate() {
    titleError = title.trim() ? '' : 'A pack needs a title';
    return !titleError;
  }

  function handleSubmit() {
    if (!validate()) return;
    saving = true; error = '';
    dispatch('save', {
      title:       title.trim(),
      description: description.trim() || null,
    });
  }

  export function done()  { saving = false; }
  export function fail(e) { error = e; saving = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal
  bind:show
  title={pack ? 'Edit Pack' : 'New Pack'}
  size="small"
  on:close={handleClose}
>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <FormInput
      label="Title"
      bind:value={title}
      placeholder="e.g. 14 Lonsdale House — service charge dispute"
      required={true}
      error={titleError}
      on:input={() => titleError = ''}
      disabled={saving}
    />

    <FormTextarea
      label="Description"
      bind:value={description}
      placeholder="Optional — who this pack is for and what it covers"
      rows={3}
      disabled={saving}
    />
  </div>

  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" size="large" fullWidth={true}
            on:click={handleClose} disabled={saving}>Cancel</Button>
    <Button variant="primary" size="large" fullWidth={true}
            loading={saving} disabled={saving}
            on:click={handleSubmit}>
      {pack ? 'Save Changes' : 'Create Pack'}
    </Button>
  </div>
</Modal>
