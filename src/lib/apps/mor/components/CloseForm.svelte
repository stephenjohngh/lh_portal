<!-- src/lib/apps/mor/components/CloseForm.svelte -->
<!-- Close a remediated case and capture lessons learned. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  const dispatch = createEventDispatcher();

  let lessonsLearned = '';

  let prevShow = false;
  $: if (show && !prevShow) lessonsLearned = '';
  $: prevShow = show;

  function handleSubmit() {
    dispatch('submit', { lessonsLearned: lessonsLearned.trim() });
  }
</script>

<Modal {show} title="Close Case" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    <p class="text-sm text-slate-400">
      Closing a case is a formal end-of-life step. The audit trail is retained;
      only an admin can reopen a closed case.
    </p>

    <div>
      <label for="lessons-learned" class="block text-sm font-medium text-slate-300 mb-1">
        Lessons learned <span class="text-slate-500 font-normal">(recommended)</span>
      </label>
      <textarea
        id="lessons-learned"
        bind:value={lessonsLearned}
        rows="5"
        placeholder="What can be improved or applied to future cases? Inspection gaps, escalation timing, communication, mitigation choices…"
        class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2
               text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
    </div>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Close Case'}
    </Button>
  </svelte:fragment>
</Modal>
