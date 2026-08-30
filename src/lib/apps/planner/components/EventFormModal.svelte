<!-- src/lib/apps/planner/components/EventFormModal.svelte -->
<!-- Creating or editing a SERIES — never one occurrence. Moving or ticking a
     single date happens on the agenda row; this is the pattern itself. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal         from '$lib/components/common/Modal.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import FormSelect    from '$lib/components/common/FormSelect.svelte';
  import FormTextarea  from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import RecurrenceFields from './RecurrenceFields.svelte';
  import { pickable } from '../utils/categories.js';
  import { today } from '$lib/utils/dates';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { onMount } from 'svelte';

  export let show = false;
  /** The series being edited, or null to create one. */
  export let event = null;
  /** The building's categories — see migration 179. */
  export let categories = [];

  const dispatch = createEventDispatcher();

  let title = '';
  let description = '';
  let category = '';
  let location = '';
  let startDate = today();
  let allDay = true;
  let startTime = '';
  let endTime = '';
  let leadDays = '';
  let ownerId = '';
  let rule = { freq: 'once' };
  let drifts = false;

  let saving = false;
  let error = '';

  // Guarded on the id, not the object: every `$:` depending on an object prop
  // re-runs on each parent update, which would wipe what is being typed.
  let loadedFor = null;
  $: if (show && (event?.id ?? 'new') !== loadedFor) {
    loadedFor   = event?.id ?? 'new';
    title       = event?.title ?? '';
    description = event?.description ?? '';
    category    = event?.category ?? '';
    location    = event?.location ?? '';
    startDate   = event?.start_date ?? today();
    allDay      = event?.all_day ?? true;
    startTime   = event?.start_time?.slice(0, 5) ?? '';
    endTime     = event?.end_time?.slice(0, 5) ?? '';
    leadDays    = event?.lead_days ?? '';
    ownerId     = event?.owner_id ?? '';
    rule        = { ...(event?.recurrence ?? { freq: 'once' }) };
    drifts      = event?.drifts ?? false;
    saving      = false;
    error       = '';
  }

  function save() {
    if (!title.trim())  { error = 'A title is needed.'; return; }
    if (!startDate)     { error = 'A start date is needed.'; return; }
    if (!allDay && !startTime) { error = 'A time is needed, or set it to all day.'; return; }

    saving = true;
    error = '';
    dispatch('save', {
      title: title.trim(),
      description: description.trim() || null,
      category: category || null,
      location: location.trim() || null,
      start_date: startDate,
      all_day: allDay,
      // Times are local wall-clock and only exist when the event has one.
      start_time: allDay ? null : startTime,
      end_time: allDay || !endTime ? null : endTime,
      lead_days: leadDays === '' ? null : Number(leadDays),
      // A uuid, not a name: the column is a foreign key, and a name would
      // stop meaning anybody the moment somebody is renamed.
      owner_id: ownerId || null,
      recurrence: cleanRule(rule),
      drifts,
    });
  }

  /**
   * The rule, without the fields the chosen frequency does not use.
   *
   * A leftover `month` from a spell as a yearly series would sit in the jsonb
   * looking meaningful and be silently ignored — or, worse, be honoured later
   * by a future reader of the same column.
   */
  function cleanRule(r) {
    const out = { freq: r.freq };
    if (r.freq === 'once') return out;

    if (r.interval && Number(r.interval) > 1) out.interval = Number(r.interval);
    if (r.until) out.until = r.until;
    if (r.count) out.count = Number(r.count);

    if (r.freq === 'weekly' && r.weekdays?.length) out.weekdays = r.weekdays;

    if ((r.freq === 'monthly' || r.freq === 'yearly') && !drifts) {
      if (r.freq === 'yearly' && r.month) out.month = Number(r.month);
      if (r.nth) {
        out.nth = Number(r.nth);
        out.weekday = Number(r.weekday ?? 1);
      } else if (r.monthDay) {
        out.monthDay = Number(r.monthDay);
      }
    }
    return out;
  }

  /** Called by the parent when the save fails, so the form stays open. */
  export function fail(message) { saving = false; error = message; }

  function close() { loadedFor = null; show = false; dispatch('close'); }

  /** Whose job this is. Ids, because the column is a foreign key. */
  onMount(() => profilesStore.load());
  $: owners = [
    { value: '', label: 'Nobody in particular' },
    ...$profiles.list.map(p => ({ value: p.id, label: p.full_name })),
  ];

  let pendingArchive = false;
  let pendingDelete = false;
</script>

<Modal bind:show title={event ? 'Edit series' : 'New planner event'} size="large" on:close={close}>
  <div class="space-y-3">
    {#if error}
      <ErrorDisplay message={error} onDismiss={() => error = ''} />
    {/if}

    <FormInput label="Title" bind:value={title}
               placeholder="e.g. Annual general meeting" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <FormSelect label="Category" bind:value={category}
                  options={[{ value: '', label: 'None' },
                            ...pickable(categories).map(c => ({ value: c.slug, label: c.name }))]} />
      <FormInput label="Where (optional)" bind:value={location}
                 placeholder="e.g. Residents' lounge" />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <FormInput label="First date" type="date" bind:value={startDate} />

      {#if !allDay}
        <FormInput label="From" type="time" bind:value={startTime} />
        <FormInput label="To (optional)" type="time" bind:value={endTime} />
      {/if}
    </div>

    <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
      <input type="checkbox" bind:checked={allDay} class="accent-purple-500" />
      All day
    </label>

    <div class="border-t border-slate-700 pt-3">
      <RecurrenceFields bind:rule bind:drifts />
    </div>

    <FormSelect label="Whose job (optional)" bind:value={ownerId} options={owners} />

    <FormInput label="Days of notice (optional)" type="number" bind:value={leadDays}
               placeholder="30" min="0" />
    <p class="text-xs text-slate-500 -mt-2">
      How far ahead this should start showing under “Coming up”. A fire risk
      assessment wants months; a bin day wants two days.
    </p>

    <FormTextarea label="Notes (optional)" bind:value={description} rows={3}
                  placeholder="Anything the person doing this needs to know" />
  </div>

  <div slot="footer" class="flex items-center gap-2">
    {#if event}
      <!-- Removing a series lives HERE, with the series, because that is where
           somebody who has just realised it is wrong will look for it.
           Archiving first and deleting second, and separated from the save
           buttons by a gap: they are not steps in the same sequence. -->
      <Button variant="secondary" disabled={saving}
              on:click={() => pendingArchive = true}>
        {event.archived ? 'Restore' : 'Archive'}
      </Button>
      <ProtectedButton requireAdmin={true} variant="danger" size="medium"
                       disabled={saving}
                       on:click={() => pendingDelete = true}>
        Delete
      </ProtectedButton>
    {/if}

    <div class="flex-1"></div>

    <Button variant="secondary" disabled={saving} on:click={close}>Cancel</Button>
    <Button variant="primary" disabled={saving} on:click={save}>
      {saving ? 'Saving…' : (event ? 'Save' : 'Create')}
    </Button>
  </div>
</Modal>

<ConfirmDialog
  show={pendingArchive}
  title={event?.archived ? 'Put this back on the planner?' : 'Take this off the planner?'}
  message={event?.archived
    ? `“${event?.title}” starts appearing on the year again.`
    : `“${event?.title}” stops appearing on the year. Everything already recorded against it is kept, and it can be put back.`}
  confirmText={event?.archived ? 'Restore' : 'Archive'}
  on:confirm={() => { pendingArchive = false; dispatch('archive', { event, archived: !event?.archived }); }}
  on:cancel={() => pendingArchive = false}
/>

<ConfirmDialog
  show={pendingDelete}
  danger={true}
  title="Delete this series?"
  message={`“${event?.title}” and every tick, note and skip recorded against it are deleted. That is a record of work done — archiving keeps it and takes the series off the year.`}
  confirmText="Delete"
  on:confirm={() => { pendingDelete = false; dispatch('remove', event); }}
  on:cancel={() => pendingDelete = false}
/>
