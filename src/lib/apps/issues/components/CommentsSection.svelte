<!-- src/lib/apps/issues/components/CommentsSection.svelte -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDateTime } from '$lib/utils/dates';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let issueId;
  export let comments = [];

  let showAddModal = false;
  let editingComment = null;
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showHistoric = false;

  let newComment = { comment_text: '', historic: false };

  // Filter comments based on historic toggle
  $: visibleComments = showHistoric 
    ? comments 
    : comments.filter(c => !c.historic);

  $: activeCount = comments.filter(c => !c.historic).length;
  $: historicCount = comments.filter(c => c.historic).length;

  async function addComment() {
    if (!newComment.comment_text.trim()) return;
    await issuesStore.addComment(issueId, newComment.comment_text);
    newComment = { comment_text: '', historic: false };
    showAddModal = false;
  }

  async function updateComment() {
    if (!editingComment.comment_text.trim()) return;
    await issuesStore.updateComment(
      editingComment.id,
      editingComment.comment_text,
      editingComment.historic
    );
    editingComment = null;
  }

  async function deleteComment() {
    if (pendingDeleteId) {
      await issuesStore.deleteComment(pendingDeleteId);
      pendingDeleteId = null;
      showDeleteConfirm = false;
    }
  }

  function startEdit(comment) {
    editingComment = { ...comment };
  }

  function cancelEdit() {
    editingComment = null;
  }
</script>

<div class="bg-slate-800/30 rounded-lg p-3">
  <div class="flex justify-between items-center mb-2">
    <h4 class="font-semibold flex items-center space-x-2">
      <Icon name="comment" size={5} className="text-blue-400" />
      <span>Comments ({visibleComments.length})</span>
      {#if comments.length !== visibleComments.length}
        <span class="text-xs text-gray-400">({comments.length - visibleComments.length} historic)</span>
      {/if}
    </h4>
    <div class="flex items-center space-x-3">
      {#if historicCount > 0}
        <label class="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={showHistoric}
            class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
          />
          <span>Show historic</span>
        </label>
      {/if}
      <Button
        variant="blue"
        size="small"
        icon="comment"
        on:click={() => showAddModal = true}
      >
        Add Comment
      </Button>
    </div>
  </div>

  <!-- Add Comment Form -->
  {#if showAddModal}
    <div class="bg-slate-700/50 rounded p-3 border border-blue-500/50">
      <textarea
        bind:value={newComment.comment_text}
        placeholder="Enter your comment..."
        class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        rows="3"
      ></textarea>
      <div class="flex justify-end gap-2 mt-2">
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showAddModal = false; newComment.comment_text = ''; }}
        >
          Cancel
        </Button>
        <Button
          variant="blue"
          size="small"
          icon="plus"
          on:click={addComment}
        >
          Add Comment
        </Button>
      </div>
    </div>
  {/if}

  
  {#if visibleComments.length > 0}
    <div class="space-y-1">
      {#each visibleComments as comment (comment.id)}
        {#if editingComment?.id === comment.id}
          <!-- Edit Form -->
          <div class="bg-slate-700/50 rounded p-3 border border-blue-500/50">
            <textarea
              bind:value={editingComment.comment_text}
              class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows="3"
            ></textarea>
            <label class="flex items-center gap-2 mt-2 text-sm">
              <input type="checkbox" bind:checked={editingComment.historic} class="rounded" />
              <span class="text-gray-400">Mark as historic</span>
            </label>
            <div class="flex justify-end gap-2 mt-2">
              <Button variant="secondary" size="small" on:click={cancelEdit}>Cancel</Button>
              <Button variant="blue" size="small" icon="edit" on:click={updateComment}>Update</Button>
            </div>
          </div>
        {:else}
          <!-- Comment Display -->
          <div class="bg-slate-700/50 rounded p-2 border-l-2 border-blue-400 {comment.historic ? 'opacity-60' : ''}">
            <div class="flex justify-between items-start gap-2">
              <p class="text-gray-200 text-sm flex-1 whitespace-pre-wrap">{comment.comment_text}</p>
              <div class="flex gap-1 flex-shrink-0">
                <Button
                  variant="secondary"
                  size="small"
                  icon="edit"
                  iconPosition="only"
                  on:click={() => startEdit(comment)}
                  title="Edit comment"
                />
                <Button
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
              <span>{comment.created_by_profile?.full_name || 'Unknown'}</span>
              <span>•</span>
              <span>{formatDateTime(comment.created_at)}</span>
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

<!-- Delete Confirmation -->
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
