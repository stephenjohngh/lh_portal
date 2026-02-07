<!-- src/lib/apps/issues/components/IssueCard.svelte -->
<!-- UPDATED: Now uses ProtectedButton for read-only user support -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { issuesStore } from '../stores/issuesStore';
  import { formatDate } from '$lib/utils/dates';
  import { PRIORITIES, getPriorityColor } from '$lib/utils/priorities';
  
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  
  import IssueForm from './IssueForm.svelte';
  import ActionsSection from './ActionsSection.svelte';
  import CommentsSection from './CommentsSection.svelte';

  export let issue;

  const dispatch = createEventDispatcher();

  let expanded = false;
  let showEditModal = false;
  let showDeleteConfirm = false;

  // Calculate counts
  $: nonHistoricCommentsCount = issue.comments?.filter(c => !c.historic).length || 0;
  $: historicCommentsCount = issue.comments?.filter(c => c.historic).length || 0;
  $: outstandingActionsCount = issue.actions?.filter(a => a.status !== 'completed').length || 0;
  $: overdueActionsCount = issue.actions?.filter(a => {
    if (a.status === 'completed') return false;
    if (!a.date_deadline) return false;
    return new Date(a.date_deadline) < new Date();
  }).length || 0;

  // Get priority info
  $: priority = PRIORITIES.find(p => p.value === issue.priority) || PRIORITIES[2];
  $: priorityColor = getPriorityColor(issue.priority);

  // Status badge variant
  $: statusVariant = {
    'current': 'primary',
    'completed': 'success',
    'parked': 'warning'
  }[issue.status] || 'secondary';

  async function handleEdit(event) {
    await issuesStore.updateIssue(issue.id, event.detail);
    showEditModal = false;
  }

  async function handleDelete() {
    await issuesStore.deleteIssue(issue.id);
    showDeleteConfirm = false;
  }
</script>

<div class="bg-slate-700/50 rounded-lg border border-slate-600 hover:border-purple-500 transition-colors">
  <!-- Card Header -->
  <div class="p-4">
    <div class="flex items-start justify-between mb-2">
      <!-- Title and Priority -->
      <div class="flex-1 min-w-0 mr-4">
        <div class="flex items-center space-x-2 mb-1">
          <h3 class="text-lg font-semibold text-white truncate">{issue.name}</h3>
          <Badge variant={priorityColor} size="small">
            {priority.label}
          </Badge>
        </div>
        {#if issue.description}
          <p class="text-sm text-gray-400 line-clamp-2">{issue.description}</p>
        {/if}
      </div>

      <!-- Status Badge -->
      <Badge variant={statusVariant} size="medium">
        {issue.status}
      </Badge>
    </div>

    <!-- Summary Line -->
    <div class="flex items-center space-x-4 text-sm text-gray-400 mb-3">
      <!-- Comments count (only non-historic) -->
      {#if nonHistoricCommentsCount > 0}
        <div class="flex items-center space-x-1">
          <Icon name="comment" size={4} className="text-blue-400" />
          <span>
            {nonHistoricCommentsCount} {nonHistoricCommentsCount === 1 ? 'comment' : 'comments'}
            {#if historicCommentsCount > 0}
              <span class="text-gray-500">• {historicCommentsCount} historic</span>
            {/if}
          </span>
        </div>
      {/if}

      <!-- Actions count (outstanding) -->
      {#if outstandingActionsCount > 0}
        <div class="flex items-center space-x-1">
          <Icon name="clipboard" size={4} className="text-amber-400" />
          <span>
            {outstandingActionsCount} outstanding {outstandingActionsCount === 1 ? 'action' : 'actions'}
            {#if overdueActionsCount > 0}
              <span class="text-red-400">• {overdueActionsCount} overdue</span>
            {/if}
          </span>
        </div>
      {/if}
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center space-x-2">
      <!-- Expand/Collapse - visible to everyone -->
      <Button
        variant="secondary"
        size="small"
        icon={expanded ? 'chevron-up' : 'chevron-down'}
        on:click={() => expanded = !expanded}
      >
        {expanded ? 'Collapse' : 'Expand'}
      </Button>

      <!-- Edit button - hides for read-only users -->
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        icon="edit"
        on:click={() => showEditModal = true}
      >
        Edit
      </ProtectedButton>

      <!-- Delete button - hides for read-only users -->
      <ProtectedButton
        action="modify"
        variant="danger"
        size="small"
        icon="delete"
        on:click={() => showDeleteConfirm = true}
      >
        Delete
      </ProtectedButton>
    </div>
  </div>

  <!-- Expanded Content -->
  {#if expanded}
    <div class="border-t border-slate-600 p-4 space-y-4 bg-slate-800/50">
      <!-- Full Description -->
      {#if issue.description}
        <div>
          <h4 class="text-sm font-semibold text-gray-300 mb-2">Description</h4>
          <p class="text-gray-400 whitespace-pre-wrap">{issue.description}</p>
        </div>
      {/if}

      <!-- Metadata -->
      <div class="flex items-center space-x-4 text-sm text-gray-400">
        <span>Created: {formatDate(issue.created_at, issue.created_by_profile?.full_name)}</span>
        {#if issue.updated_at && issue.updated_at !== issue.created_at}
          <span>•</span>
          <span>Modified: {formatDate(issue.updated_at, issue.updated_by_profile?.full_name)}</span>
        {/if}
      </div>

      <!-- Actions Section -->
      <ActionsSection {issue} />

      <!-- Comments Section -->
      <CommentsSection {issue} />
    </div>
  {/if}
</div>

<!-- Edit Modal -->
{#if showEditModal}
  <IssueForm 
    show={showEditModal}
    {issue}
    on:submit={handleEdit}
    on:close={() => showEditModal = false}
  />
{/if}

<!-- Delete Confirmation -->
<ConfirmDialog
  bind:show={showDeleteConfirm}
  title="Delete Issue"
  message="Are you sure you want to delete '{issue.name}'? This will also delete all associated comments and actions. This action cannot be undone."
  confirmText="Delete"
  confirmVariant="danger"
  on:confirm={handleDelete}
/>
