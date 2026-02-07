<!-- src/lib/apps/issues/components/CommentsSection.svelte -->
<!-- UPDATED: Now uses ProtectedButton for read-only user support -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDateTime } from '$lib/utils/dates';
  
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let issue;

  let showAddForm = false;
  let editingCommentId = null;
  let showHistoric = false;
  let deleteConfirmComment = null;

  // Form data
  let commentText = '';
  let isHistoric = false;
  let commentError = '';

  // Filter comments
  $: comments = issue.comments || [];
  $: visibleComments = showHistoric 
    ? comments 
    : comments.filter(c => !c.historic);

  // Counts
  $: activeCount = comments.filter(c => !c.historic).length;
  $: historicCount = comments.filter(c => c.historic).length;

  function resetForm() {
    commentText = '';
    isHistoric = false;
    commentError = '';
    showAddForm = false;
    editingCommentId = null;
  }

  function validateForm() {
    commentError = '';

    if (!commentText.trim()) {
      commentError = 'Comment text is required';
      return false;
    }

    return true;
  }

  async function handleSave() {
    if (!validateForm()) return;

    if (editingCommentId) {
      await issuesStore.updateComment(editingCommentId, commentText, isHistoric);
    } else {
      await issuesStore.addComment(issue.id, commentText);
    }

    resetForm();
  }

  function startEdit(comment) {
    editingCommentId = comment.id;
    commentText = comment.comment_text;
    isHistoric = comment.historic || false;
    showAddForm = true;
  }

  async function handleDelete() {
    if (deleteConfirmComment) {
      await issuesStore.deleteComment(deleteConfirmComment.id);
      deleteConfirmComment = null;
    }
  }
</script>

<div class="bg-slate-700/30 rounded-lg p-4 border border-blue-500/30">
  <!-- Section Header -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center space-x-2">
      <Icon name="comment" size={5} className="text-blue-400" />
      <h4 class="text-lg font-semibold text-white">Comments</h4>
      <Badge variant="primary" size="small">{activeCount}</Badge>
      {#if historicCount > 0}
        <Badge variant="secondary" size="small">{historicCount} historic</Badge>
      {/if}
    </div>

    <!-- Add Comment Button - hides for read-only users -->
    <ProtectedButton
      action="modify"
      variant="blue"
      size="small"
      icon="plus"
      on:click={() => showAddForm = true}
    >
      Add Comment
    </ProtectedButton>
  </div>

  <!-- Show Historic Toggle -->
  {#if historicCount > 0}
    <div class="mb-4">
      <Checkbox
        checked={showHistoric}
        label="Show historic comments ({historicCount})"
        on:change={() => showHistoric = !showHistoric}
      />
    </div>
  {/if}

  <!-- Add/Edit Form -->
  {#if showAddForm}
    <div class="mb-4 p-4 bg-slate-800 rounded-lg border border-blue-500/50">
      <h5 class="text-sm font-semibold text-white mb-3">
        {editingCommentId ? 'Edit Comment' : 'New Comment'}
      </h5>

      <div class="space-y-3">
        <FormTextarea
          label="Comment"
          bind:value={commentText}
          placeholder="Enter your comment..."
          rows={3}
          required={true}
          error={commentError}
          on:input={() => commentError = ''}
        />

        {#if editingCommentId}
          <Checkbox
            checked={isHistoric}
            label="Mark as historic (archive this comment)"
            on:change={() => isHistoric = !isHistoric}
          />
        {/if}

        <div class="flex space-x-2">
          <ProtectedButton
            action="modify"
            variant="blue"
            size="small"
            on:click={handleSave}
          >
            {editingCommentId ? 'Update' : 'Save'} Comment
          </ProtectedButton>

          <Button
            variant="secondary"
            size="small"
            on:click={resetForm}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Comments List -->
  {#if visibleComments.length === 0}
    <div class="text-center py-6 text-gray-400">
      <Icon name="comment" size={12} className="text-gray-600 mx-auto mb-2" />
      <p class="text-sm">
        {showHistoric ? 'No comments yet' : 'No active comments'}
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each visibleComments as comment (comment.id)}
        <div class="bg-slate-800 rounded p-3 border {comment.historic ? 'border-gray-600/50' : 'border-blue-400/30'}">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1 min-w-0 mr-3">
              <p class="text-white whitespace-pre-wrap mb-2">{comment.comment_text}</p>
              <div class="flex items-center space-x-3 text-sm text-gray-400">
                <div class="flex items-center space-x-1">
                  <Icon name="user" size={3} />
                  <span>{comment.created_by_profile?.full_name || 'Unknown'}</span>
                </div>
                <div class="flex items-center space-x-1">
                  <Icon name="calendar" size={3} />
                  <span>{formatDateTime(comment.created_at)}</span>
                </div>
                {#if comment.historic}
                  <Badge variant="secondary" size="small">Historic</Badge>
                {/if}
              </div>
            </div>
          </div>

          <!-- Action Buttons - all hide for read-only users -->
          <div class="flex space-x-2">
            <ProtectedButton
              action="modify"
              variant="secondary"
              size="small"
              icon="edit"
              on:click={() => startEdit(comment)}
            >
              Edit
            </ProtectedButton>

            <ProtectedButton
              action="modify"
              variant="danger"
              size="small"
              icon="delete"
              on:click={() => deleteConfirmComment = comment}
            >
              Delete
            </ProtectedButton>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Delete Confirmation -->
<ConfirmDialog
  bind:show={deleteConfirmComment}
  title="Delete Comment"
  message="Are you sure you want to delete this comment? This cannot be undone."
  confirmText="Delete"
  confirmVariant="danger"
  on:confirm={handleDelete}
/>
