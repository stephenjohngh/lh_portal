<!-- src/lib/apps/issues/components/CommentsSection.svelte -->
<!-- ✨ REFACTORED: Now uses Modal, FormTextarea, and validation -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDateTime } from '$lib/utils/dates';
  import { isRequired } from '$lib/utils/validation';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  
  // ✨ NEW: Import form components
  import Modal from '$lib/components/common/Modal.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';

  export let issueId;
  export let comments = [];

  let showAddModal = false;
  let editingComment = null;
  let newCommentText = '';
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showAllComments = false;

  // ✨ NEW: Validation errors
  let errors = {
    comment: ''
  };

  // Filter comments based on historic flag
  $: visibleComments = showAllComments 
    ? comments 
    : comments.filter(c => !c.historic);

  async function addComment() {
    // ✨ NEW: Validation
    errors = { comment: '' };
    
    if (!isRequired(newCommentText)) {
      errors.comment = 'Comment text is required';
      return;
    }
    
    await issuesStore.addComment(issueId, newCommentText);
    newCommentText = '';
    showAddModal = false;
  }

  async function updateComment() {
    if (!editingComment) return;
    
    // ✨ NEW: Validation for edit
    if (!isRequired(editingComment.comment_text)) {
      return;
    }
    
    await issuesStore.updateComment(
      editingComment.id, 
      editingComment.comment_text,
      editingComment.historic
    );
    editingComment = null;
  }

  function confirmDeleteComment(commentId) {
    pendingDeleteId = commentId;
    showDeleteConfirm = true;
  }

  async function handleDeleteConfirm() {
    await issuesStore.deleteComment(pendingDeleteId);
    showDeleteConfirm = false;
    pendingDeleteId = null;
  }

  function handleDeleteCancel() {
    showDeleteConfirm = false;
    pendingDeleteId = null;
  }
</script>

<div class="bg-slate-800/30 rounded-lg p-3">
  <div class="flex justify-between items-center mb-2">
    <h4 class="font-semibold flex items-center space-x-2">
      <Icon name="comment" size={5} className="text-blue-400" />
      <span>Comments ({visibleComments.length})</span>
      {#if comments.length !== visibleComments.length}
        <span class="text-xs text-gray-400">({comments.length - visibleComments.length} hidden)</span>
      {/if}
    </h4>
    <div class="flex items-center space-x-3">
      <label class="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showAllComments}
          class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
        />
        <span>Show all</span>
      </label>
      <button
        on:click={() => showAddModal = true}
        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
      >
        Add Comment
      </button>
    </div>
  </div>
  
  {#if visibleComments.length > 0}
    <div class="space-y-1">
      {#each visibleComments as comment}
        <div class="bg-slate-700/50 rounded p-2 border-l-2 border-blue-400 {comment.historic ? 'opacity-60' : ''}">
          {#if editingComment?.id === comment.id}
            <!-- ✨ REFACTORED: Inline edit now uses FormTextarea -->
            <div class="space-y-3">
              <FormTextarea
                label="Comment"
                bind:value={editingComment.comment_text}
                rows={3}
                required={true}
              />
              
              <div class="flex items-center space-x-2">
                <label class="flex items-center space-x-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={editingComment.historic}
                    class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-blue-600"
                  />
                  <span class="text-gray-300">Mark as historic</span>
                </label>
              </div>
              
              <div class="flex space-x-2">
                <button
                  on:click={updateComment}
                  class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                >
                  Save
                </button>
                <button
                  on:click={() => editingComment = null}
                  class="px-3 py-1 bg-slate-600 hover:bg-slate-700 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <div class="flex items-start space-x-2">
                  <p class="text-gray-200 whitespace-pre-wrap flex-1">{comment.comment_text}</p>
                  {#if comment.historic}
                    <span class="px-2 py-0.5 bg-gray-600/50 text-gray-300 text-xs rounded">Historic</span>
                  {/if}
                </div>
                <p class="text-xs text-gray-500 mt-1">
                  Added: {formatDateTime(comment.created_at, comment.created_by_profile?.full_name)}
                  {#if comment.updated_at && new Date(comment.updated_at).getTime() !== new Date(comment.created_at).getTime()}
                    • Modified: {formatDateTime(comment.updated_at, comment.updated_by_profile?.full_name)}
                  {/if}
                </p>
              </div>
              <div class="flex space-x-1">
                <button
                  on:click={() => editingComment = {...comment}}
                  class="p-1 hover:bg-slate-600 rounded"
                  title="Edit comment"
                >
                  <Icon name="edit" size={4} />
                </button>
                <button
                  on:click={() => confirmDeleteComment(comment.id)}
                  class="p-1 hover:bg-red-600/20 rounded text-red-400"
                  title="Delete comment"
                >
                  <Icon name="delete" size={4} />
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-gray-400 text-sm">No comments yet.</p>
  {/if}
</div>

<!-- ✨ REFACTORED: Add Comment Modal using Modal component -->
<Modal 
  bind:show={showAddModal} 
  title="New Comment"
  size="medium"
  on:close={() => {
    showAddModal = false;
    errors = { comment: '' };
  }}
>
  <FormTextarea
    label="Comment"
    bind:value={newCommentText}
    required={true}
    error={errors.comment}
    rows={4}
    placeholder="Enter your comment..."
    helpText="Add any relevant notes or updates"
    maxlength={1000}
  />
  
  <div slot="footer" class="flex justify-end space-x-2">
    <button
      on:click={() => showAddModal = false}
      class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
    >
      Cancel
    </button>
    <button
      on:click={addComment}
      class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
    >
      Add Comment
    </button>
  </div>
</Modal>

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Comment"
  message="Are you sure you want to delete this comment? This cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  on:confirm={handleDeleteConfirm}
  on:cancel={handleDeleteCancel}
/>
