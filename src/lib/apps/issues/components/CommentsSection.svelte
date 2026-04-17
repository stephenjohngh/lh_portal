<!-- src/lib/apps/issues/components/CommentsSection.svelte -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDateTime, wasModified } from '$lib/utils/dates';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let issueId;
  export let comments = [];

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
          <!-- Comment display -->
          <div class="bg-slate-700/50 rounded p-2 border-l-2 border-blue-400 {comment.historic ? 'opacity-60' : ''}">
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

            <div class="flex items-center gap-2 mt-1 text-xs text-gray-500">
              <span>Added: {formatDateTime(comment.created_at, comment.created_by_profile?.full_name)}</span>
              {#if wasModified(comment.created_at, comment.updated_at)}
                <span>•</span>
                <span>Modified: {formatDateTime(comment.updated_at, comment.updated_by_profile?.full_name)}</span>
              {/if}
              {#if comment.historic}
                <span>•</span>
                <span class="text-amber-400">Historic</span>
              {/if}
            </div>
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
