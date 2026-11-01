<!-- src/lib/apps/dossier/components/PackFormModal.svelte -->
<!-- Create / edit a Pack. Parent owns the save; this component owns validation
     and its own saving/error state (done()/fail() callbacks, house pattern). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '#lib/components/common/Modal.svelte';
  import Button       from '#lib/components/common/Button.svelte';
  import FormInput    from '#lib/components/common/FormInput.svelte';
  import FormTextarea from '#lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import FormSelect   from '#lib/components/common/FormSelect.svelte';

  export let show = false;
  export let pack = null;   // null = create, object = edit
  /** Creating a TEMPLATE (an administrator's act) rather than a dossier. */
  export let isTemplate = false;
  /** Templates a new dossier can start from (not archived). */
  export let templates = [];
  /** Pre-selected when the person came from a template's own button. */
  export let startTemplateId = '';

  const dispatch = createEventDispatcher();

  let title       = '';
  let description = '';
  let saving      = false;
  let error       = '';
  let titleError  = '';
  let templateId  = '';

  $: if (show) {
    title       = pack?.title       ?? '';
    description = pack?.description ?? '';
    templateId  = pack ? '' : startTemplateId;
    error       = '';
    titleError  = '';
  }

  function validate() {
    titleError = title.trim() ? '' : (isTemplate ? 'A template needs a title' : 'A pack needs a title');
    return !titleError;
  }

  function handleSubmit() {
    if (!validate()) return;
    saving = true; error = '';
    dispatch('save', {
      title:       title.trim(),
      description: description.trim() || null,
      isTemplate,
      templateId: templateId || null,
    });
  }

  export function done()  { saving = false; }
  export function fail(e) { error = e; saving = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal
  bind:show
  title={pack ? (pack.is_template ? 'Edit Template' : 'Edit Pack') : isTemplate ? 'New Template' : 'New Pack'}
  size="small"
  on:close={handleClose}
>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <FormInput
      label="Title"
      bind:value={title}
      placeholder="e.g. Flat 14 — service charge dispute"
      required={true}
      error={titleError}
      on:input={() => titleError = ''}
      disabled={saving}
    />

    {#if !pack && !isTemplate && templates.length}
      <FormSelect
        label="Start from a template (optional)"
        bind:value={templateId}
        options={templates.map(t => ({ value: t.id, label: t.title }))}
        placeholder="— a blank dossier —"
        disabled={saving}
        helpText="Copies the template's pages and tables once, and lets you use its files. Changes made to the template later do not reach this dossier."
      />
    {:else if pack?.template_id}
      <p class="text-xs text-slate-500">
        Made from the template “{templates.find(t => t.id === pack.template_id)?.title ?? 'a template'}”. A dossier's template cannot be changed.
      </p>
    {/if}

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
      {pack ? 'Save Changes' : isTemplate ? 'Create Template' : templateId ? 'Create from template' : 'Create Pack'}
    </Button>
  </div>
</Modal>
