<!-- src/lib/apps/issues/components/meetings/MeetingForm.svelte -->
<!--
  Modal form for creating or editing a meeting.

  Title, date, type (free text + datalist sorted by frequency), notes,
  and a participants picker:
    - Multi-select chip list of profiles (from profilesStore).
    - Free-text "Add external" input that appends to participants.extras.

  Storage shape for participants is { profile_ids: uuid[], extras: text[] }.

  Dispatches 'submit' with the cleaned form payload, or 'close' on cancel.
-->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { meetingsStore }  from '../../stores/meetingsStore';
  import Modal              from '$lib/components/common/Modal.svelte';
  import Button             from '$lib/components/common/Button.svelte';
  import FormInput          from '$lib/components/common/FormInput.svelte';
  import FormTextarea       from '$lib/components/common/FormTextarea.svelte';

  export let show    = false;
  export let meeting = null;       // null = create, object = edit
  export let saving  = false;

  const dispatch = createEventDispatcher();

  // -- Form state ------------------------------------------------------
  let title           = '';
  let meeting_type    = '';
  let meeting_date    = '';     // yyyy-mm-dd
  let notes           = '';
  let profile_ids     = [];     // uuid[]
  let extras          = [];     // text[]
  let newExtra        = '';
  let openImmediately = true;   // only relevant when creating
  let formError       = '';

  // -- Ordinal title formatter ----------------------------------------
  // Converts 'yyyy-mm-dd' → '10th May 2026'
  function fmtTitleDate(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const v = d % 100;
    const sfx = (v >= 11 && v <= 13) ? 'th'
              : d % 10 === 1 ? 'st'
              : d % 10 === 2 ? 'nd'
              : d % 10 === 3 ? 'rd' : 'th';
    return `${d}${sfx} ${months[m - 1]} ${y}`;
  }

  // -- Datalist of distinct meeting types, frequency-sorted -----------
  // Existing types come first (most-used first). Hardcoded defaults
  // fill the list on a brand-new database so there are always useful
  // suggestions from the start. Free text is still allowed — just type
  // something that isn't in the list.
  const TYPE_DEFAULTS = [
    'Management Meeting',
    'Residents Meeting',
    'Directors Meeting',
    'Maintenance Review',
    'AGM',
  ];

  $: typeFrequency = (() => {
    const counts = {};
    for (const m of $meetingsStore.list) {
      counts[m.meeting_type] = (counts[m.meeting_type] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);
  })();
  // Existing types (most common first) then defaults not already present.
  $: typeOptions = Array.from(new Set([...typeFrequency, ...TYPE_DEFAULTS]));

  // -- Initialise on show ---------------------------------------------
  // Reactive blocks competing for the same fields are fragile (we hit
  // this in PlanAdminModal earlier). Use a single show-transition guard.
  let prevShow = false;
  $: if (show && !prevShow) {
    prevShow = true;
    formError = '';
    if (meeting) {
      title           = meeting.title           ?? '';
      meeting_type    = meeting.meeting_type    ?? '';
      meeting_date    = meeting.meeting_date    ?? '';
      notes           = meeting.notes           ?? '';
      profile_ids     = meeting.participants?.profile_ids ?? [];
      extras          = meeting.participants?.extras      ?? [];
      openImmediately = false;   // editing — irrelevant
    } else {
      meeting_date    = new Date().toISOString().split('T')[0];   // today
      title           = fmtTitleDate(meeting_date);
      meeting_type    = typeOptions[0] ?? TYPE_DEFAULTS[0];
      notes           = '';
      profile_ids     = [];
      extras          = [];
      openImmediately = true;
    }
    newExtra = '';
  }
  $: if (!show) prevShow = false;

  onMount(() => profilesStore.load());

  // -- Participant picker ---------------------------------------------
  function toggleProfile(id) {
    profile_ids = profile_ids.includes(id)
      ? profile_ids.filter(x => x !== id)
      : [...profile_ids, id];
  }

  function addExtra() {
    const t = newExtra.trim();
    if (!t) return;
    if (!extras.includes(t)) extras = [...extras, t];
    newExtra = '';
  }

  function removeExtra(name) {
    extras = extras.filter(x => x !== name);
  }

  function handleExtraKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addExtra();
    }
  }

  // -- Submit ----------------------------------------------------------
  function submit() {
    formError = '';
    if (!title.trim())      { formError = 'Title is required.';        return; }
    if (!meeting_date)      { formError = 'Date is required.';         return; }
    if (!meeting_type.trim()){ formError = 'Type is required.';         return; }

    dispatch('submit', {
      title:        title.trim(),
      meeting_type: meeting_type.trim(),
      meeting_date,
      notes:        notes.trim() || null,
      participants: { profile_ids, extras },
      openImmediately
    });
  }

  function cancel() {
    dispatch('close');
  }
</script>

<Modal
  bind:show
  title={meeting ? 'Edit meeting' : 'New meeting'}
  size="medium"
  on:close={cancel}
>
  <div class="space-y-4">

    {#if formError}
      <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">{formError}</p>
    {/if}

    <FormInput
      label="Title"
      type="text"
      bind:value={title}
      placeholder="e.g. 10th May 2026"
      required
    />

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label for="meeting-type" class="block text-sm font-medium mb-1 text-gray-300">
          Type *
        </label>
        <input
          id="meeting-type"
          type="text"
          list="meeting-type-options"
          bind:value={meeting_type}
          class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          placeholder="e.g. Management Meeting"
        />
        <datalist id="meeting-type-options">
          {#each typeOptions as t}
            <option value={t}></option>
          {/each}
        </datalist>
      </div>

      <FormInput
        label="Date"
        type="date"
        bind:value={meeting_date}
        required
      />
    </div>

    <FormTextarea
      label="Notes"
      bind:value={notes}
      placeholder="Optional notes / agenda summary…"
      rows={3}
    />

    <!-- ─── Participants ────────────────────────────────────────── -->
    <div>
      <p class="block text-sm font-medium mb-1 text-gray-300">Participants</p>

      <!-- Profiles: chip-style toggle list -->
      <div class="flex flex-wrap gap-1.5 p-2 bg-slate-700/40 border border-slate-700 rounded mb-2">
        {#if $profiles.list.length === 0}
          <p class="text-xs text-gray-500 italic">No users loaded.</p>
        {:else}
          {#each $profiles.list as p (p.id)}
            {@const selected = profile_ids.includes(p.id)}
            <button
              type="button"
              on:click={() => toggleProfile(p.id)}
              class="text-xs px-2 py-1 rounded border transition-colors
                     {selected
                       ? 'bg-purple-600/30 border-purple-500/60 text-purple-200'
                       : 'bg-slate-800 border-slate-600 text-gray-400 hover:border-slate-500 hover:text-gray-200'}"
            >
              {selected ? '✓ ' : ''}{p.full_name}
            </button>
          {/each}
        {/if}
      </div>

      <!-- Extras: free-text addition + chips -->
      <div class="flex gap-2 mb-1.5">
        <input
          type="text"
          bind:value={newExtra}
          on:keydown={handleExtraKey}
          placeholder="External attendee — name and (optional) company"
          class="flex-1 px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500"
        />
        <Button variant="secondary" size="small" icon="plus" on:click={addExtra}>
          Add
        </Button>
      </div>

      {#if extras.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each extras as name}
            <span class="text-xs px-2 py-1 rounded bg-slate-700 border border-slate-600 text-gray-300 flex items-center gap-1.5">
              {name}
              <button
                type="button"
                on:click={() => removeExtra(name)}
                class="text-gray-500 hover:text-red-400 leading-none"
                title="Remove"
                aria-label={`Remove ${name}`}
              >✕</button>
            </span>
          {/each}
        </div>
      {/if}
    </div>

    {#if !meeting}
      <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
        <input type="checkbox" bind:checked={openImmediately} class="rounded" />
        <span>Open this meeting now (auto-tag new items until closed)</span>
      </label>
    {/if}
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={cancel} disabled={saving}>
      Cancel
    </Button>
    <Button
      variant="primary"
      icon={meeting ? 'edit' : 'plus'}
      on:click={submit}
      disabled={saving}
    >
      {saving ? 'Saving…' : (meeting ? 'Update meeting' : 'Create meeting')}
    </Button>
  </div>
</Modal>
