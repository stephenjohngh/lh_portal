<!-- src/lib/apps/mor/components/PauseForm.svelte -->
<!-- Pause a case while we wait for the reporter or for the BSR. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show       = false;
  export let saving     = false;
  export let error      = '';
  export let pauseType  = 'reporter';  // 'reporter' | 'bsr'

  const dispatch = createEventDispatcher();

  let reason = '';

  let prevShow = false;
  $: if (show && !prevShow) reason = '';
  $: prevShow = show;

  $: title = pauseType === 'bsr'
    ? 'Pause — Awaiting BSR Response'
    : 'Pause — Awaiting Reporter Information';

  function handleSubmit() {
    dispatch('submit', { pauseType, reason: reason.trim() });
  }
</script>

<Modal {show} {title} size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <p class="text-sm text-slate-400">
      The case will be paused. Routine SLA clocks suspend; the statutory BSR
      10-day clock keeps running regardless.
    </p>

    <div>
      <label for="pause-reason" class="block text-sm font-medium text-slate-300 mb-1">
        Reason / details
      </label>
      <textarea
        id="pause-reason"
        bind:value={reason}
        rows="4"
        placeholder="What are we waiting for? When do we expect to resume?"
        class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
               text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Pause Case'}
    </Button>
  </svelte:fragment>
</Modal>
