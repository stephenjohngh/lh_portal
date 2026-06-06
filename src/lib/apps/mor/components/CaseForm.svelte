<!-- src/lib/apps/mor/components/CaseForm.svelte -->
<!-- Create a new MOR case. Any authenticated user can log a case. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  const dispatch = createEventDispatcher();

  // ── form state ──────────────────────────────────────────────────────────────
  let description        = '';
  let location_text      = '';
  let mechanism          = 'unknown';
  let urgency            = false;
  let channel            = 'staff_logged';
  let reporter_type      = 'unknown';
  let reporter_name      = '';
  let reporter_contact   = '';
  let is_anonymous       = false;
  let identification_date = '';  // datetime-local string

  // Validation errors
  let descError = '';
  let dateError = '';

  // ── reactive ────────────────────────────────────────────────────────────────
  $: if (is_anonymous) { reporter_name = ''; reporter_contact = ''; }

  // Default identification_date to now when form opens
  $: if (show && !identification_date) {
    const now = new Date();
    // datetime-local needs 'YYYY-MM-DDTHH:mm'
    identification_date = now.toISOString().slice(0, 16);
  }

  function reset() {
    description = ''; location_text = ''; mechanism = 'unknown';
    urgency = false; channel = 'staff_logged'; reporter_type = 'unknown';
    reporter_name = ''; reporter_contact = ''; is_anonymous = false;
    identification_date = new Date().toISOString().slice(0, 16);
    descError = ''; dateError = '';
  }

  function validate() {
    let ok = true;
    descError = '';
    dateError = '';
    if (!description.trim()) { descError = 'Description is required.'; ok = false; }
    if (description.trim().length < 20) { descError = 'Please provide at least 20 characters.'; ok = false; }
    if (!identification_date) { dateError = 'Identification date/time is required.'; ok = false; }
    return ok;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', {
      description,
      location_text,
      mechanism,
      urgency,
      channel,
      reporter_type: is_anonymous ? 'anonymous' : reporter_type,
      reporter_name,
      reporter_contact,
      is_anonymous,
      identification_date: new Date(identification_date).toISOString(),
    });
  }

  function handleClose() {
    reset();
    dispatch('close');
  }
</script>

<Modal {show} title="Log New MOR Case" size="large" on:close={handleClose}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <!-- ── Description ──────────────────────────────────────────────────── -->
    <div>
      <label for="mor-description" class="block text-sm font-medium text-slate-300 mb-1">
        Description <span class="text-red-400">*</span>
      </label>
      <textarea
        id="mor-description"
        bind:value={description}
        rows="4"
        placeholder="Describe the occurrence or risk in detail — what was observed, where, and when…"
        class="w-full bg-slate-700 border {descError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if descError}<p class="text-red-400 text-xs mt-1">{descError}</p>{/if}
    </div>

    <!-- ── Identification date ──────────────────────────────────────────── -->
    <div>
      <label for="mor-id-date" class="block text-sm font-medium text-slate-300 mb-1">
        Date / time identified
        <span class="text-red-400">*</span>
        <span class="text-slate-500 font-normal text-xs ml-1">— the BSR 10-day clock starts here</span>
      </label>
      <input
        id="mor-id-date"
        type="datetime-local"
        bind:value={identification_date}
        class="bg-slate-700 border {dateError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white
               focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {#if dateError}<p class="text-red-400 text-xs mt-1">{dateError}</p>{/if}
    </div>

    <!-- ── Location + Mechanism ─────────────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="mor-location" class="block text-sm font-medium text-slate-300 mb-1">Location</label>
        <input
          id="mor-location"
          type="text"
          bind:value={location_text}
          placeholder="e.g. Level 6 east corridor"
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
                 text-sm text-white placeholder-slate-500
                 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>
      <div>
        <label for="mor-mechanism" class="block text-sm font-medium text-slate-300 mb-1">Mechanism</label>
        <select
          id="mor-mechanism"
          bind:value={mechanism}
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
                 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="unknown">Unknown / assessing</option>
          <option value="structural">Structural failure</option>
          <option value="fire_smoke">Fire / smoke spread</option>
          <option value="both">Both</option>
        </select>
      </div>
    </div>

    <!-- ── Channel + Urgency ────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="mor-channel" class="block text-sm font-medium text-slate-300 mb-1">Reported via</label>
        <select
          id="mor-channel"
          bind:value={channel}
          class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
                 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="staff_logged">Logged by staff</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="in_person">In person</option>
          <option value="paper">Paper form</option>
          <option value="online">Online form</option>
        </select>
      </div>
      <div class="flex flex-col justify-end">
        <label class="flex items-center gap-3 cursor-pointer p-3 rounded-lg border
                      {urgency ? 'border-red-600/50 bg-red-900/20' : 'border-slate-600 bg-slate-700/30'}
                      transition-colors">
          <input type="checkbox" bind:checked={urgency} class="w-4 h-4 accent-red-500" />
          <div>
            <p class="text-sm font-medium {urgency ? 'text-red-300' : 'text-slate-300'}">Urgent</p>
            <p class="text-xs text-slate-500">Immediate risk to life</p>
          </div>
        </label>
      </div>
    </div>

    <!-- ── Reporter ─────────────────────────────────────────────────────── -->
    <div class="border border-slate-700 rounded-lg p-3 space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-slate-300">Reporter details</p>
        <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
          <input type="checkbox" bind:checked={is_anonymous} class="w-3.5 h-3.5 accent-purple-500" />
          Anonymous
        </label>
      </div>

      {#if !is_anonymous}
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label for="mor-reporter-type" class="block text-xs text-slate-400 mb-1">Type</label>
            <select
              id="mor-reporter-type"
              bind:value={reporter_type}
              class="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5
                     text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="unknown">Unknown</option>
              <option value="resident">Resident</option>
              <option value="contractor">Contractor</option>
              <option value="staff">Staff</option>
              <option value="ap">Accountable Person</option>
              <option value="visitor">Visitor</option>
            </select>
          </div>
          <div>
            <label for="mor-reporter-name" class="block text-xs text-slate-400 mb-1">Name</label>
            <input
              id="mor-reporter-name"
              type="text"
              bind:value={reporter_name}
              placeholder="Optional"
              class="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5
                     text-sm text-white placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label for="mor-reporter-contact" class="block text-xs text-slate-400 mb-1">Contact</label>
            <input
              id="mor-reporter-contact"
              type="text"
              bind:value={reporter_contact}
              placeholder="Email / phone"
              class="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5
                     text-sm text-white placeholder-slate-500
                     focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      {:else}
        <p class="text-xs text-slate-500 italic">No contact details will be recorded.</p>
      {/if}
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={handleClose}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Log Case'}
    </Button>
  </svelte:fragment>
</Modal>
