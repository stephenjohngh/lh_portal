<!-- src/lib/apps/issues/components/ActivityLogSection.svelte -->
<!--
  Activity Log — the unified list of activities for an issue.
  Formerly CommentsSection (activities table, replaces comments + decisions).

  Renders comments and decisions interleaved in chronological order.
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
  import { ACTIVITY_TYPE }    from '$lib/utils/constants';
  import { fmtDateTime, wasModified, toDateTimeLocal } from '$lib/utils/dates';
  import MeetingBadge         from './meetings/MeetingBadge.svelte';
  import { getLogger }        from '$lib/utils/logger';
  import Icon                 from '$lib/components/icons/Icon.svelte';
  import Button               from '$lib/components/common/Button.svelte';
  import Modal                from '$lib/components/common/Modal.svelte';
  import ProtectedButton      from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog        from '$lib/components/common/ConfirmDialog.svelte';
  import ActionForm           from './ActionForm.svelte';
  import ActivityItem         from './ActivityItem.svelte';

  const logger = getLogger('ActivityLogSection');

  // Feature flag — when 'true', the suggestion card calls the LLM API on
  // open. When unset/anything else, we use the activity body text verbatim.
  const AI_SUGGESTIONS_ENABLED = publicEnv.PUBLIC_AI_SUGGESTIONS_ENABLED === 'true';

  const dispatch = createEventDispatcher();

  // -- Props -----------------------------------------------------------
  export let issueId;
  export let activities = [];  // all activities (comments + decisions)
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
  let showAddCommentForm  = false;
  let showAddDecisionForm = false;
  let editingActivity     = null;   // { ...activityRow } being edited
  let viewingItem         = null;   // { ...activityRow, _type } for modal
  let showDeleteConfirm   = false;
  let pendingDeleteId     = null;
  let showHistoric        = false;

  let sortField = 'updated_at';  // 'updated_at' | 'created_at'
  let sortDir   = 'desc';        // 'desc' | 'asc'

  let newComment  = { body: '' };
  let newDecision = { body: '' };
  let mutationError = '';
  let saving = false;

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

  // -- Comment CRUD ----------------------------------------------------
  async function addComment() {
    if (!newComment.body.trim()) return;
    saving = true;
    mutationError = '';
    const result = await issuesStore.addActivity(issueId, {
      body:          newComment.body,
      activity_type: ACTIVITY_TYPE.COMMENT
    });
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to add comment'; return; }
    newComment = { body: '' };
    showAddCommentForm = false;
  }

  // -- Decision CRUD ---------------------------------------------------
  async function addDecision() {
    if (!newDecision.body.trim()) return;
    saving = true;
    mutationError = '';
    const result = await issuesStore.addActivity(issueId, {
      body:          newDecision.body,
      activity_type: ACTIVITY_TYPE.DECISION
    });
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to add decision'; return; }
    newDecision = { body: '' };
    showAddDecisionForm = false;
  }

  // -- Unified update/delete ------------------------------------------
  async function updateActivity() {
    if (!editingActivity?.body?.trim()) return;
    saving = true;
    mutationError = '';
    const result = await issuesStore.updateActivity(editingActivity.id, {
      body:                editingActivity.body,
      historic:            editingActivity.historic,
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

  async function openSuggestion(activity) {
    editingActivity   = null;
    viewingItem       = null;
    suggestionError   = '';
    suggestionInfo    = '';
    suggestionForId   = activity.id;

    // If this activity already has a linked action, short-circuit.
    if (linkedActionByActivityId[activity.id]) {
      suggestionLoading = false;
      suggestionDraft   = '';
      suggestionSource  = 'already_linked';
      return;
    }

    if (!AI_SUGGESTIONS_ENABLED) {
      suggestionDraft  = activity.body;
      suggestionSource = 'comment';
      return;
    }

    suggestionLoading = true;
    suggestionDraft   = '';
    suggestionSource  = 'ai';

    try {
      const res = await fetch('/api/issues/suggest-action', {
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
        suggestionInfo   = 'AI suggestion unavailable. Using the comment text — edit as needed.';
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
      suggestionInfo   = 'AI suggestion unavailable. Using the comment text — edit as needed.';
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
        icon="comment"
        on:click={() => showAddCommentForm = true}
      >
        Add Comment
      </ProtectedButton>
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        on:click={() => showAddDecisionForm = true}
      >
        + Decision
      </ProtectedButton>
    </div>
  </div>

  {#if mutationError}
    <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-2">{mutationError}</p>
  {/if}

  <!-- ─── Add comment form ──────────────────────────────────── -->
  {#if showAddCommentForm}
    <div class="bg-slate-700/50 rounded p-3 border border-blue-500/50 mb-2">
      <textarea
        bind:value={newComment.body}
        placeholder="Enter your comment…"
        class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        rows="5"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showAddCommentForm = false; newComment.body = ''; mutationError = ''; }}
        >
          Cancel
        </Button>
        <ProtectedButton
          action="modify"
          variant="blue"
          size="small"
          icon="plus"
          disabled={saving}
          on:click={addComment}
        >
          {saving ? 'Saving…' : 'Add Comment'}
        </ProtectedButton>
      </div>
    </div>
  {/if}

  <!-- ─── Add decision form ─────────────────────────────────── -->
  {#if showAddDecisionForm}
    <div class="bg-slate-700/50 rounded p-3 border border-violet-500/50 mb-2">
      <textarea
        bind:value={newDecision.body}
        placeholder="Enter the decision…"
        class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
        rows="4"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showAddDecisionForm = false; newDecision.body = ''; mutationError = ''; }}
        >
          Cancel
        </Button>
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="plus"
          disabled={saving}
          on:click={addDecision}
        >
          {saving ? 'Saving…' : 'Add Decision'}
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
          on:viewLinked={(e) => viewLinkedAction(e.detail)}
          on:deleteLinkedRequest={(e) => requestDeleteLinked(e.detail)}
          on:meetingFilter
        />
      {/each}
    </div>
  {/if}

</div>

<!-- ─── Full item view modal ─────────────────────────────────── -->
<Modal
  show={!!viewingItem}
  title={viewingItem?.activity_type === ACTIVITY_TYPE.DECISION ? 'Decision' : 'Comment'}
  size="medium"
  on:close={() => viewingItem = null}
>
  {#if viewingItem}
    <p class="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
      {viewingItem.body}
    </p>
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
