<!-- src/lib/components/issues/IssueCard.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import CommentsSection from './CommentsSection.svelte';
  import ActionsSection from './ActionsSection.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { getPriorityLabel } from '$lib/utils/priorities';
  import { formatDate } from '$lib/utils/dates';
  import { ISSUE_STATUS } from '$lib/utils/constants';

  export let issue;
  export let showComments = false;
  export let showActions = false;
  
  const dispatch = createEventDispatcher();

  // Track if we're editing the issue inline
  let editingInline = false;
  let editedIssue = null;
  let showDeleteConfirm = false;

  // Calculate overdue actions count
  $: overdueActionsCount = issue.actions?.filter(action => {
    if (!action.date_deadline || action.status === 'completed') return false;
    const deadline = new Date(action.date_deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);
    return deadline < today;
  }).length || 0;

  function handleDelete() {
    showDeleteConfirm = true;
  }

  function confirmDelete() {
    dispatch('delete', issue.id);
    showDeleteConfirm = false;
  }
</script>

<div class="bg-slate-700/50 rounded-lg border border-slate-600 overflow-hidden">
  <!-- Issue Header -->
  <div class="p-4">
    <div class="flex justify-between items-start mb-2">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <h3 class="text-xl font-semibold text-white">{issue.name}</h3>
          <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
            {getPriorityLabel(issue.priority).label}
          </span>
        </div>
        
        {#if issue.description}
          <p class="text-gray-300">{issue.description}</p>
        {/if}
        
        <div class="flex items-center space-x-4 mt-2 text-sm text-gray-400">
          <span>Created: {formatDate(issue.original_date)}</span>
          <span>•</span>
          <span>Priority: {issue.priority || 3}</span>
          <span>•</span>
          <span>{issue.comments?.length || 0} comments</span>
          <span>•</span>
          <span>{issue.actions?.length || 0} actions</span>
        </div>
      </div>
      
      <div class="flex space-x-2">
        <button
          on:click={() => dispatch('edit', issue)}
          class="p-2 hover:bg-slate-600 rounded"
          title="Edit issue"
        >
          <Icon name="edit" size={5} />
        </button>
        <button
          on:click={handleDelete}
          class="p-2 hover:bg-red-600/20 rounded text-red-400"
          title="Delete issue"
        >
          <Icon name="delete" size={5} />
        </button>
      </div>
    </div>

    <!-- Toggle Buttons -->
    <div class="flex space-x-2 mt-3">
      <button
        on:click={() => dispatch('toggleComments')}
        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1"
      >
        <Icon name="comment" size={4} />
        <span>{showComments ? 'Hide' : 'Show'} Comments ({issue.comments?.length || 0})</span>
      </button>
      <button
        on:click={() => dispatch('toggleActions')}
        class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1"
      >
        <Icon name="clipboard" size={4} />
        <span>{showActions ? 'Hide' : 'Show'} Actions ({issue.actions?.length || 0})</span>
        {#if overdueActionsCount > 0}
          <span class="ml-1 px-1.5 py-0.5 bg-red-600 rounded text-xs font-semibold">
            {overdueActionsCount} overdue
          </span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Comments Section -->
  {#if showComments}
    <div class="ml-8 mr-4 mb-4">
      <div class="border-l-4 border-blue-500 pl-4">
        <CommentsSection 
          issueId={issue.id}
          comments={issue.comments || []}
        />
      </div>
    </div>
  {/if}

  <!-- Actions Section -->
  {#if showActions}
    <div class="ml-8 mr-4 mb-4">
      <div class="border-l-4 border-green-500 pl-4">
        <ActionsSection 
          issueId={issue.id}
          actions={issue.actions || []}
        />
      </div>
    </div>
  {/if}
</div>

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Issue"
  message="Are you sure you want to delete '{issue.name}'? This will also delete  {issue.comments?.length || 0} comment(s) and {issue.actions?.length || 0} action(s). This action cannot be undone."
  confirmText="Delete Issue"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDelete}
  on:cancel={() => showDeleteConfirm = false}
/>
