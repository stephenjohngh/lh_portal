<!-- src/lib/apps/issues/components/IssueCard.svelte -->
<!-- REFACTORED: Uses new CSS utility classes -->
<script>
  import { createEventDispatcher, tick } from 'svelte';
  import CommentsSection from './CommentsSection.svelte';
  import ActionsSection from './ActionsSection.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { getPriorityLabel } from '$lib/utils/priorities';
  import { fmtDate } from '$lib/utils/dates';
  import { ISSUE_STATUS, ACTION_STATUS } from '$lib/utils/constants';

  export let issue;
  export let showComments = false;
  export let showActions = false;
  
  const dispatch = createEventDispatcher();

  let showDeleteConfirm = false;

  $: nonHistoricCommentsCount = issue.comments?.filter(c => !c.historic).length || 0;
  $: historicCommentsCount = issue.comments?.filter(c => c.historic).length || 0;
  
  $: outstandingActionsCount = issue.actions?.filter(action => 
    action.status !== ACTION_STATUS.COMPLETED
  ).length || 0;

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

  // Generic jump-and-highlight helper used by both the comment→action
  // jump (View in Actions button) and the action→comment jump (comment
  // icon button on a linked action). Ensures the relevant section is
  // expanded, scrolls the target into view, and ring-highlights it
  // until the user's next click anywhere on the page.
  async function jumpAndHighlight({ targetId, expandIf, toggleEvent }) {
    if (!targetId) return;

    // Clear any existing jump highlight before starting a new one
    document.querySelectorAll('.lh-jump-highlight').forEach(el => {
      el.classList.remove('ring-2', 'ring-purple-400', 'lh-jump-highlight');
    });

    if (expandIf) {
      dispatch(toggleEvent);
      // Two ticks: one for the parent to flip the show flag, another
      // for the child section's DOM to mount.
      await tick();
      await tick();
    }
    const el = document.getElementById(targetId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-purple-400', 'lh-jump-highlight');

    // Clear on the user's next click anywhere. capture:true ensures we
    // see clicks even on elements that stopPropagation; once:true makes
    // the listener auto-detach after firing.
    document.addEventListener(
      'click',
      () => el.classList.remove('ring-2', 'ring-purple-400', 'lh-jump-highlight'),
      { once: true, capture: true }
    );
  }

  function handleJumpToAction({ detail }) {
    return jumpAndHighlight({
      targetId:    `action-${detail?.actionId}`,
      expandIf:    !showActions,
      toggleEvent: 'toggleActions'
    });
  }

  function handleJumpToComment({ detail }) {
    return jumpAndHighlight({
      targetId:    `comment-${detail?.commentId}`,
      expandIf:    !showComments,
      toggleEvent: 'toggleComments'
    });
  }

  $: backgroundClass = issue.status === ISSUE_STATUS.COMPLETED 
    ? 'bg-emerald-900/20' 
    : issue.status === ISSUE_STATUS.PARKED 
    ? 'bg-amber-900/20' 
    : 'bg-slate-700/50';
  
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
    <div class="flex-between items-start mb-1">
      <div class="flex-1">
        <div class="flex-row mb-1">
          <h3 class="text-xl font-semibold text-white">
            {#if issue.issue_number}
              {issue.issue_number}.
            {/if}
            {issue.name}
          </h3>
          <span class="badge {getPriorityLabel(issue.priority).color}">
            {getPriorityLabel(issue.priority).label}
          </span>
          {#if issue.status === ISSUE_STATUS.PARKED}
            <span class="badge-amber">
              🅿️ Parked
            </span>
          {:else if issue.status === ISSUE_STATUS.COMPLETED}
            <span class="badge-emerald">
              ✓ Completed
            </span>
          {/if}
        </div>
        
        {#if issue.description}
          <p class="text-gray-300 whitespace-pre-wrap py-2">{issue.description}</p>
        {/if}
        
        <div class="flex-row-lg mt-1 text-muted-sm">
          <span>Created: {fmtDate(issue.created_at, issue.created_by_profile?.full_name)}</span>
          {#if issue.updated_at && issue.updated_at !== issue.created_at}
            <span>•</span>
            <span>Modified: {fmtDate(issue.updated_at, issue.updated_by_profile?.full_name)}</span>
          {/if}
         </div>
      </div>
      
      <div class="btn-group">
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="medium"
          icon="edit"
          iconPosition="only"
          on:click={() => dispatch('edit', issue)}
          title="Edit issue"
        />
        <ProtectedButton
          action="modify"
          variant="danger"
          size="medium"
          icon="delete"
          iconPosition="only"
          on:click={handleDelete}
          title="Delete issue"
        />
      </div>
    </div>

    <!-- Information Line -->
    <div class="flex-between mt-3 pt-3 border-t border-slate-600/50">
      <div class="flex-row-lg text-sm text-gray-300">
        {#if nonHistoricCommentsCount > 0}
          <div class="text-icon">
            <Icon name="comment" size={4} className="text-blue-400" />
            <span>
              {nonHistoricCommentsCount} comment{nonHistoricCommentsCount !== 1 ? 's' : ''}
              {#if historicCommentsCount > 0}
                <span class="text-gray-500">• {historicCommentsCount} historic</span>
              {/if}
            </span>
          </div>
        {/if}
        
        {#if outstandingActionsCount > 0}
          <div class="text-icon">
            <Icon name="clipboard" size={4} className="text-amber-400" />
            <span>
              {outstandingActionsCount} outstanding action{outstandingActionsCount !== 1 ? 's' : ''}
              {#if overdueActionsCount > 0}
                <span class="text-red-400 font-semibold ml-1">• {overdueActionsCount} overdue</span>
              {/if}
            </span>
          </div>
        {/if}
      </div>
      
      <Button
        variant="primary"
        size="medium"
        icon={showComments || showActions ? 'chevron-up' : 'chevron-down'}
        title={showComments || showActions ? 'Collapse all sections' : 'Expand all sections'}
        on:click={() => {
          if (showComments || showActions) {
            if (showComments) dispatch('toggleComments');
            if (showActions) dispatch('toggleActions');
          } else {
            dispatch('toggleComments');
            dispatch('toggleActions');
          }
        }}
      >
        {showComments || showActions ? 'Collapse' : 'Expand'}
      </Button>
    </div>
  </div>

  <!-- Comments Section -->
  {#if showComments}
    <div class="ml-8 mr-4 mb-3">
      <div class="border-l-4 border-blue-500 pl-3">
        <CommentsSection
          issueId={issue.id}
          comments={issue.comments || []}
          actions={issue.actions || []}
          on:jumpToAction={handleJumpToAction}
        />
      </div>
    </div>
  {/if}

  <!-- Actions Section -->
  {#if showActions}
    <div class="ml-8 mr-4 mb-3">
      <div class="border-l-4 border-amber-500 pl-3">
        <ActionsSection
          issueId={issue.id}
          actions={issue.actions || []}
          on:jumpToComment={handleJumpToComment}
        />
      </div>
    </div>
  {/if}
</div>

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
