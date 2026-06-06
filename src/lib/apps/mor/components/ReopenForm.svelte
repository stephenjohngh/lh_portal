<!-- src/lib/apps/mor/components/ReopenForm.svelte -->
<!-- Admin-only: reopen a closed case for further work. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  const dispatch = createEventDispatcher();

  let reason = '';
  let reasonError = '';

  let prevShow = false;
  $: if (show && !prevShow) { reason = ''; reasonError = ''; }
  $: prevShow = show;

  function validate() {
    reasonError = '';
    if (!reason.trim()) { reasonError = 'Please provide a reason for reopening.'; return false; }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    dispatch('submit', { reason: reason.trim() });
  }
</script>

<Modal {show} title="Reopen Case" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <p class="text-sm text-slate-400">
      Reopening will restart the workflow in <strong class="text-slate-300">In Triage</strong>
      with the existing case history retained.
    </p>

    <div>
      <label for="reopen-reason" class="block text-sm font-medium text-slate-300 mb-1">
        Reason for reopening <span class="text-red-400">*</span>
      </label>
      <textarea
        id="reopen-reason"
        bind:value={reason}
        rows="4"
        placeholder="New information received, BSR follow-up, recurrence, etc."
        class="w-full bg-slate-700 border {reasonError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if reasonError}<p class="text-red-400 text-xs mt-1">{reasonError}</p>{/if}
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Reopen Case'}
    </Button>
  </svelte:fragment>
</Modal>
