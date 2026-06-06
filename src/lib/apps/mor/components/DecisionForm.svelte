<!-- src/lib/apps/mor/components/DecisionForm.svelte -->
<!-- AP proposes a decision. A different user (PAP) must approve. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';
  /** Pass the case's existing decision_outcome if re-proposing */
  export let existingOutcome   = '';
  export let existingRationale = '';

  const dispatch = createEventDispatcher();

  let outcome   = '';
  let rationale = '';

  let outcomeError   = '';
  let rationaleError = '';

  // Reset internal state every time the modal is (re-)opened, populating
  // from `existing*` props for revise flows. Outside of `show` toggles the
  // user's selection is preserved (the prior reactive overwrote it on every
  // prop change).
  $: if (show) {
    outcome      = existingOutcome   ?? '';
    rationale    = existingRationale ?? '';
    outcomeError = '';
    rationaleError = '';
  }

  function reset() {
    outcome = existingOutcome ?? ''; rationale = existingRationale ?? '';
    outcomeError = ''; rationaleError = '';
  }

  function validate() {
    let ok = true;
    outcomeError = ''; rationaleError = '';
    if (!outcome) { outcomeError = 'Select a decision outcome.'; ok = false; }
    if (rationale.trim().length < 30) {
      rationaleError = `Rationale must be at least 30 characters (${rationale.trim().length}/30).`;
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

<Modal {show} title="Propose Decision" size="medium" on:close={handleClose}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <p class="text-sm text-slate-400">
      This decision must be approved by a <strong class="text-slate-300">different user</strong>
      (PAP). You cannot approve your own decision.
    </p>

    <!-- Decision outcome -->
    <div>
      <p class="text-sm font-medium text-slate-300 mb-2">
        Decision <span class="text-red-400">*</span>
      </p>
      <div class="space-y-2">
        {#each [
          { value: 'bsr',       label: 'Report to BSR',
            desc: 'Both MOR threshold parts are met. Submit notice to BSR as soon as possible; full report within 10 calendar days.',
            colour: 'border-orange-600/50 bg-orange-900/20' },
          { value: 'internal',  label: 'Internal remediation',
            desc: 'Threshold not met but an internal safety action is warranted. No BSR submission.',
            colour: 'border-amber-600/50 bg-amber-900/20' },
          { value: 'no_action', label: 'No further action',
            desc: 'Threshold not met and no further action is required. Case will be closed.',
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
      <label for="decision-rationale" class="block text-sm font-medium text-slate-300 mb-1">
        Rationale <span class="text-red-400">*</span>
      </label>
      <textarea
        id="decision-rationale"
        bind:value={rationale}
        rows="4"
        placeholder="State the reasoning for this decision, referencing the triage and any technical assessments…"
        class="w-full bg-slate-700 border {rationaleError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if rationaleError}<p class="text-red-400 text-xs mt-1">{rationaleError}</p>{/if}
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={handleClose}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Propose Decision'}
    </Button>
  </svelte:fragment>
</Modal>
