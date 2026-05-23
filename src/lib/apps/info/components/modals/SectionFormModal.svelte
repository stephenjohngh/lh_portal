<!-- src/lib/apps/info/components/modals/SectionFormModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal         from '$lib/components/common/Modal.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import FormTextarea  from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import { SECTION_COLOURS } from '../../utils/infoHelpers.js';

  export let show    = false;
  export let section = null; // null = create, object = edit

  const dispatch = createEventDispatcher();

  let name          = '';
  let description   = '';
  let colour        = SECTION_COLOURS[0].hex;
  let display_order = 0;
  let saving        = false;
  let error         = '';
  let nameError     = '';

  $: if (show) {
    name          = section?.name          ?? '';
    description   = section?.description   ?? '';
    colour        = section?.colour        ?? SECTION_COLOURS[0].hex;
    display_order = section?.display_order ?? 0;
    error         = '';
    nameError     = '';
  }

  function validate() {
    nameError = name.trim() ? '' : 'Section name is required';
    return !nameError;
  }

  async function handleSubmit() {
    if (!validate()) return;
    saving = true; error = '';
    try {
      dispatch('save', {
        name: name.trim(), description: description.trim() || null,
        colour, display_order: Number(display_order) || 0,
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
  title={section ? 'Edit Section' : 'New Section'}
  size="small"
  on:close={handleClose}
>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <FormInput
      label="Section Name"
      bind:value={name}
      placeholder="e.g. Fire Safety"
      required={true}
      error={nameError}
      on:input={() => nameError = ''}
      disabled={saving}
    />

    <FormTextarea
      label="Description"
      bind:value={description}
      placeholder="Optional — what kind of notes belong here?"
      rows={2}
      disabled={saving}
    />

    <!-- Colour picker -->
    <div>
      <p class="text-xs text-slate-400 mb-2">Colour</p>
      <div class="flex gap-2 flex-wrap">
        {#each SECTION_COLOURS as c}
          <button
            type="button"
            title={c.label}
            class="w-7 h-7 rounded-full border-2 transition-transform
                   {colour === c.hex ? 'border-white scale-110' : 'border-transparent hover:scale-105'}"
            style="background:{c.hex}"
            on:click={() => colour = c.hex}
          ></button>
        {/each}
      </div>
    </div>

    <FormInput
      label="Display Order"
      type="number"
      bind:value={display_order}
      placeholder="0"
      disabled={saving}
    />
  </div>

  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" size="large" fullWidth={true}
            on:click={handleClose} disabled={saving}>Cancel</Button>
    <Button variant="primary"   size="large" fullWidth={true}
            loading={saving}    disabled={saving}
            on:click={handleSubmit}>
      {section ? 'Save Changes' : 'Create Section'}
    </Button>
  </div>
</Modal>
