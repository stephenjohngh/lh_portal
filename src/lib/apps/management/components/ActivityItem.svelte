<!-- src/lib/apps/management/components/ActivityItem.svelte -->
<!--
  Single activity row. Handles all activity types:
  comment, decision, note, email, call, letter.

  Two render modes per item:
    - Edit mode (when editingActivity.id matches): inline edit form.
    - Display mode: type badge + optional structured fields header +
                    body text + action buttons + metadata.

  For comment-type activities only: a suggestion panel (CommentSuggestionPanel)
  appears below when the user clicks the "linked action" toggle.

  All state is owned by ActivityLogSection; this file is mostly markup +
  event dispatch. Bindable props:
    - editingActivity  (so the edit form's textarea/checkbox/fields bind back up)
    - suggestionDraft  (so the panel's draft text binds back up)

  Left-border colour by activity_type — see ACTIVITY_TYPE_CONFIG.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtDateTime, fmtDate, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTIVITY_TYPE, ACTIVITY_TYPE_CONFIG, ACTIVITY_TYPES } from '$lib/utils/constants';
  import { parseEmailPaste }   from '$lib/utils/emailParser';
  import { buildFieldSummary } from './reports/reportUtils';
  import { permissions }    from '$lib/stores/permissions';
  import { auth }           from '$lib/stores/auth';
  import Button             from '$lib/components/common/Button.svelte';
  import ProtectedButton    from '$lib/components/common/ProtectedButton.svelte';
  import MeetingBadge       from './meetings/MeetingBadge.svelte';
  import CommentSuggestionPanel from './CommentSuggestionPanel.svelte';
  import RichTextEditor         from './RichTextEditor.svelte';

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

  // -- Type config -----------------------------------------------------
  $: typeConfig = ACTIVITY_TYPE_CONFIG[activity.activity_type]
                    ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];

  $: editTypeConfig = editingActivity
    ? (ACTIVITY_TYPE_CONFIG[editingActivity.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT])
    : typeConfig;

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

  // -- Edit field helpers ----------------------------------------------
  // Reassign editingActivity (not just mutate) so Svelte propagates up.
  function setEditField(key, value) {
    editingActivity = {
      ...editingActivity,
      fields: { ...(editingActivity.fields ?? {}), [key]: value }
    };
  }

  function changeEditType(type) {
    editingActivity = { ...editingActivity, activity_type: type, fields: {} };
  }

  function cancelEdit() {
    dispatch('editCancel');
  }

  // -- Email paste parsing (edit mode) ---------------------------------
  let parseNotice = '';
  let parseNoticeTimer;

  function handleBodyPaste(e) {
    if (editingActivity?.activity_type !== ACTIVITY_TYPE.EMAIL) return;

    const raw = e.clipboardData?.getData('text/plain');
    if (!raw) return;

    const parsed = parseEmailPaste(raw);
    if (!parsed) return;

    e.preventDefault();

    const fields = { ...(editingActivity.fields || {}) };
    if (parsed.from)       fields.from       = parsed.from;
    if (parsed.to)         fields.to         = parsed.to;
    if (parsed.subject)    fields.subject    = parsed.subject;
    if (parsed.email_date) fields.email_date = parsed.email_date;

    editingActivity = { ...editingActivity, body: parsed.body, fields };

    clearTimeout(parseNoticeTimer);
    parseNotice = parsed.wasThread
      ? '✓ Thread detected — showing latest message only'
      : '✓ Email fields extracted from paste';
    parseNoticeTimer = setTimeout(() => { parseNotice = ''; }, 5000);
  }

  // -- AI summary generation (edit form) --------------------------------
  let summaryGenerating = false;
  let summaryError      = '';

  async function generateSummary() {
    if (!editingActivity?.body?.trim()) return;
    summaryGenerating = true;
    summaryError      = '';
    try {
      const res = await fetch('/api/management/suggest-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesting_user_id: $auth.user?.id,
          body:               editingActivity.body,
          activity_type:      editingActivity.activity_type
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        summaryError = data.error || 'Could not generate summary';
      } else {
        setEditField('summary', data.summary || '');
      }
    } catch {
      summaryError = 'Could not generate summary';
    } finally {
      summaryGenerating = false;
    }
  }

  // -- Summary / body expand state -------------------------------------
  // When an activity has a summary (structured fields OR a free-text
  // summary field), the body is collapsed by default.  Clicking "expand"
  // reveals it; clicking "collapse" hides it again.
  let bodyExpanded = false;
  $: hasSummary = !!buildFieldSummary(activity.activity_type, activity.fields);
  // Reset whenever the activity being displayed changes.
  $: activity.id, bodyExpanded = false;
</script>

{#if editingActivity?.id === activity.id}
  <!-- ─── Edit mode ──────────────────────────────────────────── -->
  <div class="bg-slate-700/50 rounded p-3 border {editTypeConfig.borderEdit}">

    <!-- Type picker -->
    <div class="flex flex-wrap gap-1 mb-3">
      {#each ACTIVITY_TYPES as t}
        <button
          type="button"
          class="text-xs px-2.5 py-1 rounded-full border transition-colors
                 {editingActivity.activity_type === t.value
                   ? t.color + ' border-current bg-slate-600/80 text-white font-semibold'
                   : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'}"
          on:click={() => changeEditType(t.value)}
        >
          {t.icon} {t.label}
        </button>
      {/each}
    </div>

    <!-- Structured fields (email / call / letter) -->
    {#if editTypeConfig.fields.length > 0}
      <div class="grid grid-cols-2 gap-2 mb-3">
        {#each editTypeConfig.fields as field}
          <div class={field.span === 2 ? 'col-span-2' : ''}>
            <label
              for="edit-field-{activity.id}-{field.key}"
              class="block text-[10px] text-slate-400 mb-0.5"
            >{field.label}</label>
            {#if field.type === 'select'}
              <select
                id="edit-field-{activity.id}-{field.key}"
                value={editingActivity.fields?.[field.key] || ''}
                on:change={(e) => setEditField(field.key, e.currentTarget.value)}
                class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 {editTypeConfig.ringClass}"
              >
                {#each (field.options || []) as opt}<option value={opt}>{opt}</option>{/each}
              </select>
            {:else if field.key === 'summary' && (editingActivity?.activity_type === ACTIVITY_TYPE.NOTE || editingActivity?.activity_type === ACTIVITY_TYPE.COMMENT)}
              <!-- Summary field with AI-generate button -->
              <div class="flex gap-1">
                <input
                  id="edit-field-{activity.id}-{field.key}"
                  type="text"
                  value={editingActivity.fields?.[field.key] || ''}
                  placeholder={field.placeholder || ''}
                  on:input={(e) => setEditField(field.key, e.currentTarget.value)}
                  class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {editTypeConfig.ringClass}"
                />
                <button
                  type="button"
                  on:click={generateSummary}
                  disabled={summaryGenerating || !editingActivity?.body?.trim()}
                  title="Generate one-line summary with AI"
                  class="px-2 py-1 text-xs bg-slate-700 hover:bg-purple-800/60 text-slate-300 hover:text-purple-200 rounded border border-slate-600 hover:border-purple-600/50 shrink-0 transition-colors disabled:opacity-40"
                >{summaryGenerating ? '…' : '✨'}</button>
              </div>
              {#if summaryError}
                <p class="text-[10px] text-red-400 mt-0.5">{summaryError}</p>
              {/if}
            {:else}
              <input
                id="edit-field-{activity.id}-{field.key}"
                type={field.type}
                value={editingActivity.fields?.[field.key] || ''}
                placeholder={field.placeholder || ''}
                on:input={(e) => setEditField(field.key, e.currentTarget.value)}
                class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {editTypeConfig.ringClass}"
              />
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if editingActivity.activity_type === ACTIVITY_TYPE.NOTE}
      <RichTextEditor
        value={editingActivity.body}
        placeholder={editTypeConfig.placeholder}
        ringClass={editTypeConfig.ringClass}
        on:change={(e) => { editingActivity = { ...editingActivity, body: e.detail }; }}
      />
    {:else}
      <textarea
        bind:value={editingActivity.body}
        on:paste={handleBodyPaste}
        placeholder={editTypeConfig.placeholder}
        class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 {editTypeConfig.ringClass} resize-y"
        rows={6}
      ></textarea>
    {/if}

    {#if parseNotice}
      <p class="text-xs text-cyan-400 mt-1 flex items-center gap-1.5">
        <span>{parseNotice}</span>
        <button type="button" class="text-cyan-600 hover:text-cyan-400 leading-none" on:click={() => parseNotice = ''}>✕</button>
      </p>
    {/if}

    <!-- Document upload — coming soon -->
    {#if editingActivity.activity_type === ACTIVITY_TYPE.DOCUMENT}
      <div class="flex items-center gap-2 mt-2 px-3 py-2 rounded border border-dashed border-rose-500/30 bg-rose-900/10 text-xs text-rose-300/70">
        <span>📎</span>
        <span>File attachment — coming in the next version.</span>
      </div>
    {/if}

    <label class="flex items-center gap-2 mt-2 text-sm cursor-pointer">
      <input type="checkbox" bind:checked={editingActivity.historic} class="rounded" />
      <span class="text-gray-400">Mark as historic</span>
    </label>

    {#if $permissions.isAdmin}
      <div class="border-t border-slate-600 pt-2 mt-2">
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
  {@const fieldSummary = buildFieldSummary(activity.activity_type, activity.fields)}
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
        <!-- Badge row: type badge + summary text side-by-side -->
        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
          {#if typeConfig.badgeText}
            <span class="shrink-0 text-[10px] px-1.5 py-0.5 rounded {typeConfig.badgeClass} font-semibold uppercase tracking-wide">
              {typeConfig.icon} {typeConfig.badgeText}
            </span>
          {/if}
          {#if fieldSummary}
            <span class="text-slate-200 text-[11px]">{fieldSummary}</span>
          {/if}
        </div>

        {#if !hasSummary || bodyExpanded}
          {#if activity.activity_type === ACTIVITY_TYPE.NOTE && activity.body?.startsWith('<')}
            <div class="rich-content text-gray-200 text-sm">{@html activity.body}</div>
          {:else}
            <p class="text-gray-200 text-sm whitespace-pre-wrap">{activity.body}</p>
          {/if}
        {/if}
        {#if activity.activity_type === ACTIVITY_TYPE.DOCUMENT}
          <p class="text-[11px] text-rose-300/60 mt-1 italic">
            📎 File attachment — coming in the next version
          </p>
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
            variant={panelOpen ? 'primary' : 'secondary'}
            size="small"
            icon="clipboard"
            iconPosition="only"
            on:click={() => dispatch('togglePanel', activity)}
            title={hasLinked
              ? (panelOpen ? 'Hide linked action' : 'View linked action')
              : 'Add linked action with AI suggestion'}
          />
        {/if}
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="edit"
          iconPosition="only"
          on:click={() => dispatch('editStart', activity)}
          title="Edit {typeConfig.label.toLowerCase()}"
        />
        <ProtectedButton
          action="modify"
          variant="danger"
          size="small"
          icon="delete"
          iconPosition="only"
          on:click={() => dispatch('deleteRequest', activity)}
          title="Delete {typeConfig.label.toLowerCase()}"
        />
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
