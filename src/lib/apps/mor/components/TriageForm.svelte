<!-- src/lib/apps/mor/components/TriageForm.svelte -->
<!-- Immutable once submitted — store enforces append-only. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  const dispatch = createEventDispatcher();

  let outcome   = '';
  let rationale = '';

  let outcomeError   = '';
  let rationaleError = '';

  function reset() {
    outcome = ''; rationale = '';
    outcomeError = ''; rationaleError = '';
  }

  function validate() {
    let ok = true;
    outcomeError = ''; rationaleError = '';
    if (!outcome) { outcomeError = 'Select a triage outcome.'; ok = false; }
    if (rationale.trim().length < 50) {
      rationaleError = `Rationale must be at least 50 characters (${rationale.trim().length}/50).`;
      ok = false;
    }
    return ok;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', { outcome, rationale: rationale.trim() });
  }

  function handleClose() {
    reset();
    dispatch('close');
  }
</script>

<Modal {show} title="Record Triage" size="medium" on:close={handleClose}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <div class="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3 text-sm text-amber-200">
      <strong>Important:</strong> Triage entries are immutable once submitted.
      Corrections require a new entry. Apply the two-part BSR threshold test before proceeding.
    </div>

    <!-- Outcome -->
    <div>
      <p class="text-sm font-medium text-slate-300 mb-2">
        Triage outcome <span class="text-red-400">*</span>
      </p>
      <div class="space-y-2">
        {#each [
          { value: 'clearly_reportable',  label: 'Clearly reportable',
            desc: 'Both Part A (severity) and Part B (mechanism) are clearly met. Proceed to decision.',
            colour: 'border-red-600/50 bg-red-900/20' },
          { value: 'possibly_reportable', label: 'Possibly reportable',
            desc: 'Further technical assessment needed before decision.',
            colour: 'border-amber-600/50 bg-amber-900/20' },
          { value: 'not_reportable',      label: 'Not reportable as MOR',
            desc: 'Threshold not met. Route to complaints, maintenance, or FRA review.',
            colour: 'border-emerald-700/50 bg-emerald-900/20' },
        ] as opt}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="p-3 rounded-lg border cursor-pointer transition-colors
                   {outcome === opt.value
                     ? opt.colour + ' ring-2 ring-purple-500'
                     : 'border-slate-600 bg-slate-800/40 hover:border-slate-500'}"
            on:click={() => outcome = opt.value}
          >
            <p class="text-sm font-semibold text-slate-200">{opt.label}</p>
            <p class="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
          </div>
        {/each}
      </div>
      {#if outcomeError}<p class="text-red-400 text-xs mt-1">{outcomeError}</p>{/if}
    </div>

    <!-- Rationale -->
    <div>
      <label for="triage-rationale" class="block text-sm font-medium text-slate-300 mb-1">
        Rationale <span class="text-red-400">*</span>
        <span class="text-slate-500 font-normal text-xs ml-1">minimum 50 characters — must be auditable</span>
      </label>
      <textarea
        id="triage-rationale"
        bind:value={rationale}
        rows="5"
        placeholder="Explain the threshold analysis: Part A (severity — significant number of deaths/serious injuries?) and Part B (mechanism — structural failure or fire/smoke spread?). Include relevant observations and any alternative routes considered."
        class="w-full bg-slate-700 border {rationaleError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if rationaleError}
        <p class="text-red-400 text-xs mt-1">{rationaleError}</p>
      {:else}
        <p class="text-slate-600 text-xs mt-1">{rationale.trim().length} characters</p>
      {/if}
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={handleClose}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Record Triage'}
    </Button>
  </svelte:fragment>
</Modal>
