<!-- src/lib/apps/issues/components/CommentsSection.svelte -->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { env as publicEnv } from '$env/dynamic/public';
  import { auth } from '$lib/stores/auth';
  import { issuesStore } from '../stores/issuesStore';
  import { formatDateTime, wasModified } from '$lib/utils/dates';
  import { api } from '$lib/utils/api';
  import { getLogger } from '$lib/utils/logger';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import ActionForm from './ActionForm.svelte';

  const logger = getLogger('CommentsSection');

  // Feature flag — when 'true', the suggestion card calls the LLM API on
  // open. When unset/anything else, we use the comment text verbatim
  // (Day 0.5 fallback, identical behaviour to before this feature shipped).
  const AI_SUGGESTIONS_ENABLED = publicEnv.PUBLIC_AI_SUGGESTIONS_ENABLED === 'true';

  const dispatch = createEventDispatcher();

  export let issueId;
  export let comments = [];
  // Passed in by IssueCard so we can tell, per comment, whether an
  // action has already been created from it. One-to-one: at most one
  // action per comment (enforced by DB partial unique index).
  export let actions  = [];

  // Map of comment.id → linked action (or undefined).
  $: linkedActionByCommentId = Object.fromEntries(
    actions
      .filter(a => a?.source_comment_id)
      .map(a => [a.source_comment_id, a])
  );

  let showAddForm    = false;
  let editingComment = null;
  let viewingComment = null;   // full-text view modal
  let showDeleteConfirm = false;
  let pendingDeleteId   = null;
  let showHistoric = false;

  // Sort state — default: latest modified first
  let sortField = 'updated_at';  // 'updated_at' | 'created_at'
  let sortDir   = 'desc';        // 'desc' | 'asc'

  let newComment = { comment_text: '', historic: false };
  let mutationError = '';
  let saving = false;

  // -- "Create Action from Comment" suggestion state -------------------
  // The suggestion card has two source paths:
  //   1. AI: hit /api/issues/suggest-action and use the returned action_text.
  //   2. Fallback: copy the comment text verbatim (used when the feature
  //      flag is off, the API returns 5xx, or the model declines but the
  //      user still wants to draft something manually).
  let suggestionForId   = null;   // comment.id whose suggestion card is open (null = none)
  let suggestionDraft   = '';     // editable action text in the suggestion card
  let suggestionSaving  = false;  // true while the ActionForm submit is in flight
  let suggestionLoading = false;  // true while the AI API call is in flight
  // 'ai' | 'comment' | 'ai_declined' | 'ai_failed' | 'already_linked'
  let suggestionSource  = 'comment';
  let suggestionInfo    = '';     // user-facing reasoning / fallback notice
  let suggestionError   = '';

  // ActionForm modal — opened from the suggestion card so the user can
  // fill in deadline / assignee / status before saving.
  let showActionForm        = false;
  let actionFormInitialText = '';

  // Linked-action delete confirmation — used when the user opens the
  // 'already linked' panel and clicks Delete linked action.
  let showLinkedDeleteConfirm = false;
  let pendingLinkedAction     = null;
  let linkedDeleteError       = '';

  // Profile list for the ActionForm assignee dropdown — duplicated here
  // (also loaded by ActionsSection) so this section is self-contained.
  let profiles = [];

  onMount(async () => {
    try {
      profiles = await api.get('profiles', { select: 'full_name', orderBy: 'full_name' });
    } catch (err) {
      logger('❌ Error loading profiles for action form:', err);
      profiles = [];
    }
  });

  $: assigneeOptions = [
    { value: '', label: '' },
    ...profiles.map(p => ({ value: p.full_name, label: p.full_name })),
    { value: 'External', label: 'External' }
  ];

  // Filter historic, then sort
  $: filteredComments = showHistoric
    ? comments
    : comments.filter(c => !c.historic);

  $: visibleComments = [...filteredComments].sort((a, b) => {
    const aVal = new Date(sortField === 'updated_at' ? (a.updated_at || a.created_at) : a.created_at);
    const bVal = new Date(sortField === 'updated_at' ? (b.updated_at || b.created_at) : b.created_at);
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
  });

  $: historicCount = comments.filter(c => c.historic).length;

  function toggleSortDir() {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  }

  async function addComment() {
    if (!newComment.comment_text.trim()) return;
    saving = true;
    mutationError = '';
    const result = await issuesStore.addComment(issueId, newComment.comment_text);
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to add comment'; return; }
    newComment = { comment_text: '', historic: false };
    showAddForm = false;
  }

  async function updateComment() {
    if (!editingComment.comment_text.trim()) return;
    saving = true;
    mutationError = '';
    const result = await issuesStore.updateComment(
      editingComment.id,
      editingComment.comment_text,
      editingComment.historic
    );
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to update comment'; return; }
    editingComment = null;
  }

  async function deleteComment() {
    if (!pendingDeleteId) return;
    const result = await issuesStore.deleteComment(pendingDeleteId);
    if (!result.success) { mutationError = result.error ?? 'Failed to delete comment'; }
    pendingDeleteId = null;
    showDeleteConfirm = false;
  }

  function startEdit(comment) {
    editingComment   = { ...comment };
    viewingComment   = null;
  }

  function cancelEdit() {
    editingComment = null;
  }

  // -- Suggestion-card handlers ----------------------------------------
  // Top-level toggle that drives the per-comment button: if the panel
  // for this comment is already open, close it; otherwise call
  // openSuggestion() (which will route to the linked-action warning,
  // the AI fetch, or the verbatim fallback depending on state).
  function toggleSuggestion(comment) {
    if (suggestionForId === comment.id) {
      dismissSuggestion();
    } else {
      openSuggestion(comment);
    }
  }

  async function openSuggestion(comment) {
    // Close any other inline editor so the panel doesn't get crowded
    editingComment    = null;
    viewingComment    = null;
    suggestionError   = '';
    suggestionInfo    = '';
    suggestionForId   = comment.id;

    // If this comment already has a linked action, short-circuit to a
    // warning panel — the user must delete the existing action first.
    const existing = linkedActionByCommentId[comment.id];
    if (existing) {
      suggestionLoading = false;
      suggestionDraft   = '';
      suggestionSource  = 'already_linked';
      return;
    }

    if (!AI_SUGGESTIONS_ENABLED) {
      // Day 0.5 path: just copy the comment text into the editable draft.
      suggestionDraft  = comment.comment_text;
      suggestionSource = 'comment';
      return;
    }

    // AI path: open the card with a loading state, fetch a suggestion,
    // populate the draft (or fall back to comment text).
    suggestionLoading = true;
    suggestionDraft   = '';
    suggestionSource  = 'ai';

    try {
      const res = await fetch('/api/issues/suggest-action', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesting_user_id: $auth.user?.id,
          comment_id:         comment.id,
          issue_id:           issueId,
          comment_text:       comment.comment_text
        })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 4xx / 5xx — fall back to comment text and surface a soft notice
        logger('⚠️ AI suggestion failed:', res.status, data?.error);
        suggestionDraft  = comment.comment_text;
        suggestionSource = 'ai_failed';
        suggestionInfo   = 'AI suggestion unavailable. Using the comment text — edit as needed.';
      } else if (!data.shouldSuggest) {
        // Model declined — leave the textarea blank so the user starts
        // from a clean slate. The reasoning is shown above the field;
        // the user can type their own action or dismiss.
        suggestionDraft  = '';
        suggestionSource = 'ai_declined';
        suggestionInfo   = data.reasoning
          ? `AI didn't identify a clear action: "${data.reasoning}". Type your own action or dismiss.`
          : "AI didn't identify a clear action. Type your own action or dismiss.";
      } else {
        suggestionDraft  = data.action_text || comment.comment_text;
        suggestionSource = 'ai';
        suggestionInfo   = data.reasoning ? `Reasoning: ${data.reasoning}` : '';
      }
    } catch (err) {
      logger('❌ AI suggestion fetch error:', err);
      suggestionDraft  = comment.comment_text;
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

  // Open the full ActionForm modal seeded with the current draft text,
  // so the user can pick an assignee / deadline / status before saving.
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
    // Tag the new action with its source comment so it shows up as
    // linked, and so the DB unique-index blocks a second linked action
    // for the same comment.
    const result = await issuesStore.addAction(issueId, {
      ...detail,
      source_comment_id: suggestionForId
    });
    suggestionSaving = false;
    if (!result.success) {
      // Surface the error on the suggestion card and keep the modal
      // open so the user can adjust and retry.
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
    // Leave the suggestion card open so the user can edit and try again
    // or click Dismiss.
  }

  // -- Linked-action handlers (shown inside the 'already_linked' panel) --

  function viewLinkedAction(action) {
    // Tell IssueCard to expand the Actions section (if collapsed) and
    // scroll to this action. Then close our panel so the user lands on
    // the action without our card in the way.
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
      // Keep the dialog open so the user can retry / cancel
      return;
    }
    showLinkedDeleteConfirm = false;
    pendingLinkedAction     = null;
    // Close the now-empty panel
    dismissSuggestion();
  }

  function cancelDeleteLinked() {
    showLinkedDeleteConfirm = false;
    pendingLinkedAction     = null;
    linkedDeleteError       = '';
  }
</script>

<div class="bg-slate-800/30 rounded-lg p-3">

  <!-- -- Header row --------------------------------------------------- -->
  <div class="flex justify-between items-center mb-2 flex-wrap gap-2">
    <h4 class="font-semibold flex items-center space-x-2">
      <Icon name="comment" size={5} className="text-blue-400" />
      <span>Comments ({visibleComments.length})</span>
      {#if comments.length !== filteredComments.length}
        <span class="text-xs text-gray-400">({historicCount} historic)</span>
      {/if}
    </h4>

    <div class="flex items-center gap-2 flex-wrap">
      {#if historicCount > 0}
        <Button
          variant="secondary"
          size="small"
          on:click={() => showHistoric = !showHistoric}
        >
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
          title="{sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first'}"
        >
          {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

      <ProtectedButton
        action="modify"
        variant="blue"
        size="small"
        icon="comment"
        on:click={() => showAddForm = true}
      >
        Add Comment
      </ProtectedButton>
    </div>
  </div>

  {#if mutationError}
    <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-2">{mutationError}</p>
  {/if}

  <!-- -- Add comment form --------------------------------------------- -->
  {#if showAddForm}
    <div class="bg-slate-700/50 rounded p-3 border border-blue-500/50 mb-2">
      <textarea
        bind:value={newComment.comment_text}
        placeholder="Enter your comment…"
        class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        rows="5"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showAddForm = false; newComment.comment_text = ''; mutationError = ''; }}
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

  <!-- -- Comment list ------------------------------------------------- -->
  {#if visibleComments.length > 0}
    <div class="space-y-1">
      {#each visibleComments as comment (comment.id)}
        {#if editingComment?.id === comment.id}
          <!-- Edit form -->
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
                on:click={updateComment}
              >
                {saving ? 'Saving…' : 'Update'}
              </ProtectedButton>
            </div>
          </div>

        {:else}
          {@const isPanelOpen = suggestionForId === comment.id}
          {@const hasLinked   = !!linkedActionByCommentId[comment.id]}
          <!-- Comment display -->
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
                on:click={() => viewingComment = comment}
              >
                <p class="text-gray-200 text-sm whitespace-pre-wrap">{comment.comment_text}</p>
              </div>

              <div class="flex gap-1 flex-shrink-0">
                <!-- Action button:
                     - has linked action + panel closed → 'Show linked action'   (chevron-down)
                     - has linked action + panel open   → 'Hide linked action'   (chevron-up)
                     - no linked action  + panel closed → 'Create Linked Action' (clipboard)
                     - no linked action  + panel open   → 'Hide suggestion'      (chevron-up) -->
                <ProtectedButton
                  action="modify"
                  variant="secondary"
                  size="small"
                  icon={isPanelOpen
                          ? 'chevron-up'
                          : (hasLinked ? 'chevron-down' : 'clipboard')}
                  iconPosition="only"
                  on:click={() => toggleSuggestion(comment)}
                  title={isPanelOpen
                           ? (hasLinked ? 'Hide linked action' : 'Hide suggestion')
                           : (hasLinked ? 'Show linked action' : 'Create Linked Action')}
                />
                <ProtectedButton
                  action="modify"
                  variant="secondary"
                  size="small"
                  icon="edit"
                  iconPosition="only"
                  on:click={() => startEdit(comment)}
                  title="Edit comment"
                />
                <ProtectedButton
                  action="modify"
                  variant="danger"
                  size="small"
                  icon="delete"
                  iconPosition="only"
                  on:click={() => { pendingDeleteId = comment.id; showDeleteConfirm = true; }}
                  title="Delete comment"
                />
              </div>
            </div>

            <div class="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
              <span>Added: {formatDateTime(comment.created_at, comment.created_by_profile?.full_name)}</span>
              {#if wasModified(comment.created_at, comment.updated_at)}
                <span>•</span>
                <span>Modified: {formatDateTime(comment.updated_at, comment.updated_by_profile?.full_name)}</span>
              {/if}
              {#if comment.historic}
                <span>•</span>
                <span class="text-amber-400">Historic</span>
              {/if}
              {#if linkedActionByCommentId[comment.id]}
                <span>•</span>
                <span
                  class="text-purple-400/80"
                  title={`Linked action: ${linkedActionByCommentId[comment.id].action_text}`}
                >
                  🔗 Has linked action
                </span>
              {/if}
            </div>

            <!-- Suggested-action panel.
                 suggestionSource:
                   'ai'             — LLM produced an action_text
                   'ai_declined'    — LLM said no clear action
                   'ai_failed'      — API error / network failure
                   'comment'        — feature flag off (Day 0.5 fallback)
                   'already_linked' — comment already has a linked action;
                                      show warning instead of the form -->
            {#if suggestionForId === comment.id}
              {#if suggestionSource === 'already_linked'}
                {@const linked = linkedActionByCommentId[comment.id]}
                <div class="mt-2 bg-amber-900/15 border border-amber-700/40 rounded p-3 space-y-2">
                  {#if linked}
                    <div class="px-3 py-2 rounded bg-slate-800/80 border-l-2 border-amber-400">
                      <p class="text-sm text-gray-200 whitespace-pre-wrap">{linked.action_text}</p>
                      <div class="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                        <span class="px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-200/30 capitalize">
                          {linked.status}
                        </span>
                        {#if linked.name_text}
                          <span class="text-gray-500">👤 {linked.name_text}</span>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <p class="text-xs text-gray-500 italic">Linked action is no longer available.</p>
                  {/if}

                  {#if linkedDeleteError}
                    <p class="text-xs text-red-400">{linkedDeleteError}</p>
                  {/if}

                  {#if linked}
                    <div class="flex justify-end gap-2 flex-wrap">
                      <Button
                        variant="secondary"
                        size="small"
                        icon="clipboard"
                        on:click={() => viewLinkedAction(linked)}
                        title="Expand the Actions section and scroll to this action"
                      >
                        View in Actions
                      </Button>
                      <ProtectedButton
                        action="modify"
                        variant="danger"
                        size="small"
                        icon="delete"
                        on:click={() => requestDeleteLinked(linked)}
                        title="Delete the linked action (a new one can then be created)"
                      >
                        Delete linked action
                      </ProtectedButton>
                    </div>
                  {/if}
                </div>

              {:else}
                <div class="mt-2 bg-amber-900/15 border border-amber-700/40 rounded p-3 space-y-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-xs font-semibold text-amber-300 flex items-center gap-1.5 flex-wrap">
                      <span>
                        💡
                        {#if suggestionLoading}
                          AI suggestion — thinking…
                        {:else if suggestionSource === 'ai'}
                          AI-suggested action
                        {:else if suggestionSource === 'ai_declined'}
                          Suggested action (AI declined)
                        {:else if suggestionSource === 'ai_failed'}
                          Suggested action (AI unavailable)
                        {:else}
                          Suggested action from comment
                        {/if}
                      </span>
                      {#if !suggestionLoading}
                        <span class="text-amber-500/60 font-normal italic text-[10px]">draft — review before adding</span>
                      {/if}
                    </p>
                    <button
                      on:click={dismissSuggestion}
                      class="text-gray-400 hover:text-white text-sm leading-none"
                      title="Dismiss"
                      aria-label="Dismiss suggestion"
                    >✕</button>
                  </div>

                  {#if suggestionLoading}
                    <div class="flex items-center gap-2 px-2 py-3 text-sm text-amber-300/70">
                      <Icon name="refresh" size={4} className="animate-spin" />
                      <span>Asking the AI for a suggested action…</span>
                    </div>
                  {:else}
                    <textarea
                      bind:value={suggestionDraft}
                      rows="2"
                      placeholder="Action description"
                      class="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-y"
                    ></textarea>
                    {#if suggestionInfo}
                      <p class="text-[11px] text-amber-200/60 italic">{suggestionInfo}</p>
                    {/if}
                  {/if}

                  {#if suggestionError}
                    <p class="text-xs text-red-400">{suggestionError}</p>
                  {/if}

                  <div class="flex justify-end gap-2">
                    <Button variant="secondary" size="small" on:click={dismissSuggestion}>
                      Dismiss
                    </Button>
                    <ProtectedButton
                      action="modify"
                      variant="amber"
                      size="small"
                      icon="plus"
                      disabled={suggestionLoading || suggestionSaving || !suggestionDraft.trim()}
                      on:click={openSuggestionInActionForm}
                      title="Open the action form pre-filled with this text"
                    >
                      {suggestionSaving ? 'Adding…' : 'Add Action…'}
                    </ProtectedButton>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

</div>

<!-- -- Full comment view modal --------------------------------------- -->
<Modal
  show={!!viewingComment}
  title="Comment"
  size="medium"
  on:close={() => viewingComment = null}
>
  {#if viewingComment}
    <p class="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
      {viewingComment.comment_text}
    </p>
    <div class="flex items-center gap-2 mt-4 pt-3 border-t border-slate-700 text-xs text-gray-500 flex-wrap">
      <span>Added: {formatDateTime(viewingComment.created_at, viewingComment.created_by_profile?.full_name)}</span>
      {#if wasModified(viewingComment.created_at, viewingComment.updated_at)}
        <span>•</span>
        <span>Modified: {formatDateTime(viewingComment.updated_at, viewingComment.updated_by_profile?.full_name)}</span>
      {/if}
      {#if viewingComment.historic}
        <span>•</span>
        <span class="text-amber-400">Historic</span>
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
        on:click={() => startEdit(viewingComment)}
      >
        Edit
      </ProtectedButton>
      <Button variant="secondary" on:click={() => viewingComment = null}>Close</Button>
    </div>
  </svelte:fragment>
</Modal>

<!-- -- Delete confirmation ------------------------------------------- -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Comment"
  message="Are you sure you want to delete this comment? This action cannot be undone."
  confirmText="Delete Comment"
  cancelText="Cancel"
  danger={true}
  on:confirm={deleteComment}
  on:cancel={() => { showDeleteConfirm = false; pendingDeleteId = null; }}
/>

<!-- -- Action form (opened from a comment's suggestion card) --------- -->
<ActionForm
  show={showActionForm}
  initialActionText={actionFormInitialText}
  {assigneeOptions}
  saving={suggestionSaving}
  on:submit={handleActionFormSubmit}
  on:cancel={handleActionFormCancel}
/>

<!-- -- Linked-action delete confirmation ----------------------------- -->
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
