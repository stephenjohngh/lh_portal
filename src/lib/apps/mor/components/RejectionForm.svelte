<!-- src/lib/apps/mor/components/RejectionForm.svelte -->
<!-- PAP rejects a proposed decision and sends the case back to triage. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  const dispatch = createEventDispatcher();

  let rejectionReason = '';
  let reasonError = '';

  let prevShow = false;
  $: if (show && !prevShow) { rejectionReason = ''; reasonError = ''; }
  $: prevShow = show;

  function validate() {
    reasonError = '';
    if (!rejectionReason.trim()) { reasonError = 'Provide a reason for rejection.'; return false; }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', { rejectionReason: rejectionReason.trim() });
  }
</script>

<Modal {show} title="Reject Proposed Decision" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <p class="text-sm text-slate-400">
      The case will be returned to <strong class="text-slate-300">In Triage</strong>
      and the decision fields cleared. The proposer can revise and resubmit.
    </p>

    <div>
      <label for="rejection-reason" class="block text-sm font-medium text-slate-300 mb-1">
        Reason for rejection <span class="text-red-400">*</span>
      </label>
      <textarea
        id="rejection-reason"
        bind:value={rejectionReason}
        rows="4"
        placeholder="Why is this decision not appropriate? What needs to change?"
        class="w-full bg-slate-700 border {reasonError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if reasonError}<p class="text-red-400 text-xs mt-1">{reasonError}</p>{/if}
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="danger"    size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Reject Decision'}
    </Button>
  </svelte:fragment>
</Modal>
