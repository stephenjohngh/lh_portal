<!-- src/lib/apps/issues/components/IssueCard.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import CommentsSection from './CommentsSection.svelte';
  import ActionsSection from './ActionsSection.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { getPriorityLabel } from '$lib/utils/priorities';
  import { formatDate } from '$lib/utils/dates';
  import { ISSUE_STATUS } from '$lib/utils/constants';
  import { ACTION_STATUS } from '$lib/utils/constants';

  export let issue;
  export let showComments = false;
  export let showActions = false;
  
  const dispatch = createEventDispatcher();

  // Track if we're editing the issue inline
  let editingInline = false;
  let editedIssue = null;
  let showDeleteConfirm = false;

  // Calculate historic comments count
  $: historicCommentsCount = issue.comments?.filter(c => c.historic).length || 0;
  
  // Calculate outstanding actions (not completed)
  $: outstandingActionsCount = issue.actions?.filter(action => 
    action.status !== ACTION_STATUS.COMPLETED
  ).length || 0;

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

  // Get background color based on issue status
  $: backgroundClass = issue.status === ISSUE_STATUS.COMPLETED 
    ? 'bg-emerald-900/20' 
    : issue.status === ISSUE_STATUS.PARKED 
    ? 'bg-amber-900/20' 
    : 'bg-slate-700/50';
  
  // ✨ NEW: Enhanced background when active (comments or actions visible)
  $: activeBackgroundClass = (showComments || showActions)
    ? (issue.status === ISSUE_STATUS.COMPLETED 
        ? 'bg-emerald-900/30' 
        : issue.status === ISSUE_STATUS.PARKED 
        ? 'bg-amber-900/30' 
        : 'bg-slate-700/70')
    : backgroundClass;
  
  $: borderClass = issue.status === ISSUE_STATUS.COMPLETED
    ? 'border-emerald-700/40'
    : issue.status === ISSUE_STATUS.PARKED
    ? 'border-amber-700/40'
    : 'border-slate-600';
  
  // ✨ NEW: Enhanced border when active
  $: activeBorderClass = (showComments || showActions)
    ? (issue.status === ISSUE_STATUS.COMPLETED
        ? 'border-emerald-500/60'
        : issue.status === ISSUE_STATUS.PARKED
        ? 'border-amber-500/60'
        : 'border-purple-500/50')
    : borderClass;
</script>

<div class="{activeBackgroundClass} rounded-lg border-2 {activeBorderClass} overflow-hidden transition-all duration-300 ease-in-out {showComments || showActions ? 'shadow-lg shadow-purple-500/20' : ''}">
  <!-- Issue Header -->
  <div class="p-3">
    <div class="flex justify-between items-start mb-1">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="text-xl font-semibold text-white">{issue.name}</h3>
          <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
            {getPriorityLabel(issue.priority).label}
          </span>
          {#if issue.status === ISSUE_STATUS.PARKED}
            <span class="px-2 py-1 text-xs font-semibold bg-amber-600 text-white rounded">
              🅿️ Parked
            </span>
          {:else if issue.status === ISSUE_STATUS.COMPLETED}
            <span class="px-2 py-1 text-xs font-semibold bg-emerald-600 text-white rounded">
              ✓ Completed
            </span>
          {/if}
        </div>
        
        {#if issue.description}
          <p class="text-gray-300 whitespace-pre-wrap">{issue.description}</p>
        {/if}
        
        <div class="flex items-center space-x-4 mt-1 text-sm text-gray-400">
          <span>Created: {formatDate(issue.created_at, issue.created_by_profile?.full_name)}</span>
          {#if issue.updated_at && issue.updated_at !== issue.created_at}
            <span>•</span>
            <span>Modified: {formatDate(issue.updated_at, issue.updated_by_profile?.full_name)}</span>
          {/if}
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

    <!-- Information Line with Expand/Collapse Button -->
    <div class="flex justify-between items-center mt-3 pt-3 border-t border-slate-600/50">
      <div class="flex items-center gap-4 text-sm text-gray-300">
        <!-- Comments Info -->
        <div class="flex items-center gap-1.5">
          <Icon name="comment" size={4} className="text-blue-400" />
          <span>
            {issue.comments?.length || 0} comment{issue.comments?.length !== 1 ? 's' : ''}
            {#if historicCommentsCount > 0}
              <span class="text-gray-500">({historicCommentsCount} historic)</span>
            {/if}
          </span>
        </div>
        
        <!-- Actions Info -->
        <div class="flex items-center gap-1.5">
          <Icon name="clipboard" size={4} className="text-green-400" />
          <span>
            {issue.actions?.length || 0} action{issue.actions?.length !== 1 ? 's' : ''}
            {#if outstandingActionsCount > 0}
              <span class="text-orange-400 font-medium">({outstandingActionsCount} outstanding)</span>
            {/if}
            {#if overdueActionsCount > 0}
              <span class="text-red-400 font-semibold ml-1">• {overdueActionsCount} overdue</span>
            {/if}
          </span>
        </div>
      </div>
      
      <!-- Expand/Collapse Button -->
      <button
        on:click={() => {
          if (showComments || showActions) {
            // Collapse both
            if (showComments) dispatch('toggleComments');
            if (showActions) dispatch('toggleActions');
          } else {
            // Expand both
            dispatch('toggleComments');
            dispatch('toggleActions');
          }
        }}
        class="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 rounded text-sm font-medium flex items-center gap-1.5 transition-colors"
        title={showComments || showActions ? 'Collapse all sections' : 'Expand all sections'}
      >
        <Icon name={showComments || showActions ? 'chevron-up' : 'chevron-down'} size={4} />
        <span>{showComments || showActions ? 'Collapse' : 'Expand'}</span>
      </button>
    </div>
  </div>

  <!-- Comments Section -->
  {#if showComments}
    <div class="ml-8 mr-4 mb-3">
      <div class="border-l-4 border-blue-500 pl-3">
        <CommentsSection 
          issueId={issue.id}
          comments={issue.comments || []}
        />
      </div>
    </div>
  {/if}

  <!-- Actions Section -->
  {#if showActions}
    <div class="ml-8 mr-4 mb-3">
      <div class="border-l-4 border-green-500 pl-3">
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
  message="Are you sure you want to delete '{issue.name}'? This will also delete {issue.comments?.length || 0} comments and {issue.actions?.length || 0} actions. This action cannot be undone."
  confirmText="Delete Issue"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDelete}
  on:cancel={() => showDeleteConfirm = false}
/>
