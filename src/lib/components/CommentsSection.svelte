<!-- src/lib/components/issues/CommentsSection.svelte -->
<script>
  import { issuesStore } from './issuesStore';
  import { formatDateTime } from '$lib/utils/dates';

  export let issueId;
  export let comments = [];

  let showAddModal = false;
  let editingComment = null;
  let newCommentText = '';

  async function addComment() {
    if (!newCommentText.trim()) return;
    await issuesStore.addComment(issueId, newCommentText);
    newCommentText = '';
    showAddModal = false;
  }

  async function updateComment() {
    if (!editingComment) return;
    await issuesStore.updateComment(editingComment.id, editingComment.comment_text);
    editingComment = null;
  }

  async function deleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;
    await issuesStore.deleteComment(commentId);
  }
</script>

<div class="bg-slate-800/30 rounded-lg p-4">
  <div class="flex justify-between items-center mb-3">
    <h4 class="font-semibold flex items-center space-x-2">
      <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
      </svg>
      <span>Comments</span>
    </h4>
    <button
      on:click={() => showAddModal = true}
      class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
    >
      Add Comment
    </button>
  </div>
  
  {#if comments.length > 0}
    <div class="space-y-2">
      {#each comments as comment}
        <div class="bg-slate-700/50 rounded p-3 border-l-2 border-blue-400">
          {#if editingComment?.id === comment.id}
            <textarea
              bind:value={editingComment.comment_text}
              class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white mb-2"
              rows="2"
            ></textarea>
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
                <p class="text-gray-200">{comment.comment_text}</p>
                <p class="text-xs text-gray-500 mt-1">{formatDateTime(comment.date)}</p>
              </div>
              <div class="flex space-x-1">
                <button
                  on:click={() => editingComment = {...comment}}
                  class="p-1 hover:bg-slate-600 rounded"
                  title="Edit comment"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button
                  on:click={() => deleteComment(comment.id)}
                  class="p-1 hover:bg-red-600/20 rounded text-red-400"
                  title="Delete comment"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
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
        rows="4"
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
