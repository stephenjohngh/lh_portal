<!-- src/lib/apps/issues/components/CommentItem.svelte -->
<!--
  Single comment row. Two render modes:
    - Edit mode (when editingComment.id matches): inline edit form.
    - Display mode: text + action buttons + metadata + (when open)
                    a CommentSuggestionPanel underneath.

  All state is owned by CommentsSection; this file is mostly markup +
  event dispatch. Bindable props:
    - editingComment   (so the edit form's textarea/checkbox bind back up)
    - suggestionDraft  (so the panel's draft text binds back up)
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtDateTime, fmtDate, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS } from '$lib/utils/constants';
  import Button             from '$lib/components/common/Button.svelte';
  import ProtectedButton    from '$lib/components/common/ProtectedButton.svelte';
  import MeetingBadge       from './meetings/MeetingBadge.svelte';
  import CommentSuggestionPanel from './CommentSuggestionPanel.svelte';

  // -- Props -----------------------------------------------------------
  export let comment;
  export let editingComment    = null;   // bindable — when .id matches comment, edit mode
  export let saving            = false;  // edit-form save flag from parent

  export let panelOpen         = false;
  export let panelMode         = 'comment';
  export let linkedAction      = null;
  export let suggestionDraft   = '';     // bindable
  export let suggestionLoading = false;
  export let suggestionInfo    = '';
  export let suggestionError   = '';
  export let suggestionSaving  = false;
  export let linkedDeleteError = '';

  const dispatch = createEventDispatcher();

  $: hasLinked        = !!linkedAction;
  $: linkedCompleted  = linkedAction?.status === ACTION_STATUS.COMPLETED;

  // Panel toggle button only shown for non-completed linked actions (or no link yet).
  // Completed actions are hidden in ActionsSection by default so "jump to action" breaks.
  $: showPanelToggle  = !linkedCompleted;

  $: actionIcon  = panelOpen
                     ? 'chevron-up'
                     : (hasLinked ? 'chevron-down' : 'clipboard');
  $: actionTitle = panelOpen
                     ? (hasLinked ? 'Hide linked action' : 'Hide suggestion')
                     : (hasLinked ? 'Show linked action' : 'Create Linked Action');

  function cancelEdit() {
    dispatch('editCancel');
  }
</script>

{#if editingComment?.id === comment.id}
  <!-- ─── Edit mode ──────────────────────────────────────────── -->
  <div class="bg-slate-700/50 rounded p-3 border border-blue-500/50">
    <textarea
      bind:value={editingComment.comment_text}
      class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      rows="5"
    ></textarea>
    <label class="flex items-center gap-2 mt-2 text-sm cursor-pointer">
      <input type="checkbox" bind:checked={editingComment.historic} class="rounded" />
      <span class="text-gray-400">Mark as historic</span>
    </label>
    <div class="flex justify-end gap-2 mt-2">
      <Button variant="secondary" size="small" on:click={cancelEdit}>Cancel</Button>
      <ProtectedButton
        action="modify"
        variant="blue"
        size="small"
        icon="edit"
        disabled={saving}
        on:click={() => dispatch('editSave')}
      >
        {saving ? 'Saving…' : 'Update'}
      </ProtectedButton>
    </div>
  </div>

{:else}
  <!-- ─── Display mode ───────────────────────────────────────── -->
  <div
    id={`comment-${comment.id}`}
    class="bg-slate-700/50 rounded p-2 border-l-2 border-blue-400 {comment.historic ? 'opacity-60' : ''}"
  >
    <div class="flex justify-between items-start gap-2">

      <!-- Text: max 5 lines with scroll; click opens full view -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex-1 overflow-y-auto max-h-[6.5rem] rounded cursor-pointer hover:bg-slate-600/20 transition-colors px-1"
        title="Click to view full comment"
        on:click={() => dispatch('viewFull', comment)}
      >
        <p class="text-gray-200 text-sm whitespace-pre-wrap">{comment.comment_text}</p>
      </div>

      <div class="flex gap-1 flex-shrink-0">
        {#if showPanelToggle}
          <ProtectedButton
            action="modify"
            variant="secondary"
            size="small"
            icon={actionIcon}
            iconPosition="only"
            on:click={() => dispatch('togglePanel', comment)}
            title={actionTitle}
          />
        {/if}
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="edit"
          iconPosition="only"
          on:click={() => dispatch('editStart', comment)}
          title="Edit comment"
        />
        <ProtectedButton
          action="modify"
          variant="danger"
          size="small"
          icon="delete"
          iconPosition="only"
          on:click={() => dispatch('deleteRequest', comment)}
          title="Delete comment"
        />
      </div>
    </div>

    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
      <span>Added: {fmtDateTime(comment.created_at, comment.created_by_profile?.full_name)}</span>
      {#if wasModified(comment.created_at, comment.updated_at)}
        <span>•</span>
        <span>Modified: {fmtDateTime(comment.updated_at, comment.updated_by_profile?.full_name)}</span>
      {/if}
      {#if comment.historic}
        <span>•</span>
        <span class="text-amber-400">Historic</span>
      {/if}
      {#if hasLinked}
        <span>•</span>
        <span class="text-purple-400/80" title={`Linked action: ${linkedAction.action_text}`}>
          🔗 Has linked action
        </span>
      {/if}
      {#if comment.meeting_id}
        <MeetingBadge
          meetingId={comment.meeting_id}
          on:click={(e) => dispatch('meetingFilter', e.detail)}
        />
      {/if}
    </div>

    {#if hasLinked && !panelOpen}
      <div class="mt-2 pl-2 border-l-2 rounded-r py-1.5 pr-2
                  {linkedCompleted
                    ? 'border-slate-600/50 bg-slate-800/30 opacity-50'
                    : 'border-amber-500/50 bg-amber-900/10'}">
        <p class="text-xs font-medium whitespace-pre-wrap
                  {linkedCompleted ? 'line-through text-gray-400' : 'text-amber-200'}">
          {linkedAction.action_text}
        </p>
        <div class="flex flex-wrap gap-2 mt-0.5 text-[10px] text-gray-400">
          {#if linkedAction.name_text}<span>👤 {linkedAction.name_text}</span>{/if}
          {#if linkedAction.date_deadline}<span>📅 {fmtDate(linkedAction.date_deadline)}</span>{/if}
          <span class="capitalize">{linkedAction.status}</span>
        </div>
      </div>
    {/if}

    {#if panelOpen}
      <CommentSuggestionPanel
        mode={panelMode}
        {linkedAction}
        loading={suggestionLoading}
        bind:draft={suggestionDraft}
        info={suggestionInfo}
        error={suggestionError}
        saving={suggestionSaving}
        {linkedDeleteError}
        on:dismiss             on:addAction
        on:viewLinked          on:deleteLinkedRequest
      />
    {/if}
  </div>
{/if}
