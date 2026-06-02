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
  import { meetingsStore }    from '../stores/meetingsStore';
  import { activitySort }     from '../stores/activitySortStore';
  import { ACTIVITY_TYPE, ACTIVITY_TYPES, ACTIVITY_TYPE_CONFIG } from '$lib/utils/constants';
  import { fmtDateTime, wasModified, toDateTimeLocal } from '$lib/utils/dates';
  import { parseEmailPaste } from '$lib/utils/emailParser';
  import MeetingBadge         from './meetings/MeetingBadge.svelte';
  import { getLogger }        from '$lib/utils/logger';
  import { fmtBytes, mimeIcon } from '$lib/utils/files.js';
  import { supabase }         from '$lib/supabaseClient';
  import Icon                 from '$lib/components/icons/Icon.svelte';
  import DocAttachInput       from '$lib/components/common/DocAttachInput.svelte';
  import Button               from '$lib/components/common/Button.svelte';
  import Modal                from '$lib/components/common/Modal.svelte';
  import ProtectedButton      from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog        from '$lib/components/common/ConfirmDialog.svelte';
  import ActionForm           from './ActionForm.svelte';
  import ActivityItem         from './ActivityItem.svelte';
  import RichTextEditor       from './LazyRichTextEditor.svelte';

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

  // Initialise from the persisted store so sort survives tab switches
  // (the {#if activeTab} block destroys/recreates this component).
  let sortField = $activitySort.field;  // 'updated_at' | 'created_at' | 'sequence'
  let sortDir   = $activitySort.dir;    // 'desc' | 'asc'

  // Keep the store in sync whenever either var changes.
  $: activitySort.set({ field: sortField, dir: sortDir });

  // -- New activity state ----------------------------------------------
  // Keeps the last-used type selected so batch-logging (e.g. 3 emails)
  // doesn't require re-selecting the type each time.
  let newActivity = { body: '', activity_type: ACTIVITY_TYPE.NOTE, fields: {}, sequence: null };
  let mutationError = '';
  let saving        = false;

  // Document activity state
  let docFile      = null;   // File object selected in DocAttachInput
  let docInputRef;           // ref to DocAttachInput for programmatic reset

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
    if (sortField === 'sequence') {
      const aHas = a.sequence != null;
      const bHas = b.sequence != null;
      // Sequenced items first; unsequenced items fall back to modified-date sort at the end.
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas) return sortDir === 'desc' ? b.sequence - a.sequence : a.sequence - b.sequence;
      // Both unsequenced: sort by modified date (same direction as chosen).
      const aDate = new Date(a.updated_at || a.created_at);
      const bDate = new Date(b.updated_at || b.created_at);
      return sortDir === 'desc' ? bDate - aDate : aDate - bDate;
    }
    const aVal = new Date(sortField === 'updated_at' ? (a.updated_at || a.created_at) : a.created_at);
    const bVal = new Date(sortField === 'updated_at' ? (b.updated_at || b.created_at) : b.created_at);
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  $: historicCount = activities.filter(a => a.historic).length;

  // When an activity disappears from this issue's list (e.g. after being moved
  // to another issue), automatically close any open UI tied to it.
  $: if (editingActivity && !activities.find(a => a.id === editingActivity.id)) {
    viewingItem     = null;
    editingActivity = null;
  }
  $: if (viewingItem && !activities.find(a => a.id === viewingItem.id)) {
    viewingItem = null;
  }
  $: if (suggestionForId && !activities.find(a => a.id === suggestionForId)) {
    dismissSuggestion();
  }

  function toggleSortDir() {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  }

  // -- Type selector ---------------------------------------------------
  function selectType(type) {
    // Reset fields on type change; preserve body and sequence so user doesn't lose them.
    newActivity = { body: newActivity.body, activity_type: type, fields: {}, sequence: newActivity.sequence };
  }

  // -- Add activity (unified for all types) ----------------------------
  async function addNewActivity() {
    const isDocType = newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT;

    // For document type the file is required; body (notes) is optional.
    // For every other type, body is required.
    if (isDocType ? !docFile : !newActivity.body.trim()) return;

    saving = true;
    mutationError = '';

    try {
      let fields = null;

      if (isDocType) {
        // Step 1: upload file via the document_library API
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Not authenticated');

        const form = new FormData();
        form.append('file',         docFile);
        form.append('entity_type',  'issue');
        form.append('entity_id',    issueId);
        form.append('folder_path',  'issues');
        form.append('display_name', docFile.name);
        form.append('doc_type',     'other');

        const uploadRes = await fetch('/api/documents/upload', {
          method:  'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body:    form,
        });
        const doc = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(doc.error ?? 'Upload failed');

        // Step 2: bake doc metadata + optional user summary into fields
        fields = {
          doc_id:       doc.id,
          filename:     doc.filename,
          display_name: doc.display_name,
          file_size:    doc.file_size,
          mime_type:    doc.mime_type,
          web_view_url: doc.web_view_url,
          summary:      newActivity.fields?.summary || null,
        };
      } else {
        // Non-document types: persist structured fields if any are filled in
        const hasFields = Object.values(newActivity.fields || {}).some(v => v && String(v).trim());
        fields = hasFields ? newActivity.fields : null;
      }

      const result = await issuesStore.addActivity(issueId, {
        body:          newActivity.body,
        activity_type: newActivity.activity_type,
        fields,
        sequence:      newActivity.sequence ?? null,
      });

      if (!result.success) {
        mutationError = result.error ?? `Failed to add ${newTypeConfig.label.toLowerCase()}`;
        return;
      }

      // Keep same type selected for batch-logging; reset body, fields, sequence, and file.
      newActivity = { body: '', activity_type: newActivity.activity_type, fields: {}, sequence: null };
      docFile = null;
      docInputRef?.reset();
      showAddForm = false;
    } catch (err) {
      mutationError = err.message ?? `Failed to add ${newTypeConfig.label.toLowerCase()}`;
    } finally {
      saving = false;
    }
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
    if (!editingActivity) return;
    const isDoc = editingActivity.activity_type === ACTIVITY_TYPE.DOCUMENT;
    if (!isDoc && !editingActivity.body?.trim()) return;
    saving = true;
    mutationError = '';

    const hasFields = Object.values(editingActivity.fields || {}).some(v => v && String(v).trim());
    const result = await issuesStore.updateActivity(editingActivity.id, {
      body:                editingActivity.body,
      activity_type:       editingActivity.activity_type,
      historic:            editingActivity.historic,
      fields:              hasFields ? editingActivity.fields : null,
      sequence:            editingActivity.sequence ?? null,
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

  // Remove an activity's meeting tag (set meeting_id = null).
  // Only available while the meeting is still open — the button is hidden
  // once the meeting closes (currentMeeting becomes null in ActivityItem).
  async function handleUntagMeeting({ detail: activity }) {
    const result = await meetingsStore.untagItem('activities', activity.id);
    if (!result.success) {
      mutationError = result.error ?? 'Failed to remove from meeting';
      return;
    }
    await issuesStore.fetchIssues();
  }

  function startEdit(activity) {
    mutationError = '';
    editingActivity = {
      ...activity,
      fields: activity.fields ?? {},
      override_created_at: toDateTimeLocal(activity.created_at),
      override_updated_at: ''   // blank = server sets updated_at to now on save
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

  // -- Edit-in-modal helpers -------------------------------------------
  $: isEditingInModal = !!(editingActivity && viewingItem && editingActivity.id === viewingItem.id);

  $: editTypeConfig = editingActivity
    ? (ACTIVITY_TYPE_CONFIG[editingActivity.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT])
    : null;

  let modalSummaryGenerating = false;
  let modalSummaryError      = '';

  function openEditModal(activity) {
    mutationError = '';
    editingActivity = {
      ...activity,
      fields: activity.fields ?? {},
      override_created_at: toDateTimeLocal(activity.created_at),
      override_updated_at: ''   // blank = server sets updated_at to now on save
    };
    viewingItem = activity;
  }

  function setEditField(key, value) {
    editingActivity = {
      ...editingActivity,
      fields: { ...(editingActivity.fields ?? {}), [key]: value }
    };
  }

  function changeEditType(type) {
    editingActivity = { ...editingActivity, activity_type: type, fields: {} };
  }

  async function generateModalSummary() {
    if (!editingActivity?.body?.trim()) return;
    modalSummaryGenerating = true;
    modalSummaryError = '';
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
        modalSummaryError = data.error || 'Could not generate summary';
      } else {
        setEditField('summary', data.summary || '');
      }
    } catch {
      modalSummaryError = 'Could not generate summary';
    } finally {
      modalSummaryGenerating = false;
    }
  }

  async function updateActivityAndClose() {
    await updateActivity();
    if (!editingActivity) viewingItem = null;
  }
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
          <option value="sequence">Sequence</option>
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
                <!-- Summary field with AI-generate button + optional sequence -->
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
                  <input
                    type="number"
                    value={newActivity.sequence ?? ''}
                    min="1"
                    placeholder="#"
                    title="Optional sequence number"
                    on:input={(e) => { const v = e.currentTarget.value; newActivity = { ...newActivity, sequence: v === '' ? null : (parseInt(v, 10) || null) }; }}
                    class="w-[4.375rem] shrink-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                {#if newSummaryError}
                  <p class="text-[10px] text-red-400 mt-0.5">{newSummaryError}</p>
                {/if}
              {:else if field.key === 'summary'}
                <!-- Summary field (non-note/comment types) + optional sequence -->
                <div class="flex gap-1">
                  <input
                    id="new-field-{field.key}"
                    type="text"
                    value={newActivity.fields[field.key] || ''}
                    placeholder={field.placeholder || ''}
                    on:input={(e) => setNewField(field.key, e.currentTarget.value)}
                    class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {newTypeConfig.ringClass}"
                  />
                  <input
                    type="number"
                    value={newActivity.sequence ?? ''}
                    min="1"
                    placeholder="#"
                    title="Optional sequence number"
                    on:input={(e) => { const v = e.currentTarget.value; newActivity = { ...newActivity, sequence: v === '' ? null : (parseInt(v, 10) || null) }; }}
                    class="w-[4.375rem] shrink-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
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

      <!-- Document file attachment -->
      {#if newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT}
        <div class="mt-2">
          <p class="text-[10px] text-slate-400 mb-1">Attach file <span class="text-slate-600">(required)</span></p>
          <DocAttachInput bind:this={docInputRef} bind:file={docFile} />
        </div>
      {/if}

      <div class="flex justify-end gap-2 mt-2">
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showAddForm = false; newActivity = { body: '', activity_type: newActivity.activity_type, fields: {}, sequence: null }; docFile = null; docInputRef?.reset(); mutationError = ''; }}
        >
          Cancel
        </Button>
        <ProtectedButton
          action="modify"
          variant="blue"
          size="small"
          icon="plus"
          disabled={saving || (newActivity.activity_type === ACTIVITY_TYPE.DOCUMENT
            ? !docFile
            : !newActivity.body.trim())}
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
          on:viewFull={(e) => {
            if ($permissions.isAdmin || $permissions.canModify) {
              openEditModal(e.detail);
            } else {
              viewingItem = e.detail;
            }
          }}
          on:dismiss={dismissSuggestion}
          on:addAction={openSuggestionInActionForm}
          on:suggestAI={fetchAiSuggestion}
          on:viewLinked={(e) => viewLinkedAction(e.detail)}
          on:deleteLinkedRequest={(e) => requestDeleteLinked(e.detail)}
          on:meetingFilter
          on:untagMeeting={handleUntagMeeting}
          on:moveRequest={(e) => dispatch('moveRequest', { activityId: e.detail.id, sourceIssueId: issueId })}
        />
      {/each}
    </div>
  {:else if !showAddForm}
    <p class="text-xs text-slate-500 italic py-2">No activity yet.</p>
  {/if}

</div>

<!-- ─── Full item view / edit modal ──────────────────────────── -->
<Modal
  show={!!viewingItem}
  title={isEditingInModal
    ? `Edit ${editTypeConfig?.label ?? 'Activity'}`
    : (viewingTypeConfig?.label ?? 'Activity')}
  size="large"
  on:close={() => {
    if (isEditingInModal) editingActivity = null;
    viewingItem = null;
  }}
>
  {#if viewingItem}

    {#if isEditingInModal && editingActivity}
      <!-- ── Edit form ─────────────────────────────────────── -->
      {#if mutationError}
        <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-3">{mutationError}</p>
      {/if}

      <!-- Type picker pills -->
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

      <!-- Structured fields (email / letter / etc.) -->
      {#if editTypeConfig && editTypeConfig.fields.length > 0}
        <div class="grid grid-cols-2 gap-2 mb-3">
          {#each editTypeConfig.fields as field}
            <div class={field.span === 2 ? 'col-span-2' : ''}>
              <label
                for="modal-edit-{viewingItem.id}-{field.key}"
                class="block text-[10px] text-slate-400 mb-0.5"
              >{field.label}</label>
              {#if field.type === 'select'}
                <select
                  id="modal-edit-{viewingItem.id}-{field.key}"
                  value={editingActivity.fields?.[field.key] || ''}
                  on:change={(e) => setEditField(field.key, e.currentTarget.value)}
                  class="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 {editTypeConfig.ringClass}"
                >
                  {#each (field.options || []) as opt}<option value={opt}>{opt}</option>{/each}
                </select>
              {:else if field.key === 'summary' && (editingActivity.activity_type === ACTIVITY_TYPE.NOTE || editingActivity.activity_type === ACTIVITY_TYPE.COMMENT)}
                <div class="flex gap-1">
                  <input
                    id="modal-edit-{viewingItem.id}-{field.key}"
                    type="text"
                    value={editingActivity.fields?.[field.key] || ''}
                    placeholder={field.placeholder || ''}
                    on:input={(e) => setEditField(field.key, e.currentTarget.value)}
                    class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {editTypeConfig.ringClass}"
                  />
                  <button
                    type="button"
                    on:click={generateModalSummary}
                    disabled={modalSummaryGenerating || !editingActivity.body?.trim()}
                    title="Generate one-line summary with AI"
                    class="px-2 py-1 text-xs bg-slate-700 hover:bg-purple-800/60 text-slate-300 hover:text-purple-200 rounded border border-slate-600 hover:border-purple-600/50 shrink-0 transition-colors disabled:opacity-40"
                  >{modalSummaryGenerating ? '…' : '✨'}</button>
                  <input
                    type="number"
                    value={editingActivity.sequence ?? ''}
                    min="1"
                    placeholder="#"
                    title="Optional sequence number"
                    on:input={(e) => { const v = e.currentTarget.value; editingActivity = { ...editingActivity, sequence: v === '' ? null : (parseInt(v, 10) || null) }; }}
                    class="w-[4.375rem] shrink-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                {#if modalSummaryError}
                  <p class="text-[10px] text-red-400 mt-0.5">{modalSummaryError}</p>
                {/if}
              {:else if field.key === 'summary'}
                <div class="flex gap-1">
                  <input
                    id="modal-edit-{viewingItem.id}-{field.key}"
                    type="text"
                    value={editingActivity.fields?.[field.key] || ''}
                    placeholder={field.placeholder || ''}
                    on:input={(e) => setEditField(field.key, e.currentTarget.value)}
                    class="flex-1 min-w-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 {editTypeConfig.ringClass}"
                  />
                  <input
                    type="number"
                    value={editingActivity.sequence ?? ''}
                    min="1"
                    placeholder="#"
                    title="Optional sequence number"
                    on:input={(e) => { const v = e.currentTarget.value; editingActivity = { ...editingActivity, sequence: v === '' ? null : (parseInt(v, 10) || null) }; }}
                    class="w-[4.375rem] shrink-0 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              {:else}
                <input
                  id="modal-edit-{viewingItem.id}-{field.key}"
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

      <!-- Body (rich text editor) -->
      <RichTextEditor
        value={editingActivity.body}
        placeholder={editTypeConfig.placeholder}
        ringClass={editTypeConfig.ringClass}
        on:change={(e) => { editingActivity = { ...editingActivity, body: e.detail }; }}
      />

      <!-- Document: read-only display in edit mode -->
      {#if editingActivity.activity_type === ACTIVITY_TYPE.DOCUMENT && editingActivity.fields?.doc_id}
        <div class="flex items-center gap-3 mt-2 px-3 py-2 rounded border border-slate-700 bg-slate-800/40 text-xs">
          <span class="text-base shrink-0">{mimeIcon(editingActivity.fields.mime_type)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-slate-300 truncate">{editingActivity.fields.display_name || editingActivity.fields.filename}</p>
            <p class="text-slate-600 text-[10px]">To replace the file, delete this activity and re-add it.</p>
          </div>
          {#if editingActivity.fields.web_view_url}
            <a
              href={editingActivity.fields.web_view_url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-purple-400 hover:text-purple-300 transition-colors shrink-0 p-1"
              title="Open file"
            >↗</a>
          {/if}
        </div>
      {/if}

      <!-- Historic -->
      <label class="flex items-center gap-2 mt-3 text-sm cursor-pointer">
        <input type="checkbox" bind:checked={editingActivity.historic} class="rounded" />
        <span class="text-gray-400">Mark as historic</span>
      </label>

      <!-- Admin date overrides -->
      {#if $permissions.isAdmin}
        <div class="border-t border-slate-600 pt-2 mt-2">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label for="modal-edit-admin-created-{viewingItem.id}" class="block text-xs text-slate-400 mb-0.5">Created</label>
              <input
                id="modal-edit-admin-created-{viewingItem.id}"
                type="datetime-local"
                bind:value={editingActivity.override_created_at}
                class="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label for="modal-edit-admin-updated-{viewingItem.id}" class="block text-xs text-slate-400 mb-0.5">Modified</label>
              <input
                id="modal-edit-admin-updated-{viewingItem.id}"
                type="datetime-local"
                bind:value={editingActivity.override_updated_at}
                class="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
      {/if}

    {:else}
      <!-- ── View mode ──────────────────────────────────────── -->
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

      {#if viewingItem.body}
        {#if viewingItem.body.startsWith('<')}
          <div class="rich-content text-gray-200 text-sm leading-relaxed">{@html viewingItem.body}</div>
        {:else}
          <p class="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{viewingItem.body}</p>
        {/if}
      {/if}

      <!-- Document attachment row -->
      {#if viewingItem.activity_type === ACTIVITY_TYPE.DOCUMENT && viewingItem.fields?.doc_id}
        <div class="flex items-center gap-3 mt-3 px-3 py-2.5 rounded-lg border border-slate-700
                    bg-slate-800/40 {viewingItem.body ? 'mt-3' : ''}">
          <span class="text-xl shrink-0">{mimeIcon(viewingItem.fields.mime_type)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-200 truncate">
              {viewingItem.fields.display_name || viewingItem.fields.filename}
            </p>
            {#if viewingItem.fields.file_size}
              <p class="text-xs text-slate-500">{fmtBytes(viewingItem.fields.file_size)}</p>
            {/if}
          </div>
          <a
            href={viewingItem.fields.web_view_url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200
                   border border-purple-500/30 hover:border-purple-400 px-2.5 py-1 rounded
                   transition-colors shrink-0"
          >
            <Icon name="download" size={3} />
            Open
          </a>
        </div>
      {:else if viewingItem.activity_type === ACTIVITY_TYPE.DOCUMENT}
        <p class="text-sm text-slate-500 italic mt-2">No file attached.</p>
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

  {/if}

  <svelte:fragment slot="footer">
    {#if isEditingInModal}
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="small" on:click={() => { editingActivity = null; viewingItem = null; }}>Cancel</Button>
        <ProtectedButton
          action="modify"
          variant="blue"
          size="small"
          icon="edit"
          loading={saving}
          disabled={saving || (editingActivity?.activity_type !== ACTIVITY_TYPE.DOCUMENT && !editingActivity?.body?.trim())}
          on:click={updateActivityAndClose}
        >
          {saving ? 'Saving…' : 'Update'}
        </ProtectedButton>
      </div>
    {:else}
      <div class="flex justify-end gap-2">
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="edit"
          on:click={() => openEditModal(viewingItem)}
        >
          Edit
        </ProtectedButton>
        <Button variant="secondary" on:click={() => viewingItem = null}>Close</Button>
      </div>
    {/if}
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
