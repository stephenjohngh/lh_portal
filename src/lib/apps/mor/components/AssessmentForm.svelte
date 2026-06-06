<!-- src/lib/apps/mor/components/AssessmentForm.svelte -->
<!-- Record the outcome of a technical advisor assessment.
     Advances the case from in_assessment to decision_pending. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  const dispatch = createEventDispatcher();

  let advisorName = '';
  let summary     = '';
  let summaryError = '';

  let prevShow = false;
  $: if (show && !prevShow) {
    advisorName = '';
    summary     = '';
    summaryError = '';
  }
  $: prevShow = show;

  function validate() {
    summaryError = '';
    if (!summary.trim()) { summaryError = 'Assessment summary is required.'; return false; }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', { advisorName: advisorName.trim(), summary: summary.trim() });
  }
</script>

<Modal {show} title="Record Assessment Complete" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <p class="text-sm text-slate-400">
      Record the outcome of the technical advisor's assessment. The case will move to
      <strong class="text-slate-300">Decision Pending</strong>.
    </p>

    <div>
      <label for="advisor-name" class="block text-sm font-medium text-slate-300 mb-1">
        Advisor name / firm
      </label>
      <input
        id="advisor-name"
        type="text"
        bind:value={advisorName}
        placeholder="e.g. J Smith, ABC Engineers"
        class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
               text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>

    <div>
      <label for="assess-summary" class="block text-sm font-medium text-slate-300 mb-1">
        Assessment summary <span class="text-red-400">*</span>
      </label>
      <textarea
        id="assess-summary"
        bind:value={summary}
        rows="5"
        placeholder="Summarise the technical opinion — mechanism, severity, threshold conclusion…"
        class="w-full bg-slate-700 border {summaryError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if summaryError}<p class="text-red-400 text-xs mt-1">{summaryError}</p>{/if}
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Record Assessment'}
    </Button>
  </svelte:fragment>
</Modal>
