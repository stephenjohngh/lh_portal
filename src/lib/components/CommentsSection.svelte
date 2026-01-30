<!-- src/lib/components/issues/CommentsSection.svelte -->
<script>
  import { issuesStore } from './issuesStore';
  import { formatDateTime } from '$lib/utils/dates';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let issueId;
  export let comments = [];

  let showAddModal = false;
  let editingComment = null;
  let newCommentText = '';
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showAllComments = false; // NEW: Show historic comments toggle

  // Filter comments based on historic flag
  $: visibleComments = showAllComments 
    ? comments 
    : comments.filter(c => !c.historic);

  async function addComment() {
    if (!newCommentText.trim()) return;
    await issuesStore.addComment(issueId, newCommentText);
    newCommentText = '';
    showAddModal = false;
  }

  async function updateComment() {
    if (!editingComment) return;
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


  // Add this reactive statement to log comment timestamps
  $: if (comments.length > 0) {
    console.log('=== Comments Debug ===');
    comments.forEach((comment, index) => {
      console.log(`Comment ${index + 1}:`, {
        id: comment.id,
        text: comment.comment_text?.substring(0, 30) + '...',
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        are_equal: comment.created_at === comment.updated_at,
        diff_milliseconds: comment.updated_at && comment.created_at 
          ? new Date(comment.updated_at) - new Date(comment.created_at)
          : null
      });
    });
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
            <textarea
              bind:value={editingComment.comment_text}
              class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white mb-2"
              rows="3"
            ></textarea>
            <div class="flex items-center space-x-2 mb-2">
              <label class="flex items-center space-x-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={editingComment.historic}
                  class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-blue-600"
                />
                <span class="text-gray-300">Historic</span>
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
                class="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
              >
                Cancel
              </button>
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

<!--
{#if console.log(comment.created_at)}
{/if}
{#if console.log(comment.updated_at)}
{/if}
-->
  {#if comment.updated_at && new Date(comment.updated_at).getTime() !== new Date(comment.created_at).getTime()  }
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

<!-- Add Comment Modal -->
{#if showAddModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">New Comment</h3>
      <textarea
        bind:value={newCommentText}
        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
        rows="3"
        placeholder="Enter your comment..."
      ></textarea>
      <div class="flex space-x-2 justify-end mt-4">
        <button
          on:click={() => showAddModal = false}
          class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
        >
          Cancel
        </button>
        <button
          on:click={addComment}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
        >
          Add Comment
        </button>
      </div>
    </div>
  </div>
{/if}

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
