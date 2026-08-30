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
  import { isRecurring } from '../utils/recurrence.js';
  import { today } from '$lib/utils/dates';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let show = false;
  /** The series being edited, or null to create one. */
  export let event = null;
  /** The building's categories — see migration 179. */
  export let categories = [];
  /**
   * The day the reader is standing on, used as the start date of a NEW series.
   *
   * Somebody who has clicked the 14th of March and then reached for "new event"
   * has already said which day they mean; making them say it again in a date
   * field is asking twice. It only seeds a creation — an existing series keeps
   * its own start date, because that date is part of the pattern.
   */
  export let defaultDate = null;

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
  /**
   * Kept, though there is no longer a field for it.
   *
   * `owner_id` is still a column and some events already have one — read on
   * load, written back on save, so editing an event does not silently clear
   * whose job it was. Restoring the picker is a line of markup if it is ever
   * wanted again.
   */
  let ownerId = '';
  let rule = { freq: 'once' };
  let drifts = false;

  let saving = false;
  let error = '';

  // Guarded on the id, not the object: every `$:` depending on an object prop
  // re-runs on each parent update, which would wipe what is being typed.
  let loadedFor = null;
  // What this dialog is currently about. Null while closed, so re-opening always
  // starts from the record — or from the day just clicked — rather than from
  // whatever was half-typed and then cancelled.
  /**
   * Whether the thing being edited actually repeats. Calling a one-off a
   * "series" promises other dates it does not have, and the word appears in the
   * heading and in the delete warning — the two places a reader is deciding
   * how much they are about to change.
   */
  $: editingSeries = !!event && isRecurring(event.recurrence);

  $: token = !show ? null : (event?.id ?? `new:${defaultDate ?? ''}`);
  $: if (token && token !== loadedFor) {
    loadedFor   = token;
    title       = event?.title ?? '';
    description = event?.description ?? '';
    category    = event?.category ?? '';
    location    = event?.location ?? '';
    startDate   = event?.start_date ?? defaultDate ?? today();
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

  let pendingArchive = false;
  let pendingDelete = false;
</script>

<Modal bind:show
       title={!event ? 'New planner event' : editingSeries ? 'Edit series' : 'Edit event'}
       size="large" on:close={close}>
  <!-- The body scrolls, the header and footer do not.

       Everything below the frequency dropdown is conditional — weekdays,
       month, nth-weekday, until/count, the drifting explanation — so a
       yearly-on-a-weekday rule is roughly twice the height of a one-off. The
       shared Modal scrolls the whole overlay instead, which pushes Save and
       Cancel below the fold exactly when the form is at its longest. Capping
       the body keeps them where they were. -->
  <div class="planner-form space-y-2.5 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
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

    <!-- Date, all-day and times on one line: "all day" is about the times
         beside it, and on its own row it read as a separate decision. -->
    <div class="flex flex-wrap items-end gap-x-4 gap-y-1">
      <div class="min-w-[9rem] flex-1">
        <FormInput label="First date" type="date" bind:value={startDate} />
      </div>

      <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-400 pb-3">
        <input type="checkbox" bind:checked={allDay} class="accent-purple-500" />
        All day
      </label>

      {#if !allDay}
        <div class="min-w-[7rem] flex-1">
          <FormInput label="From" type="time" bind:value={startTime} />
        </div>
        <div class="min-w-[7rem] flex-1">
          <FormInput label="To (optional)" type="time" bind:value={endTime} />
        </div>
      {/if}
    </div>

    <div class="border-t border-slate-700 pt-3">
      <RecurrenceFields bind:rule bind:drifts />
    </div>

    <!-- Label, field and explanation on one line. Two lines of prose for one
         number cost more height than the number did, and a label above a
         two-inch box wastes a whole row to say what fits beside it. -->
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <label for="planner-lead" class="text-sm font-medium text-gray-200 shrink-0">
        Days of notice
      </label>
      <div class="w-20">
        <FormInput id="planner-lead" type="number" bind:value={leadDays}
                   placeholder="30" min="0" />
      </div>
      <p class="text-[11px] text-slate-500 flex-1 min-w-[15rem]">
        Optional — how far ahead this starts showing under “Coming up”. A fire
        risk assessment wants months; a bin day wants two days.
      </p>
    </div>

    <FormTextarea label="Notes (optional)" bind:value={description} rows={2}
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

<style>
  /* The shared form controls carry `mb-4` for a page, which inside a modal that
     stacks eight of them is most of a screen. Compressed here rather than by
     adding a `dense` prop to FormInput/FormSelect/FormTextarea and threading it
     through every field and into RecurrenceFields.

     It depends on the utility class the shared components use, which is a
     coupling worth naming: if those wrappers ever stop using `mb-4`, this stops
     working and the form gets tall again — it will not break, it will just
     look like it used to. */
  .planner-form :global(.mb-4) { margin-bottom: 0.25rem; }
  .planner-form :global(label.block) { margin-bottom: 0.25rem; }
</style>

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
  title={editingSeries ? 'Delete this series?' : 'Delete this event?'}
  message={`“${event?.title}” and every tick, note and skip recorded against it are deleted. That is a record of work done — archiving keeps it and takes ${editingSeries ? 'the series' : 'it'} off the year.`}
  confirmText="Delete"
  on:confirm={() => { pendingDelete = false; dispatch('remove', event); }}
  on:cancel={() => pendingDelete = false}
/>
