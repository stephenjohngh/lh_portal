<!-- src/lib/apps/management/components/ActivityLogSection.svelte -->
<!--
  Activity Log — the unified list of activities for an issue.
  Formerly CommentsSection (activities table, replaces comments + decisions).

  All activity types (comment, decision, note, email, call, letter) are
  logged through a single unified form with a type-picker at the top and
  type-specific structured fields below the body textarea.

  Per-activity rendering lives in ActivityItem.
  This file owns all suggestion-panel state and cross-cutting modals.
-->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { env as publicEnv } from '$env/dynamic/public';
  import { auth }             from '$lib/stores/auth';
  import { profilesStore }    from '$lib/stores/profiles';
  import { permissions }      from '$lib/stores/permissions';
  import { issuesStore }      from '../stores/issuesStore';
  import { ACTIVITY_TYPE, ACTIVITY_TYPES, ACTIVITY_TYPE_CONFIG } from '$lib/utils/constants';
  import { fmtDateTime, wasModified, toDateTimeLocal } from '$lib/utils/dates';
  import { parseEmailPaste } from '$lib/utils/emailParser';
  import MeetingBadge         from './meetings/MeetingBadge.svelte';
  import { getLogger }        from '$lib/utils/logger';
  import Icon                 from '$lib/components/icons/Icon.svelte';
  import Button               from '$lib/components/common/Button.svelte';
  import Modal                from '$lib/components/common/Modal.svelte';
  import ProtectedButton      from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog        from '$lib/components/common/ConfirmDialog.svelte';
  import ActionForm           from './ActionForm.svelte';
  import ActivityItem         from './ActivityItem.svelte';
  import RichTextEditor       from './RichTextEditor.svelte';

  const logger = getLogger('ActivityLogSection');

  // Feature flag — when 'true', the suggestion card calls the LLM API on
  // open. When unset/anything else, we use the activity body text verbatim.
  const AI_SUGGESTIONS_ENABLED = publicEnv.PUBLIC_AI_SUGGESTIONS_ENABLED === 'true';

  const dispatch = createEventDispatcher();

  // -- Props -----------------------------------------------------------
  export let issueId;
  export let activities = [];  // all activities (all types)
  // Passed in by IssueCard so we can tell, per comment activity, whether
  // an action has already been created from it.
  export let actions    = [];

  // -- Derived: linked actions keyed by source_activity_id -------------
  $: linkedActionByActivityId = Object.fromEntries(
    actions
      .filter(a => a?.source_activity_id)
      .map(a => [a.source_activity_id, a])
  );

  // -- List / sort / filter state -------------------------------------
  let showAddForm       = false;
  let editingActivity   = null;   // { ...activityRow } being edited
  let viewingItem       = null;   // { ...activityRow } for modal
  let showDeleteConfirm = false;
  let pendingDeleteId   = null;
  let showHistoric      = false;

  let sortField = 'updated_at';  // 'updated_at' | 'created_at'
  let sortDir   = 'desc';        // 'desc' | 'asc'

  // -- New activity state ----------------------------------------------
  // Keeps the last-used type selected so batch-logging (e.g. 3 emails)
  // doesn't require re-selecting the type each time.
  let newActivity = { body: '', activity_type: ACTIVITY_TYPE.NOTE, fields: {} };
  let mutationError = '';
  let saving = false;

  // -- AI summary generation (note / comment add form) ----------------
  let newSummaryGenerating = false;
  let newSummaryError      = '';

  async function generateNewSummary() {
    if (!newActivity.body.trim()) return;
    newSummaryGenerating = true;
    newSummaryError      = '';
    try {
      const res = await fetch('/api/management/suggest-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesting_user_id: $auth.user?.id,
          body:               newActivity.body,
          activity_type:      newActivity.activity_type
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        newSummaryError = data.error || 'Could not generate summary';
      } else {
        setNewField('summary', data.summary || '');
      }
    } catch {
      newSummaryError = 'Could not generate summary';
    } finally {
      newSummaryGenerating = false;
    }
  }

  $: newTypeConfig = ACTIVITY_TYPE_CONFIG[newActivity.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];

  // -- Suggestion panel state -----------------------------------------
  // One panel open at a time across all comment activities.
  let suggestionForId   = null;
  let suggestionDraft   = '';
  let suggestionSaving  = false;
  let suggestionLoading = false;
  // 'ai' | 'comment' | 'ai_declined' | 'ai_failed' | 'already_linked'
  let suggestionSource  = 'comment';
  let suggestionInfo    = '';
  let suggestionError   = '';

  // ActionForm modal — opened from the suggestion panel.
  let showActionForm        = false;
  let actionFormInitialText = '';

  // Linked-action delete-confirm.
  let showLinkedDeleteConfirm = false;
  let pendingLinkedAction     = null;
  let linkedDeleteError       = '';

  // Profile-backed assignee options for the ActionForm.
  onMount(() => profilesStore.load());
  const assigneeOptionsStore = profilesStore.assigneeOptions();

  // -- Filter + sort ---------------------------------------------------
  $: filteredActivities = showHistoric
    ? activities
    : activities.filter(a => !a.historic);

  // Interleaved sorted list for rendering
  $: visibleItems = [...filteredActivities].sort((a, b) => {
    const aVal = new Date(sortField === 'updated_at' ? (a.updated_at || a.created_at) : a.created_at);
    const bVal = new Date(sortField === 'updated_at' ? (b.updated_at || b.created_at) : b.created_at);
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  $: historicCount = activities.filter(a => a.historic).length;

  function toggleSortDir() {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  }

  // -- Type selector ---------------------------------------------------
  function selectType(type) {
    // Reset fields on type change; preserve body so user doesn't lose typed text.
    newActivity = { body: newActivity.body, activity_type: type, fields: {} };
  }

  // -- Add activity (unified for all types) ----------------------------
  async function addNewActivity() {
    if (!newActivity.body.trim()) return;
    saving = true;
    mutationError = '';

    // Only persist fields if at least one is filled in.
    const hasFields = Object.values(newActivity.fields || {}).some(v => v && String(v).trim());
    const result = await issuesStore.addActivity(issueId, {
      body:          newActivity.body,
      activity_type: newActivity.activity_type,
      fields:        hasFields ? newActivity.fields : null
    });
    saving = false;
    if (!result.success) {
      mutationError = result.error ?? `Failed to add ${newTypeConfig.label.toLowerCase()}`;
      return;
    }
    // Keep same type selected for batch-logging; reset body + fields.
    newActivity = { body: '', activity_type: newActivity.activity_type, fields: {} };
    showAddForm = false;
  }

  function setNewField(key, value) {
    newActivity = { ...newActivity, fields: { ...(newActivity.fields ?? {}), [key]: value } };
  }

  // -- Email paste parsing (add form) ----------------------------------
  // Passed as onPaste to RichTextEditor; returns HTML for the editor to
  // display, or null to let Tiptap handle the paste normally.
  let parseNotice = '';
  let parseNoticeTimer;

  function handleBodyPasteForEditor(rawText) {
    if (newActivity.activity_type !== ACTIVITY_TYPE.EMAIL) return null;

    const parsed = parseEmailPaste(rawText);
    if (!parsed) return null; // not an email — let Tiptap handle it

    // Update structured fields with parsed values.
    const fields = { ...(newActivity.fields || {}) };
    if (parsed.from)       fields.from       = parsed.from;
    if (parsed.to)         fields.to         = parsed.to;
    if (parsed.subject)    fields.subject    = parsed.subject;
    if (parsed.email_date) fields.email_date = parsed.email_date;

    newActivity = { ...newActivity, fields };

    clearTimeout(parseNoticeTimer);
    parseNotice = parsed.wasThread
      ? '✓ Thread detected — showing latest message only'
      : '✓ Email fields extracted from paste';
    parseNoticeTimer = setTimeout(() => { parseNotice = ''; }, 5000);

    // Convert plain-text body to HTML paragraphs for the editor.
    // Normalise CRLF → LF first (Windows clipboard uses \r\n).
    // Split on blank lines (paragraph breaks); within each paragraph,
    // join soft-wrapped lines with <br> so they appear as a single block.
    const normBody = parsed.body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return normBody
      .split(/\n\n+/)
      .map(para => {
        const trimmed = para.trim();
        if (!trimmed) return null;
        const inner = trimmed
          .split('\n')
          .map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
          .join('<br>');
        return `<p>${inner}</p>`;
      })
      .filter(Boolean)
      .join('') || '<p></p>';
  }

  // -- Unified update/delete ------------------------------------------
  async function updateActivity() {
    if (!editingActivity?.body?.trim()) return;
    saving = true;
    mutationError = '';

    const hasFields = Object.values(editingActivity.fields || {}).some(v => v && String(v).trim());
    const result = await issuesStore.updateActivity(editingActivity.id, {
      body:                editingActivity.body,
      activity_type:       editingActivity.activity_type,
      historic:            editingActivity.historic,
      fields:              hasFields ? editingActivity.fields : null,
      override_created_at: $permissions.isAdmin && editingActivity.override_created_at
                             ? new Date(editingActivity.override_created_at).toISOString()
                             : null,
      override_updated_at: $permissions.isAdmin && editingActivity.override_updated_at
                             ? new Date(editingActivity.override_updated_at).toISOString()
                             : null
    });
    saving = false;
    if (!result.success) {
      mutationError = result.error ?? 'Failed to update';
      return;
    }
    editingActivity = null;
  }

  async function deleteActivity() {
    if (!pendingDeleteId) return;
    const result = await issuesStore.deleteActivity(pendingDeleteId);
    if (!result.success) { mutationError = result.error ?? 'Failed to delete'; }
    pendingDeleteId   = null;
    showDeleteConfirm = false;
  }

  function startEdit(activity) {
    editingActivity = {
      ...activity,
      fields: activity.fields ?? {},
      override_created_at: toDateTimeLocal(activity.created_at),
      override_updated_at: toDateTimeLocal(activity.updated_at)
    };
    viewingItem = null;
  }

  // -- Suggestion panel handlers (comment activities only) -----------
  function toggleSuggestion(activity) {
    if (suggestionForId === activity.id) {
      dismissSuggestion();
    } else {
      openSuggestion(activity);
    }
  }

  function openSuggestion(activity) {
    editingActivity   = null;
    viewingItem       = null;
    suggestionError   = '';
    suggestionInfo    = '';
    suggestionForId   = activity.id;

    // If this activity already has a linked action, show it.
    if (linkedActionByActivityId[activity.id]) {
      suggestionLoading = false;
      suggestionDraft   = '';
      suggestionSource  = 'already_linked';
      return;
    }

    // Open panel immediately in manual mode — user types or clicks AI suggest.
    suggestionDraft   = '';
    suggestionSource  = 'manual';
    suggestionLoading = false;
  }

  // Called when user clicks "✨ Suggest with AI" inside the panel.
  async function fetchAiSuggestion() {
    const activity = activities.find(a => a.id === suggestionForId);
    if (!activity) return;

    if (!AI_SUGGESTIONS_ENABLED) {
      suggestionDraft  = activity.body;
      suggestionSource = 'comment';
      return;
    }

    suggestionLoading = true;
    suggestionError   = '';
    suggestionInfo    = '';

    try {
      const res = await fetch('/api/management/suggest-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesting_user_id: $auth.user?.id,
          activity_id:        activity.id,
          issue_id:           issueId,
          body:               activity.body
        })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        logger('⚠️ AI suggestion failed:', res.status, data?.error);
        suggestionDraft  = activity.body;
        suggestionSource = 'ai_failed';
        suggestionInfo   = 'AI suggestion unavailable. Using the activity text — edit as needed.';
      } else if (!data.shouldSuggest) {
        suggestionDraft  = '';
        suggestionSource = 'ai_declined';
        suggestionInfo   = data.reasoning
          ? `AI didn't identify a clear action: "${data.reasoning}". Type your own action or dismiss.`
          : "AI didn't identify a clear action. Type your own action or dismiss.";
      } else {
        suggestionDraft  = data.action_text || activity.body;
        suggestionSource = 'ai';
        suggestionInfo   = data.reasoning ? `Reasoning: ${data.reasoning}` : '';
      }
    } catch (err) {
      logger('❌ AI suggestion fetch error:', err);
      suggestionDraft  = activity.body;
      suggestionSource = 'ai_failed';
      suggestionInfo   = 'AI suggestion unavailable. Using the activity text — edit as needed.';
    } finally {
      suggestionLoading = false;
    }
  }

  function dismissSuggestion() {
    suggestionForId   = null;
    suggestionDraft   = '';
    suggestionError   = '';
    suggestionInfo    = '';
    suggestionSaving  = false;
    suggestionLoading = false;
    suggestionSource  = 'comment';
  }

  // -- ActionForm wiring (opened from the suggestion panel) ----------
  function openSuggestionInActionForm() {
    const text = suggestionDraft.trim();
    if (!text) return;
    suggestionError       = '';
    actionFormInitialText = text;
    showActionForm        = true;
  }

  async function handleActionFormSubmit({ detail }) {
    suggestionSaving = true;
    suggestionError  = '';
    const result = await issuesStore.addAction(issueId, {
      ...detail,
      source_activity_id: suggestionForId
    });
    suggestionSaving = false;
    if (!result.success) {
      suggestionError = result.error ?? 'Failed to create action';
      return;
    }
    showActionForm        = false;
    actionFormInitialText = '';
    dismissSuggestion();
  }

  function handleActionFormCancel() {
    showActionForm        = false;
    actionFormInitialText = '';
  }

  // -- Linked-action handlers (from 'already_linked' panel) ----------
  function viewLinkedAction(action) {
    dispatch('jumpToAction', { actionId: action.id });
    dismissSuggestion();
  }

  function requestDeleteLinked(action) {
    linkedDeleteError       = '';
    pendingLinkedAction     = action;
    showLinkedDeleteConfirm = true;
  }

  async function confirmDeleteLinked() {
    if (!pendingLinkedAction) return;
    const result = await issuesStore.deleteAction(pendingLinkedAction.id);
    if (!result.success) {
      linkedDeleteError = result.error ?? 'Failed to delete linked action';
      return;
    }
    showLinkedDeleteConfirm = false;
    pendingLinkedAction     = null;
    dismissSuggestion();
  }

  function cancelDeleteLinked() {
    showLinkedDeleteConfirm = false;
    pendingLinkedAction     = null;
    linkedDeleteError       = '';
  }

  // -- View full modal helpers -----------------------------------------
  $: viewingTypeConfig = viewingItem
    ? (ACTIVITY_TYPE_CONFIG[viewingItem.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT])
    : null;
</script>

<div class="bg-slate-800/30 rounded-lg p-3">

  <!-- ─── Header row ────────────────────────────────────────── -->
  <div class="flex justify-between items-center mb-2 flex-wrap gap-2">
    <h4 class="font-semibold flex items-center space-x-2">
      <Icon name="comment" size={5} className="text-blue-400" />
      <span>Activity Log ({visibleItems.length})</span>
      {#if historicCount > 0 && !showHistoric}
        <span class="text-xs text-gray-400">({historicCount} historic hidden)</span>
      {/if}
    </h4>

    <div class="flex items-center gap-2 flex-wrap">
      {#if historicCount > 0}
        <Button variant="secondary" size="small" on:click={() => showHistoric = !showHistoric}>
          {showHistoric ? 'Hide' : 'Include'} Historic
        </Button>
      {/if}

      <!-- Sort controls -->
      <div class="flex items-center gap-1">
        <select
          bind:value={sortField}
          class="text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="updated_at">Modified</option>
          <option value="created_at">Created</option>
        </select>
        <button
          on:click={toggleSortDir}
          class="text-xs px-2 py-1 bg-slate-700 border border-slate-600 rounded text-gray-300 hover:bg-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-none"
          title={sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}
        >
          {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      <ProtectedButton
        action="modify"
        variant="blue"
        size="small"
        icon="plus"
        on:click={() => { showAddForm = true; }}
      >
        New Activity
      </ProtectedButton>
    </div>
  </div>

  {#if mutationError}
    <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-2">{mutationError}</p>
  {/if}

  <!-- ─── Unified add form ──────────────────────────────────── -->
  {#if showAddForm}
    <div class="bg-slate-700/50 rounded p-3 border {newTypeConfig.borderEdit} mb-3">

      <!-- Type picker pills -->
      <div class="flex flex-wrap gap-1 mb-3">
        {#each ACTIVITY_TYPES as t}
          <button
            type="button"
            class="text-xs px-2.5 py-1 rounded-full border transition-colors
                   {newActivity.activity_type === t.value
                     ? t.color + ' border-current bg-slate-600/80 text-white font-semibold'
                     : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'}"
            on:click={() => selectType(t.value)}
          >
            {t.icon} {t.label}
          </button>
        {/each}
      </div>

      <!-- Structured fields (email / call / letter only) -->
      {#if newTypeConfig.fields.length > 0}
        <div class="grid grid-cols-2 gap-2 mb-3">
          {#each newTypeConfig.fields as field}
            <div class={field.span === 2 ? 'col-span-2' : ''}>
              <label
                for="new-field-{field.key}"
                class="block text-[10px] text-slate-400 mb-0.5"
              >{field.label}</label>
              {#if field.type === 'select'}
                <select
                  id="new-field-{field.key}"
                  value={newActivity.fields[field.key] || ''}
                  on:change={(e) => setNewField(field.key, e.currentTarget.value)}
                  class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
                >
                  {#each (field.options || []) as opt}<option value={opt}>{opt}</option>{/each}
                </select>
              {:else if field.key === 'summary' && (newActivity.activity_type === ACTIVITY_TYPE.NOTE || newActivity.activity_type === ACTIVITY_TYPE.COMMENT)}
                <!-- Summary field with AI-generate button -->
                <div class="flex gap-1">
                  <input
                    id="new-field-{field.key}"
                    type="text"
                    value={newActivity.fields[field.key] || ''}
                    placeholder={field.placeholder || ''}
                    on:input={(e) => setNewField(field.key, e.currentTarget.value)}
                    class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
                  />
                  <button
                    type="button"
                    on:click={generateNewSummary}
                    disabled={newSummaryGenerating || !newActivity.body.trim()}
                    title="Generate one-line summary with AI"
                    class="px-2 py-1 text-xs bg-slate-700 hover:bg-purple-800/60 text-slate-300 hover:text-purple-200 rounded border border-slate-600 hover:border-purple-600/50 shrink-0 transition-colors disabled:opacity-40"
                  >{newSummaryGenerating ? '…' : '✨'}</button>
                </div>
                {#if newSummaryError}
                  <p class="text-[10px] text-red-400 mt-0.5">{newSummaryError}</p>
                {/if}
              {:else}
                <input
                  id="new-field-{field.key}"
                  type={field.type}
                  value={newActivity.fields[field.key] || ''}
                  placeholder={field.placeholder || ''}
                  on:input={(e) => setNewField(field.key, e.currentTarget.value)}
                  class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
                />
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Body (rich text editor — all activity types) -->
      <RichTextEditor
        value={newActivity.body}
        placeholder={newTypeConfig.placeholder}
        ringClass={newTypeConfig.ringClass}
        onPaste={handleBodyPasteForEditor}
        on:change={(e) => { newActivity = { ...newActivity, body: e.detail }; }}
      />

      {#if parseNotice}
        <p class="text-xs text-cyan-400 mt-1 flex items-center gap-1.5">
          <span>{parseNotice}</span>
          <button type="button" class="text-cyan-600 hover:text-cyan-400 leading-none" on:click={() => parseNotice = ''}>✕</button>
        </p>
      {/if}

      <!-- Document upload — coming soon -->
      {#if newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT}
        <div class="flex items-center gap-2 mt-2 px-3 py-2 rounded border border-dashed border-rose-500/30 bg-rose-900/10 text-xs text-rose-300/70">
          <span>📎</span>
          <span>File attachment — coming in the next version. Add notes above for now.</span>
        </div>
      {/if}

      <div class="flex justify-end gap-2 mt-2">
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showAddForm = false; newActivity = { body: '', activity_type: newActivity.activity_type, fields: {} }; mutationError = ''; }}
        >
          Cancel
        </Button>
        <ProtectedButton
          action="modify"
          variant="blue"
          size="small"
          icon="plus"
          disabled={saving || !newActivity.body.trim()}
          on:click={addNewActivity}
        >
          {saving ? 'Saving…' : `Add ${newTypeConfig.label}`}
        </ProtectedButton>
      </div>
    </div>
  {/if}

  <!-- ─── Activity list ─────────────────────────────────────── -->
  {#if visibleItems.length > 0}
    <div class="space-y-1">
      {#each visibleItems as activity (activity.id)}
        <ActivityItem
          {activity}
          bind:editingActivity
          {saving}
          panelOpen={suggestionForId === activity.id}
          panelMode={suggestionSource}
          linkedAction={linkedActionByActivityId[activity.id] ?? null}
          bind:suggestionDraft
          {suggestionLoading}
          {suggestionInfo}
          {suggestionError}
          {suggestionSaving}
          {linkedDeleteError}
          on:togglePanel={(e) => toggleSuggestion(e.detail)}
          on:editStart={(e) => startEdit(e.detail)}
          on:editCancel={() => editingActivity = null}
          on:editSave={updateActivity}
          on:deleteRequest={(e) => { pendingDeleteId = e.detail.id; showDeleteConfirm = true; }}
          on:viewFull={(e) => { viewingItem = e.detail; }}
          on:dismiss={dismissSuggestion}
          on:addAction={openSuggestionInActionForm}
          on:suggestAI={fetchAiSuggestion}
          on:viewLinked={(e) => viewLinkedAction(e.detail)}
          on:deleteLinkedRequest={(e) => requestDeleteLinked(e.detail)}
          on:meetingFilter
        />
      {/each}
    </div>
  {:else if !showAddForm}
    <p class="text-xs text-slate-500 italic py-2">No activity yet.</p>
  {/if}

</div>

<!-- ─── Full item view modal ─────────────────────────────────── -->
<Modal
  show={!!viewingItem}
  title={viewingTypeConfig?.label ?? 'Activity'}
  size="medium"
  on:close={() => viewingItem = null}
>
  {#if viewingItem}
    <!-- Structured fields (for email / call / letter) -->
    {#if viewingTypeConfig && viewingTypeConfig.fields.length > 0}
      {@const f = viewingItem.fields || {}}
      <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-4 pb-3 border-b border-slate-700">
        {#each viewingTypeConfig.fields as field}
          <div class={field.span === 2 ? 'col-span-2' : ''}>
            <dt class="text-slate-500 uppercase tracking-wide text-[10px]">{field.label}</dt>
            <dd class="text-slate-200">{f[field.key] || '—'}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if viewingItem.body?.startsWith('<')}
      <div class="rich-content text-gray-200 text-sm leading-relaxed">{@html viewingItem.body}</div>
    {:else}
      <p class="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{viewingItem.body}</p>
    {/if}
    <div class="flex items-center gap-2 mt-4 pt-3 border-t border-slate-700 text-xs text-gray-500 flex-wrap">
      <span>Added: {fmtDateTime(viewingItem.created_at, viewingItem.created_by_profile?.full_name)}</span>
      {#if wasModified(viewingItem.created_at, viewingItem.updated_at)}
        <span>•</span>
        <span>Modified: {fmtDateTime(viewingItem.updated_at, viewingItem.updated_by_profile?.full_name)}</span>
      {/if}
      {#if viewingItem.historic}
        <span>•</span>
        <span class="text-amber-400">Historic</span>
      {/if}
      {#if viewingItem.meeting_id}
        <span>•</span>
        <MeetingBadge meetingId={viewingItem.meeting_id} />
      {/if}
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <div class="flex justify-end gap-2">
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        icon="edit"
        on:click={() => startEdit(viewingItem)}
      >
        Edit
      </ProtectedButton>
      <Button variant="secondary" on:click={() => viewingItem = null}>Close</Button>
    </div>
  </svelte:fragment>
</Modal>

<!-- ─── Delete confirmation ───────────────────────────────────── -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Activity"
  message="Are you sure you want to delete this entry? This action cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  on:confirm={deleteActivity}
  on:cancel={() => { showDeleteConfirm = false; pendingDeleteId = null; }}
/>

<!-- ─── Action form (opened from suggestion panel) ─────────── -->
<ActionForm
  show={showActionForm}
  initialActionText={actionFormInitialText}
  assigneeOptions={$assigneeOptionsStore}
  saving={suggestionSaving}
  on:submit={handleActionFormSubmit}
  on:cancel={handleActionFormCancel}
/>

<!-- ─── Linked-action delete confirmation ─────────────────── -->
<ConfirmDialog
  show={showLinkedDeleteConfirm}
  title="Delete linked action"
  message={pendingLinkedAction
    ? `Delete the linked action "${pendingLinkedAction.action_text}"? This cannot be undone.`
    : 'Delete this linked action? This cannot be undone.'}
  confirmText="Delete Action"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDeleteLinked}
  on:cancel={cancelDeleteLinked}
/>
