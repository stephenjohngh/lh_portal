<!-- src/lib/components/issues/IssueCard.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import CommentsSection from './CommentsSection.svelte';
  import ActionsSection from './ActionsSection.svelte';

  export let issue;
  export let showComments = false;
  export let showActions = false;
  
  const dispatch = createEventDispatcher();

  // Track if we're editing the issue inline
  let editingInline = false;
  let editedIssue = null;

  // Calculate overdue actions count
  $: overdueActionsCount = issue.actions?.filter(action => {
    if (!action.date_deadline || action.status === 'completed') return false;
    const deadline = new Date(action.date_deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);
    return deadline < today;
  }).length || 0;

  function getPriorityLabel(priority) {
    if (priority === 1) return { text: 'Top Priority', color: 'bg-red-600' };
    if (priority === 2) return { text: 'Major Project', color: 'bg-orange-600' };
    if (priority === 3) return { text: 'Important', color: 'bg-yellow-600' };
    if (priority === 4) return { text: 'Minor', color: 'bg-green-600' };
    if (priority === 5) return { text: 'Pending', color: 'bg-blue-600' };
    return { text: 'Important', color: 'bg-yellow-600' };
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric'
    });
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
            {getPriorityLabel(issue.priority).text}
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
          <span class="capitalize">{issue.status || 'current'}</span>
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
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </button>
        <button
          on:click={() => dispatch('toggleStatus', issue)}
          class="p-2 hover:bg-slate-600 rounded"
          title="{issue.status === 'completed' ? 'Mark as current' : 'Mark as completed'}"
        >
          {#if issue.status === 'completed'}
            <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          {:else}
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          {/if}
        </button>
        <button
          on:click={() => dispatch('delete', issue.id)}
          class="p-2 hover:bg-red-600/20 rounded text-red-400"
          title="Delete issue"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Toggle Buttons -->
    <div class="flex space-x-2 mt-3">
      <button
        on:click={() => dispatch('toggleComments')}
        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
      >
        {showComments ? 'Hide' : 'Show'} Comments ({issue.comments?.length || 0})
      </button>
      <button
        on:click={() => dispatch('toggleActions')}
        class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center space-x-1"
      >
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
