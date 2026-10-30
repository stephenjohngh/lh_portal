<!-- src/lib/apps/management/components/ActivityItem.svelte -->
<!--
  Single activity row. Handles all activity types:
  comment, decision, note, email, call, letter.

  Display only: type badge + optional structured fields header + body text +
  action buttons + metadata. Editing is the parent's modal dialog — the pencil
  (and a click on the text) dispatch 'editStart' / 'viewFull' and the parent
  opens it, so an edit looks the same here as anywhere else in the app.

  For comment-type activities only: a suggestion panel (CommentSuggestionPanel)
  appears below when the user clicks the "linked action" toggle.

  All state is owned by ActivityLogSection; this file is mostly markup +
  event dispatch. Bindable props:
    - suggestionDraft  (so the panel's draft text binds back up)

  Left-border colour by activity_type — see ACTIVITY_TYPE_CONFIG.
-->
<script>
  import { fileViewUrl } from '#lib/utils/driveUtils.js';
  import { createEventDispatcher } from 'svelte';
  import { sanitizeHtml }         from '#lib/utils/sanitizeHtml.js';
  import { fmtBytes, mimeIcon }   from '#lib/utils/files.js';
  import { fmtDateTime, fmtDate, wasModified } from '#lib/utils/dates.js';
  import { ACTION_STATUS, ACTIVITY_TYPE, ACTIVITY_TYPE_CONFIG, getActionStatusLabel } from '#lib/utils/constants.js';
  import { canDeleteOwn }      from '#lib/utils/permissions.js';
  import { buildFieldSummary } from './reports/reportUtils';
  import { permissions }    from '#lib/stores/permissions.js';
  import { auth }           from '#lib/stores/auth.js';
  import Button             from '#lib/components/common/Button.svelte';
  import ProtectedButton    from '#lib/components/common/ProtectedButton.svelte';
  import MeetingBadge       from './meetings/MeetingBadge.svelte';
  import { currentMeeting } from '../stores/meetingsStore';
  import CommentSuggestionPanel from './CommentSuggestionPanel.svelte';

  // -- Props -----------------------------------------------------------
  export let activity;

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

  // -- Type config -----------------------------------------------------
  $: typeConfig = ACTIVITY_TYPE_CONFIG[activity.activity_type]
                    ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];

  // Types that support linked actions / the AI suggestion panel.
  $: canLink = activity.activity_type === ACTIVITY_TYPE.COMMENT  ||
               activity.activity_type === ACTIVITY_TYPE.NOTE     ||
               activity.activity_type === ACTIVITY_TYPE.MEETING  ||
               !activity.activity_type;   // legacy null-type → treat as comment

  $: isComment = canLink; // keep alias so nothing else needs changing

  // Suggestion panel: for comment / note / meeting activities
  $: hasLinked       = !!linkedAction;
  $: linkedCompleted = linkedAction?.status === ACTION_STATUS.COMPLETED;
  // Expand toggle is purely for the body text (collapsible summary).
  // The linked-action panel is controlled by its own dedicated button.
  $: isExpanded       = bodyExpanded;
  $: showExpandToggle = hasSummary;

  function handleExpandToggle() {
    if (hasSummary) bodyExpanded = !bodyExpanded;
  }

  // -- Summary / body expand state -------------------------------------
  // When an activity has a summary (structured fields OR a free-text
  // summary field), the body is collapsed by default.  Clicking "expand"
  // reveals it; clicking "collapse" hides it again.
  let bodyExpanded = false;
  $: fieldSummary = buildFieldSummary(activity.activity_type, activity.fields);
  $: hasSummary = !!fieldSummary;
  // Reset whenever the activity being displayed changes.
  $: activity.id, bodyExpanded = false;
</script>

  <!-- ─── Display mode ───────────────────────────────────────── -->
  <div
    id={`activity-${activity.id}`}
    class="bg-slate-700/50 rounded p-2 border-l-2 {typeConfig.borderColor} {activity.historic ? 'opacity-60' : ''}"
  >
    <div class="flex justify-between items-start gap-2">

      <!-- Body area: structured fields header + body text -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex-1 min-w-0 rounded cursor-pointer hover:bg-slate-600/20 transition-colors px-1"
        title="Click to view full {typeConfig.label.toLowerCase()}"
        on:click={() => dispatch('viewFull', activity)}
      >
        <!-- Badge row: type badge + optional sequence + summary text -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          {#if typeConfig.badgeText}
            <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded {typeConfig.badgeClass} font-semibold uppercase tracking-wide">
              {typeConfig.icon} {typeConfig.badgeText}
            </span>
          {/if}
          {#if activity.sequence != null}
            <span class="shrink-0 text-[10px] font-mono text-slate-400 bg-slate-700/70 px-1 rounded" title="Sequence #{activity.sequence}">#{activity.sequence}</span>
          {/if}
          {#if fieldSummary}
            <span class="text-slate-200 text-[11px]">{fieldSummary}</span>
          {/if}
        </div>

        {#if !hasSummary || bodyExpanded}
          {#if activity.body?.startsWith('<')}
            <div class="rich-content text-gray-200 text-sm">{@html sanitizeHtml(activity.body)}</div>
          {:else}
            <p class="text-gray-200 text-sm whitespace-pre-wrap">{activity.body}</p>
          {/if}
        {/if}
        {#if activity.activity_type === ACTIVITY_TYPE.DOCUMENT}
          {#if activity.fields?.doc_id}
            <div class="flex items-center gap-2 mt-1.5">
              <span class="text-base shrink-0">{mimeIcon(activity.fields.mime_type)}</span>
              <a
                href={fileViewUrl(activity.fields.web_view_url)}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-purple-300 hover:text-purple-200 underline underline-offset-2
                       truncate transition-colors"
                title="Open / download {activity.fields.display_name || activity.fields.filename}"
                on:click|stopPropagation
              >
                {activity.fields.display_name || activity.fields.filename}
              </a>
              {#if activity.fields.file_size}
                <span class="text-[10px] text-slate-500 shrink-0">{fmtBytes(activity.fields.file_size)}</span>
              {/if}
            </div>
          {:else}
            <p class="text-[11px] text-slate-500 mt-1 italic">📎 No file attached</p>
          {/if}
        {/if}
      </div>

      <div class="flex gap-1 flex-shrink-0">
        {#if showExpandToggle}
          <ProtectedButton
            action="modify"
            variant="secondary"
            size="small"
            icon={isExpanded ? 'chevron-up' : 'chevron-down'}
            iconPosition="only"
            on:click={handleExpandToggle}
            title={isExpanded ? 'Hide details' : 'Show details'}
          />
        {/if}
        {#if canLink}
          <ProtectedButton
            action="modify"
            variant="amber"
            size="small"
            icon="clipboard"
            iconPosition="only"
            on:click={() => dispatch('togglePanel', activity)}
            title={hasLinked
              ? (panelOpen ? 'Hide linked action' : 'View linked action')
              : (panelOpen ? 'Hide action panel' : 'Add linked action')}
          />
        {/if}
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="move"
          iconPosition="only"
          on:click={() => dispatch('moveRequest', activity)}
          title="Move to another issue"
        />
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="edit"
          iconPosition="only"
          on:click={() => dispatch('editStart', activity)}
          title="Edit {typeConfig.label.toLowerCase()}"
        />
        <!-- Delete: admin anytime; creator within 2h of creation. Mirrors
             RLS policy 'activities: admin or owner within 2h' (migration 124). -->
        {#if canDeleteOwn(activity, $auth.user?.id, $permissions.isAdmin)}
          <Button
            variant="danger"
            size="small"
            icon="delete"
            iconPosition="only"
            on:click={() => dispatch('deleteRequest', activity)}
            title="Delete {typeConfig.label.toLowerCase()}"
          />
        {/if}
      </div>
    </div>

    <!-- Metadata line -->
    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
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
          rowId={activity.id}
          rowTable="activities"
          on:click={(e) => dispatch('meetingFilter', e.detail)}
        />
        {#if $currentMeeting && activity.meeting_id === $currentMeeting.id}
          <button
            type="button"
            class="text-[10px] px-1.5 py-0.5 rounded border border-amber-700/30
                   text-amber-500/70 hover:text-red-400 hover:bg-red-900/20
                   hover:border-red-700/40 transition-colors leading-none"
            on:click|stopPropagation={() => dispatch('untagMeeting', activity)}
            title="Remove this activity from the current meeting"
          >
            × remove from meeting
          </button>
        {/if}
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
          <span>{getActionStatusLabel(linkedAction.status)}</span>
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
        on:suggestAI
        on:viewLinked          on:deleteLinkedRequest
      />
    {/if}
  </div>
