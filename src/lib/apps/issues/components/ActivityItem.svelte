<!-- src/lib/apps/issues/components/ActivityItem.svelte -->
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
  import { parseEmailPaste } from '$lib/utils/emailParser';
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

  // -- Type config -----------------------------------------------------
  $: typeConfig = ACTIVITY_TYPE_CONFIG[activity.activity_type]
                    ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];

  $: editTypeConfig = editingActivity
    ? (ACTIVITY_TYPE_CONFIG[editingActivity.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT])
    : typeConfig;

  $: isComment  = activity.activity_type === ACTIVITY_TYPE.COMMENT || !activity.activity_type;

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

  // -- Date formatting for structured fields ---------------------------
  // field dates are stored as 'YYYY-MM-DD'; add a noon time to avoid
  // timezone-shift issues when passing to fmtDate.
  function fmtFieldDate(dateStr) {
    if (!dateStr) return '';
    return fmtDate(dateStr + 'T12:00:00');
  }
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

    <textarea
      bind:value={editingActivity.body}
      on:paste={handleBodyPaste}
      placeholder={editTypeConfig.placeholder}
      class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 {editTypeConfig.ringClass} resize-y"
      rows={editTypeConfig.fields.length > 0 ? 3 : 5}
    ></textarea>

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
    id={`activity-${activity.id}`}
    class="bg-slate-700/50 rounded p-2 border-l-2 {typeConfig.borderColor} {activity.historic ? 'opacity-60' : ''}"
  >
    <div class="flex justify-between items-start gap-2">

      <!-- Body area: structured fields header + body text -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex-1 min-w-0 overflow-y-auto max-h-[7.5rem] rounded cursor-pointer hover:bg-slate-600/20 transition-colors px-1"
        title="Click to view full {typeConfig.label.toLowerCase()}"
        on:click={() => dispatch('viewFull', activity)}
      >
        <!-- Type badge -->
        {#if typeConfig.badgeText}
          <span class="inline-block mb-1 text-[10px] px-1.5 py-0.5 rounded {typeConfig.badgeClass} font-semibold uppercase tracking-wide">
            {typeConfig.icon} {typeConfig.badgeText}
          </span>
        {/if}

        <!-- Structured-field summary line (email / call / letter) -->
        {#if typeConfig.fields.length > 0}
          {@const f = activity.fields || {}}
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1 text-[11px] text-slate-400 leading-snug">
            {#if activity.activity_type === ACTIVITY_TYPE.EMAIL}
              {#if f.notes}
                <span class="text-slate-200 font-medium truncate max-w-[24rem]">{f.notes}</span>
              {/if}
              {#if f.from || f.to}
                <span class="truncate">{f.from || '?'} → {f.to || '?'}</span>
              {/if}
              {#if f.subject}
                <span class="text-slate-300 truncate max-w-[18rem]">Re: {f.subject}</span>
              {/if}
              {#if f.email_date}
                <span class="shrink-0">{fmtFieldDate(f.email_date)}</span>
              {/if}
            {:else if activity.activity_type === ACTIVITY_TYPE.CALL}
              {#if f.direction}
                <span class="capitalize">{f.direction}</span>
              {/if}
              {#if f.caller}
                <span>· {f.caller}</span>
              {/if}
              {#if f.duration}
                <span>· {f.duration}</span>
              {/if}
            {:else if activity.activity_type === ACTIVITY_TYPE.LETTER}
              {#if f.from || f.to}
                <span class="truncate">{f.from || '?'} → {f.to || '?'}</span>
              {/if}
              {#if f.reference}
                <span class="text-slate-300">Ref: {f.reference}</span>
              {/if}
              {#if f.letter_date}
                <span class="shrink-0">{fmtFieldDate(f.letter_date)}</span>
              {/if}
            {:else if activity.activity_type === ACTIVITY_TYPE.MEETING}
              {#if f.title}
                <span class="text-slate-200 font-medium truncate max-w-[24rem]">{f.title}</span>
              {/if}
              {#if f.meeting_date}
                <span class="shrink-0">{fmtFieldDate(f.meeting_date)}</span>
              {/if}
              {#if f.participants}
                <span class="text-slate-300 truncate max-w-[18rem]">👥 {f.participants}</span>
              {/if}
            {/if}
          </div>
        {/if}

        <p class="text-gray-200 text-sm whitespace-pre-wrap">{activity.body}</p>
        {#if activity.activity_type === ACTIVITY_TYPE.DOCUMENT}
          <p class="text-[11px] text-rose-300/60 mt-1 italic">
            📎 File attachment — coming in the next version
          </p>
        {/if}
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
