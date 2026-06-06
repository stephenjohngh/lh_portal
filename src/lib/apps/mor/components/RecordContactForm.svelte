<!-- src/lib/apps/mor/components/RecordContactForm.svelte -->
<!-- Record an outbound reporter (or residents-block) contact event.
     Writes a `reporter_contact` timeline entry with a canonical contact_kind.
     The form is pre-set by the nudge that opened it — staff can adjust the
     freeform `content` summary before submitting. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';

  export let show   = false;
  export let saving = false;
  export let error  = '';

  /** contact_kind value being recorded — preset by the trigger that opened the modal. */
  export let kind   = 'other';
  /** Display string shown in the heading (e.g. "Record reporter contact"). */
  export let title  = 'Record contact';
  /** Optional one-line context shown under the title (e.g. "Reporter notified of BSR escalation"). */
  export let subtitle = '';
  /** Optional pre-fill for the content field. */
  export let initialContent = '';

  const dispatch = createEventDispatcher();

  let content = '';
  let usedDraft = false;
  let contentError = '';

  let prevShow = false;
  $: if (show && !prevShow) {
    content = initialContent;
    usedDraft = false;
    contentError = '';
  }
  $: prevShow = show;

  function validate() {
    contentError = '';
    if (!content.trim()) {
      contentError = 'Please summarise what was sent or said.';
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    const prefix = usedDraft ? '[Used portal draft] ' : '';
    dispatch('submit', {
      kind,
      content: (prefix + content).trim(),
    });
  }
</script>

<Modal {show} {title} size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">

    <ErrorDisplay message={error} onDismiss={() => dispatch('clearError')} />

    {#if subtitle}
      <p class="text-sm text-slate-400">{subtitle}</p>
    {/if}

    <div>
      <label for="contact-content" class="block text-sm font-medium text-slate-300 mb-1">
        What did you send or say? <span class="text-red-400">*</span>
      </label>
      <textarea
        id="contact-content"
        bind:value={content}
        rows="4"
        placeholder="e.g. Sent a letter explaining we have notified the BSR and giving the notice reference. Reporter contacted at the email address provided."
        class="w-full bg-slate-700 border {contentError ? 'border-red-500' : 'border-slate-600'}
               rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500
               focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
      ></textarea>
      {#if contentError}<p class="text-red-400 text-xs mt-1">{contentError}</p>{/if}
    </div>

    <label class="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" bind:checked={usedDraft} class="w-4 h-4 accent-purple-500 mt-0.5" />
      <span class="text-sm text-slate-300">
        I sent the draft letter from the portal
        <span class="block text-xs text-slate-500">Tags the timeline entry so we can audit how often the templates are used.</span>
      </span>
    </label>

  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" size="medium" disabled={saving} on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary"   size="medium" disabled={saving} on:click={handleSubmit}>
      {saving ? 'Saving…' : 'Record contact'}
    </Button>
  </svelte:fragment>
</Modal>
