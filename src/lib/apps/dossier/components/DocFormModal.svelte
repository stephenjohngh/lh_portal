<!-- src/lib/apps/dossier/components/DocFormModal.svelte -->
<!-- Create / rename a doc. Title only — the slug is derived once at creation
     and never changes on rename (utils/slug.js explains why). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let doc    = null;    // null = create, object = rename
  export let parent = null;    // the doc the new page will sit under

  const dispatch = createEventDispatcher();

  let title      = '';
  let saving     = false;
  let error      = '';
  let titleError = '';

  $: if (show) {
    title      = doc?.title ?? '';
    error      = '';
    titleError = '';
  }

  function handleSubmit() {
    titleError = title.trim() ? '' : 'A page needs a title';
    if (titleError) return;
    saving = true; error = '';
    dispatch('save', { title: title.trim() });
  }

  export function done()  { saving = false; }
  export function fail(e) { error = e; saving = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal
  bind:show
  title={doc ? 'Rename Page' : parent ? `New Page in "${parent.title}"` : 'New Page'}
  size="small"
  on:close={handleClose}
>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <FormInput
      label="Title"
      bind:value={title}
      placeholder="e.g. Chronology"
      required={true}
      error={titleError}
      on:input={() => titleError = ''}
      disabled={saving}
    />

    {#if doc}
      <p class="text-xs text-slate-500">
        The page address stays <span class="font-mono text-slate-400">{doc.slug}</span> —
        renaming never changes it, so links already shared keep working.
      </p>
    {/if}
  </div>

  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" size="large" fullWidth={true}
            on:click={handleClose} disabled={saving}>Cancel</Button>
    <Button variant="primary" size="large" fullWidth={true}
            loading={saving} disabled={saving}
            on:click={handleSubmit}>
      {doc ? 'Rename' : 'Create Page'}
    </Button>
  </div>
</Modal>
