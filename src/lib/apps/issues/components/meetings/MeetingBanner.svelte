<!-- src/lib/apps/issues/components/meetings/MeetingBanner.svelte -->
<!--
  Top-of-page banner shown on the Issues tab while a meeting is open.
  Auto-vanishes when the meeting closes.

  Live counters of issues / comments / actions tagged to the open
  meeting are computed from the parent's issues prop.

  Two buttons:
    "Edit"  — dispatches 'edit' (parent opens MeetingForm).
    "Close" — closes the meeting via meetingsStore.

  Meeting management (view minutes, reopen, delete) lives in the
  Meetings tab — this banner is intentionally minimal.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { meetingsStore }    from '../../stores/meetingsStore';
  import { fmtDate }          from '$lib/utils/dates';
  import Button               from '$lib/components/common/Button.svelte';
  import ProtectedButton      from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog        from '$lib/components/common/ConfirmDialog.svelte';

  export let issues = [];     // live issues list

  const dispatch = createEventDispatcher();

  let closing            = false;
  let showCloseConfirm   = false;
  let pageError          = '';

  $: meeting = $meetingsStore.current;

  // -- Counts of items tagged to the open meeting -------------------
  $: counts = (() => {
    if (!meeting) return { issues: 0, comments: 0, actions: 0 };
    let i = 0, c = 0, a = 0;
    for (const issue of issues) {
      if (issue.meeting_id === meeting.id) i++;
      for (const cm of issue.comments || []) if (cm.meeting_id === meeting.id) c++;
      for (const ac of issue.actions  || []) if (ac.meeting_id === meeting.id) a++;
    }
    return { issues: i, comments: c, actions: a };
  })();

  $: countsText = (() => {
    const parts = [];
    if (counts.issues)   parts.push(`${counts.issues} issue${counts.issues   === 1 ? '' : 's'}`);
    if (counts.actions)  parts.push(`${counts.actions} action${counts.actions === 1 ? '' : 's'}`);
    if (counts.comments) parts.push(`${counts.comments} comment${counts.comments === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') + ' tagged' : 'no items tagged yet';
  })();

  async function handleClose() {
    if (!meeting) return;
    closing  = true;
    pageError = '';
    const result = await meetingsStore.close(meeting.id);
    closing  = false;
    showCloseConfirm = false;
    if (!result.success) pageError = result.error ?? 'Failed to close meeting';
  }
</script>

{#if meeting}
  <div class="rounded-lg border-2 border-amber-500/60 bg-amber-900/20 px-4 py-3 mb-4
              flex items-start justify-between gap-3 flex-wrap shadow-lg shadow-amber-500/10">

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-amber-300 text-base">🟡</span>
        <span class="font-semibold text-white">Meeting in progress:</span>
        <span class="text-amber-100">{meeting.title}</span>
        <span class="text-xs text-amber-400/80">
          ({fmtDate(meeting.meeting_date)} · {meeting.meeting_type})
        </span>
      </div>
      <p class="text-xs text-amber-200/70 mt-0.5">
        New issues, actions and comments will be tagged automatically · {countsText}
      </p>
      {#if pageError}
        <p class="text-xs text-red-300 mt-1">{pageError}</p>
      {/if}
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        icon="edit"
        iconPosition="only"
        on:click={() => dispatch('edit', meeting)}
        title="Edit meeting details"
      />
      <ProtectedButton
        action="modify"
        variant="primary"
        size="small"
        icon="close"
        on:click={() => showCloseConfirm = true}
        disabled={closing}
      >
        {closing ? 'Closing…' : 'Close meeting'}
      </ProtectedButton>
    </div>
  </div>

  <ConfirmDialog
    show={showCloseConfirm}
    title="Close meeting"
    message={`Close "${meeting.title}"? ${countsText.charAt(0).toUpperCase() + countsText.slice(1)}. New items added after closing will not be tagged.`}
    confirmText="Close meeting"
    cancelText="Cancel"
    on:confirm={handleClose}
    on:cancel={() => showCloseConfirm = false}
  />
{/if}
