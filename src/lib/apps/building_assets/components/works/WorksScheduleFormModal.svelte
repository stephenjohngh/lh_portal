<!-- src/lib/apps/building_assets/components/works/WorksScheduleFormModal.svelte -->
<!-- Creating a schedule, or editing its header.

     The `purpose` field is the one that earns its place: the same list of
     components is a request for a price before the work and an instruction to
     proceed after it, and a contractor needs to know which they are holding.
     It changes the heading of the printed document and nothing else. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { SCHEDULE_PURPOSE, WORKS_ACTIONS } from '../../utils/worksSchedule.js';

  export let show = false;
  /** Set when editing an existing schedule's header. */
  export let schedule = null;
  /** How many components the new schedule will start with. */
  export let componentCount = 0;

  const dispatch = createEventDispatcher();

  let title = '';
  let reference = '';
  let purpose = 'quote';
  let contractorName = '';
  let notes = '';
  let action = 'replace';
  let saving = false;
  let error = '';

  // Guard on a primitive: `schedule` is an object prop and safe_not_equal marks
  // every object dirty, so keying off it would reset the form as you type.
  let loadedFor = null;
  $: if (show && (schedule?.id ?? 'new') !== loadedFor) {
    loadedFor      = schedule?.id ?? 'new';
    title          = schedule?.title ?? '';
    reference      = schedule?.reference ?? '';
    purpose        = schedule?.purpose ?? 'quote';
    contractorName = schedule?.contractor_name ?? '';
    notes          = schedule?.notes ?? '';
    action         = 'replace';
    error          = '';
  }

  export function done() { saving = false; show = false; }
  export function fail(message) { error = message; saving = false; }

  function close() { loadedFor = null; saving = false; error = ''; show = false; dispatch('close'); }

  function save() {
    if (!title.trim()) { error = 'Give the schedule a title.'; return; }
    saving = true; error = '';
    dispatch('save', {
      title: title.trim(),
      reference: reference.trim(),
      purpose,
      contractor_name: contractorName.trim(),
      notes: notes.trim(),
      action,
    });
  }
</script>

<Modal bind:show title={schedule ? 'Edit schedule' : 'New works schedule'}
       size="medium" on:close={close}>
  {#if error}
    <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
  {/if}

  <div class="space-y-3">
    {#if !schedule && componentCount > 0}
      <p class="text-xs text-slate-400">
        Starting with <span class="text-white">{componentCount}</span>
        component{componentCount === 1 ? '' : 's'} from the current filter.
      </p>
    {/if}

    <FormInput label="Title" bind:value={title}
               placeholder="e.g. Second-floor lighting replacement" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <FormInput label="Your reference (optional)" bind:value={reference}
                 placeholder="e.g. WO-2026-014" />
      <FormInput label="Contractor (optional)" bind:value={contractorName}
                 placeholder="Who it is going to" />
    </div>

    <FormSelect label="What this document is" bind:value={purpose}
                options={SCHEDULE_PURPOSE.map(p => ({ value: p.value, label: p.label }))} />
    <p class="text-xs text-slate-500 -mt-2">
      {SCHEDULE_PURPOSE.find(p => p.value === purpose)?.hint}
      You can change this later — the same list is usually priced first and
      instructed afterwards.
    </p>

    {#if !schedule && componentCount > 0}
      <FormSelect label="Start every line as" bind:value={action}
                  options={WORKS_ACTIONS.map(a => ({ value: a.value, label: a.label }))} />
      <p class="text-xs text-slate-500 -mt-2">
        Set them all at once now; change individual lines afterwards.
      </p>
    {/if}

    <FormTextarea label="Notes for the contractor (optional)" bind:value={notes}
                  rows={3}
                  placeholder="Access arrangements, working hours, anything that applies to the whole job" />
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={saving} on:click={close}>Cancel</Button>
    <Button variant="primary" disabled={saving} on:click={save}>
      {saving ? 'Saving…' : (schedule ? 'Save' : 'Create schedule')}
    </Button>
  </div>
</Modal>
