<!-- src/lib/apps/issues/components/ActivityItem.svelte -->
<!--
  Single activity row. Handles both comment and decision activity types.
  Formerly: CommentItem (comment type) + DecisionItem (decision type).

  Two render modes per item:
    - Edit mode (when editingActivity.id matches): inline edit form.
    - Display mode: text + action buttons + metadata + (for comments, when
                    open) a CommentSuggestionPanel underneath.

  All state is owned by ActivityLogSection; this file is mostly markup +
  event dispatch. Bindable props:
    - editingActivity  (so the edit form's textarea/checkbox bind back up)
    - suggestionDraft  (so the panel's draft text binds back up)

  Colour scheme by activity_type:
    comment  → blue  border (border-blue-400)
    decision → violet border (border-violet-400)
    others   → slate border  (border-slate-400)
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtDateTime, fmtDate, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTIVITY_TYPE } from '$lib/utils/constants';
  import { permissions }    from '$lib/stores/permissions';
  import Button             from '$lib/components/common/Button.svelte';
  import ProtectedButton    from '$lib/components/common/ProtectedButton.svelte';
  import MeetingBadge       from './meetings/MeetingBadge.svelte';
  import CommentSuggestionPanel from './CommentSuggestionPanel.svelte';

  // -- Props -----------------------------------------------------------
  export let activity;
  export let editingActivity   = null;   // bindable — when .id matches, edit mode
  export let saving            = false;  // edit-form save flag from parent

  // Suggestion panel props (only used for comment-type activities)
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

  $: isComment  = activity.activity_type === ACTIVITY_TYPE.COMMENT  || !activity.activity_type;
  $: isDecision = activity.activity_type === ACTIVITY_TYPE.DECISION;

  // Border colour by type
  $: borderColor = isDecision ? 'border-violet-400'
                 : isComment  ? 'border-blue-400'
                 : 'border-slate-400';

  // Suggestion panel: only for comment-type activities
  $: hasLinked       = !!linkedAction;
  $: linkedCompleted = linkedAction?.status === ACTION_STATUS.COMPLETED;
  $: showPanelToggle = isComment && !linkedCompleted;

  $: actionIcon  = panelOpen
                     ? 'chevron-up'
                     : (hasLinked ? 'chevron-down' : 'clipboard');
  $: actionTitle = panelOpen
                     ? (hasLinked ? 'Hide linked action' : 'Hide suggestion')
                     : (hasLinked ? 'Show linked action' : 'Create Linked Action');

  function cancelEdit() {
    dispatch('editCancel');
  }

  // Ring colour for the edit form border
  $: ringColor = isDecision ? 'focus:ring-violet-500' : 'focus:ring-blue-500';
  $: borderEditColor = isDecision ? 'border-violet-500/50' : 'border-blue-500/50';
</script>

{#if editingActivity?.id === activity.id}
  <!-- ─── Edit mode ──────────────────────────────────────────── -->
  <div class="bg-slate-700/50 rounded p-3 border {borderEditColor}">
    <textarea
      bind:value={editingActivity.body}
      class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 {ringColor} resize-y"
      rows={isDecision ? 4 : 5}
    ></textarea>
    <label class="flex items-center gap-2 mt-2 text-sm cursor-pointer">
      <input type="checkbox" bind:checked={editingActivity.historic} class="rounded" />
      <span class="text-gray-400">Mark as historic</span>
    </label>
    {#if $permissions.isAdmin}
      <div class="border-t border-slate-600 pt-2 mt-2">
        <div class="flex items-start gap-2 px-2 py-1.5 rounded bg-amber-900/20 border border-amber-700/40 text-xs text-amber-200 mb-2">
          <span class="shrink-0">⚠️</span>
          <span><strong>Admin only — record timestamps.</strong> Leave as automatic values in normal use. Only change to correct a historical data-entry error.</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="activity-admin-created-{activity.id}" class="block text-xs text-slate-400 mb-0.5">Created</label>
            <input
              id="activity-admin-created-{activity.id}"
              type="datetime-local"
              bind:value={editingActivity.override_created_at}
              class="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label for="activity-admin-updated-{activity.id}" class="block text-xs text-slate-400 mb-0.5">Modified</label>
            <input
              id="activity-admin-updated-{activity.id}"
              type="datetime-local"
              bind:value={editingActivity.override_updated_at}
              class="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>
    {/if}

    <div class="flex justify-end gap-2 mt-2">
      <Button variant="secondary" size="small" on:click={cancelEdit}>Cancel</Button>
      <ProtectedButton
        action="modify"
        variant={isDecision ? 'secondary' : 'blue'}
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
    id={`activity-${activity.id}`}
    class="bg-slate-700/50 rounded p-2 border-l-2 {borderColor} {activity.historic ? 'opacity-60' : ''}"
  >
    <div class="flex justify-between items-start gap-2">

      <!-- Text: max 5 lines with scroll; click opens full view -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex-1 overflow-y-auto max-h-[6.5rem] rounded cursor-pointer hover:bg-slate-600/20 transition-colors px-1"
        title="Click to view full {isDecision ? 'decision' : 'comment'}"
        on:click={() => dispatch('viewFull', activity)}
      >
        <p class="text-gray-200 text-sm whitespace-pre-wrap">{activity.body}</p>
      </div>

      <div class="flex gap-1 flex-shrink-0">
        {#if showPanelToggle}
          <ProtectedButton
            action="modify"
            variant="secondary"
            size="small"
            icon={actionIcon}
            iconPosition="only"
            on:click={() => dispatch('togglePanel', activity)}
            title={actionTitle}
          />
        {/if}
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="edit"
          iconPosition="only"
          on:click={() => dispatch('editStart', activity)}
          title="Edit {isDecision ? 'decision' : 'comment'}"
        />
        <ProtectedButton
          action="modify"
          variant="danger"
          size="small"
          icon="delete"
          iconPosition="only"
          on:click={() => dispatch('deleteRequest', activity)}
          title="Delete {isDecision ? 'decision' : 'comment'}"
        />
      </div>
    </div>

    <!-- Metadata line -->
    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
      {#if isDecision}
        <span class="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-700/50 font-semibold uppercase tracking-wide">
          Decision
        </span>
      {/if}
      <span>Added: {fmtDateTime(activity.created_at, activity.created_by_profile?.full_name)}</span>
      {#if wasModified(activity.created_at, activity.updated_at)}
        <span>•</span>
        <span>Modified: {fmtDateTime(activity.updated_at, activity.updated_by_profile?.full_name)}</span>
      {/if}
      {#if activity.historic}
        <span>•</span>
        <span class="text-amber-400">Historic</span>
      {/if}
      {#if isComment && hasLinked}
        <span>•</span>
        <span class="text-purple-400/80" title={`Linked action: ${linkedAction.action_text}`}>
          🔗 Has linked action
        </span>
      {/if}
      {#if activity.meeting_id}
        <MeetingBadge
          meetingId={activity.meeting_id}
          on:click={(e) => dispatch('meetingFilter', e.detail)}
        />
      {/if}
    </div>

    <!-- Inline linked-action summary (comment type only, when panel is closed) -->
    {#if isComment && hasLinked && !panelOpen}
      <div class="mt-2 pl-2 border-l-2 rounded-r py-1.5 pr-2
                  {linkedCompleted
                    ? 'border-slate-600/50 bg-slate-800/30 opacity-50'
                    : 'border-amber-500/50 bg-amber-900/10'}">
        <p class="text-xs font-medium whitespace-pre-wrap
                  {linkedCompleted ? 'text-gray-500' : 'text-amber-200'}">
          {linkedAction.action_text}
        </p>
        <div class="flex flex-wrap gap-2 mt-0.5 text-[10px] text-gray-400">
          {#if linkedAction.name_text}<span>👤 {linkedAction.name_text}</span>{/if}
          {#if linkedAction.date_deadline}<span>📅 {fmtDate(linkedAction.date_deadline)}</span>{/if}
          <span class="capitalize">{linkedAction.status}</span>
        </div>
      </div>
    {/if}

    <!-- Suggestion panel (comment type only) -->
    {#if isComment && panelOpen}
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
