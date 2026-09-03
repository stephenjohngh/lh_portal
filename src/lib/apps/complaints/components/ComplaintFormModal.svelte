<!-- src/lib/apps/complaints/components/ComplaintFormModal.svelte -->
<!-- Logging a complaint. P0 is staff-logged only — most arrive by email or in
     person, and the public form is P2.

     Two things this form is opinionated about, both from the design:

     • Scope is a DECISION. Marking something out of scope requires a reason,
       enforced by a CHECK constraint as well as by this form, because a
       complaint dismissed with no record is indistinguishable from one nobody
       read.

     • A contact is asked for, and the reason is given. A complaint cannot be
       fully anonymous the way a MOR report can — the duty is to investigate AND
       respond, and there is nobody to respond to. Somebody who still declines
       is recorded as "Not given", which is a visible state rather than a gap. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { CATEGORIES, CHANNELS, COMPLAINANT_TYPES, asOptions } from '../utils/complaintOptions.js';

  export let show = false;

  const dispatch = createEventDispatcher();

  let subject = '';
  let description = '';
  let category = 'fire_safety';
  let channel = 'email';
  let complainantName = '';
  let complainantContact = '';
  let complainantType = 'resident';
  let entitlementBasis = '';
  let dwellingRef = '';
  let scopeRationale = '';

  let saving = false;
  let error = '';

  // Guarded on `show` rather than on an object, so re-opening always starts
  // clean and a parent re-render never wipes what is being typed.
  let opened = false;
  $: if (show !== opened) {
    opened = show;
    if (show) {
      subject = ''; description = ''; category = 'fire_safety'; channel = 'email';
      complainantName = ''; complainantContact = ''; complainantType = 'resident';
      entitlementBasis = ''; dwellingRef = ''; scopeRationale = '';
      saving = false; error = '';
    }
  }

  $: inScope = category !== 'out_of_scope';
  $: categoryHint = CATEGORIES.find(c => c.value === category)?.hint ?? '';

  export function fail(message) { saving = false; error = message; }

  function save() {
    if (!subject.trim())     { error = 'A short subject is needed.'; return; }
    if (!description.trim()) { error = 'Record what was said.'; return; }
    if (!inScope && !scopeRationale.trim()) {
      error = 'Say why this is not a building-safety complaint — it goes on the record.';
      return;
    }

    saving = true;
    error = '';
    dispatch('save', {
      subject: subject.trim(),
      description: description.trim(),
      category,
      in_scope: inScope,
      scope_rationale: inScope ? null : scopeRationale.trim(),
      channel,
      complainant_name: complainantName.trim() || null,
      complainant_contact: complainantContact.trim() || null,
      complainant_type: complainantType,
      entitlement_basis: entitlementBasis.trim() || null,
      dwelling_ref: dwellingRef.trim() || null,
    });
  }

  function close() { show = false; dispatch('close'); }
</script>

<Modal bind:show title="Log a complaint" size="large" on:close={close}>
  <div class="space-y-3">
    {#if error}
      <ErrorDisplay message={error} onDismiss={() => error = ''} />
    {/if}

    <FormInput label="Subject" bind:value={subject}
               placeholder="e.g. Fire door on the third floor will not close" />

    <FormTextarea label="What was said" bind:value={description} rows={4}
                  placeholder="In the complainant's own words as far as possible" />

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <FormSelect label="What it is about" bind:value={category}
                    placeholder="" options={asOptions(CATEGORIES)} />
        {#if categoryHint}
          <p class="text-[11px] text-slate-500 -mt-2">{categoryHint}</p>
        {/if}
      </div>
      <FormSelect label="How it reached us" bind:value={channel}
                  placeholder="" options={asOptions(CHANNELS)} />
    </div>

    {#if !inScope}
      <!-- Not a refusal — a redirection, and one that has to be justified. -->
      <div class="p-3 rounded border border-amber-500/40 bg-amber-500/10 space-y-2">
        <p class="text-xs text-amber-200">
          This will still be recorded and given a reference. Say why it is not a
          building-safety complaint, and where it is going instead — the
          regulator may ask how many were judged out of scope and why.
        </p>
        <FormTextarea label="Why it is out of scope" bind:value={scopeRationale} rows={2}
                      placeholder="e.g. Noise between flats — passed to Management as an issue" />
      </div>
    {/if}

    <div class="border-t border-slate-700 pt-3 space-y-3">
      <p class="text-xs text-slate-400">
        Who complained — <span class="text-slate-500">held against this
        complaint only, not as a resident record.</span>
      </p>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <FormInput label="Name" bind:value={complainantName} placeholder="Optional" />
        <FormInput label="How to reply" bind:value={complainantContact}
                   placeholder="Email or phone" />
        <FormSelect label="They are" bind:value={complainantType}
                    placeholder="" options={asOptions(COMPLAINANT_TYPES)} />
      </div>

      {#if !complainantContact.trim()}
        <p class="text-[11px] text-amber-400/90">
          With no way to reply, this complaint can be investigated but not
          answered. Record it if they insist — set "They are" to
          <em>Not given</em> — but ask first.
        </p>
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormInput label="Flat or area (optional)" bind:value={dwellingRef}
                   placeholder="e.g. Flat 12, or Bin store" />
        <FormInput label="How we know they are entitled (optional)"
                   bind:value={entitlementBasis}
                   placeholder="e.g. Known resident of Flat 12" />
      </div>
      <p class="text-[11px] text-slate-500 -mt-2">
        Free text on purpose. The duty concerns residents and owners, but if in
        doubt take the complaint — one wrongly refused is worse than one wrongly
        accepted.
      </p>
    </div>
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" disabled={saving} on:click={close}>Cancel</Button>
    <Button variant="primary" disabled={saving} on:click={save}>
      {saving ? 'Logging…' : 'Log complaint'}
    </Button>
  </div>
</Modal>
