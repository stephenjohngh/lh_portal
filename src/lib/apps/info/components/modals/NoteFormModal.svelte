<!-- src/lib/apps/info/components/modals/NoteFormModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { parseTags, tagsToString } from '../../utils/infoHelpers.js';

  export let show       = false;
  export let note       = null;       // null = create, object = edit
  export let sections   = [];         // array of info_sections
  export let sectionId  = null;       // pre-selected section (from sidebar)

  const dispatch = createEventDispatcher();

  let title      = '';
  let body       = '';
  let tagInput   = '';
  let is_pinned  = false;
  let section_id = '';
  let saving     = false;
  let error      = '';
  let titleError = '';
  let sectionError = '';

  $: sectionOptions = sections.map(s => ({ value: s.id, label: s.name }));

  $: if (show) {
    title      = note?.title      ?? '';
    body       = note?.body       ?? '';
    tagInput   = tagsToString(note?.tags);
    is_pinned  = note?.is_pinned  ?? false;
    section_id = note?.section_id ?? sectionId ?? (sections[0]?.id ?? '');
    error      = ''; titleError = ''; sectionError = '';
  }

  function validate() {
    titleError   = title.trim()    ? '' : 'Title is required';
    sectionError = section_id      ? '' : 'Select a section';
    return !titleError && !sectionError;
  }

  async function handleSubmit() {
    if (!validate()) return;
    saving = true; error = '';
    try {
      dispatch('save', {
        title:      title.trim(),
        body:       body.trim() || null,
        tags:       parseTags(tagInput),
        is_pinned,
        section_id,
      });
    } catch (err) {
      error = err.message;
      saving = false;
    }
  }

  export function done()  { saving = false; }
  export function fail(e) { error = e; saving = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal
  bind:show
  title={note ? 'Edit Note' : 'New Note'}
  size="large"
  on:close={handleClose}
>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <FormInput
      label="Title"
      bind:value={title}
      placeholder="Note title…"
      required={true}
      error={titleError}
      on:input={() => titleError = ''}
      disabled={saving}
    />

    <FormSelect
      label="Section"
      bind:value={section_id}
      options={sectionOptions}
      placeholder="— select section —"
      error={sectionError}
      disabled={saving}
    />

    <FormTextarea
      label="Body"
      bind:value={body}
      placeholder="Note content…"
      rows={8}
      disabled={saving}
    />

    <FormInput
      label="Tags"
      bind:value={tagInput}
      placeholder="fire, safety, legal  (comma-separated)"
      disabled={saving}
    />

    <label class="flex items-center gap-3 cursor-pointer">
      <Checkbox bind:checked={is_pinned} disabled={saving} />
      <span class="text-sm text-slate-300">Pin this note (keeps it at the top)</span>
    </label>
  </div>

  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" size="large" fullWidth={true}
            on:click={handleClose} disabled={saving}>Cancel</Button>
    <Button variant="primary"   size="large" fullWidth={true}
            loading={saving}    disabled={saving}
            on:click={handleSubmit}>
      {note ? 'Save Changes' : 'Create Note'}
    </Button>
  </div>
</Modal>
