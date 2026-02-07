<!-- src/lib/apps/issues/components/ActionsSection.svelte -->
<!-- UPDATED: Now uses ProtectedButton for read-only user support -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDate, isOverdue } from '$lib/utils/dates';
  import { ACTION_STATUS } from '$lib/utils/constants';
  
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let issue;

  let showAddForm = false;
  let editingActionId = null;
  let statusFilter = 'all';
  let deleteConfirmAction = null;

  // Form data
  let formData = {
    action_text: '',
    name_text: '',
    date_deadline: '',
    status: 'pending'
  };

  let formErrors = {
    action_text: '',
    name_text: ''
  };

  // Status options for select
  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' }
  ];

  // Filter actions
  $: actions = issue.actions || [];
  $: filteredActions = statusFilter === 'all' 
    ? actions 
    : actions.filter(a => a.status === statusFilter);

  // Counts
  $: pendingCount = actions.filter(a => a.status === 'pending').length;
  $: inProgressCount = actions.filter(a => a.status === 'in-progress').length;
  $: completedCount = actions.filter(a => a.status === 'completed').length;

  function resetForm() {
    formData = {
      action_text: '',
      name_text: '',
      date_deadline: '',
      status: 'pending'
    };
    formErrors = {
      action_text: '',
      name_text: ''
    };
    showAddForm = false;
    editingActionId = null;
  }

  function validateForm() {
    formErrors = { action_text: '', name_text: '' };
    let isValid = true;

    if (!formData.action_text.trim()) {
      formErrors.action_text = 'Action description is required';
      isValid = false;
    }

    if (!formData.name_text.trim()) {
      formErrors.name_text = 'Assignee name is required';
      isValid = false;
    }

    return isValid;
  }

  async function handleSave() {
    if (!validateForm()) return;

    if (editingActionId) {
      await issuesStore.updateAction(editingActionId, formData);
    } else {
      await issuesStore.addAction(issue.id, formData);
    }

    resetForm();
  }

  function startEdit(action) {
    editingActionId = action.id;
    formData = {
      action_text: action.action_text,
      name_text: action.name_text,
      date_deadline: action.date_deadline || '',
      status: action.status
    };
    showAddForm = true;
  }

  async function handleDelete() {
    if (deleteConfirmAction) {
      await issuesStore.deleteAction(deleteConfirmAction.id);
      deleteConfirmAction = null;
    }
  }

  function getStatusBadgeVariant(status) {
    return {
      'pending': 'secondary',
      'in-progress': 'warning',
      'completed': 'success'
    }[status] || 'secondary';
  }
</script>

<div class="bg-slate-700/30 rounded-lg p-4 border border-amber-500/30">
  <!-- Section Header -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center space-x-2">
      <Icon name="clipboard" size={5} className="text-amber-400" />
      <h4 class="text-lg font-semibold text-white">Actions</h4>
      <Badge variant="warning" size="small">{actions.length}</Badge>
    </div>

    <!-- Add Action Button - hides for read-only users -->
    <ProtectedButton
      action="modify"
      variant="amber"
      size="small"
      icon="plus"
      on:click={() => showAddForm = true}
    >
      Add Action
    </ProtectedButton>
  </div>

  <!-- Filter Buttons -->
  {#if actions.length > 0}
    <div class="flex space-x-2 mb-4">
      <button
        on:click={() => statusFilter = 'all'}
        class={`px-3 py-1 rounded text-sm ${
          statusFilter === 'all'
            ? 'bg-amber-600 text-white'
            : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
        }`}
      >
        All ({actions.length})
      </button>
      <button
        on:click={() => statusFilter = 'pending'}
        class={`px-3 py-1 rounded text-sm ${
          statusFilter === 'pending'
            ? 'bg-amber-600 text-white'
            : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
        }`}
      >
        Pending ({pendingCount})
      </button>
      <button
        on:click={() => statusFilter = 'in-progress'}
        class={`px-3 py-1 rounded text-sm ${
          statusFilter === 'in-progress'
            ? 'bg-amber-600 text-white'
            : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
        }`}
      >
        In Progress ({inProgressCount})
      </button>
      <button
        on:click={() => statusFilter = 'completed'}
        class={`px-3 py-1 rounded text-sm ${
          statusFilter === 'completed'
            ? 'bg-amber-600 text-white'
            : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
        }`}
      >
        Completed ({completedCount})
      </button>
    </div>
  {/if}

  <!-- Add/Edit Form -->
  {#if showAddForm}
    <div class="mb-4 p-4 bg-slate-800 rounded-lg border border-amber-500/50">
      <h5 class="text-sm font-semibold text-white mb-3">
        {editingActionId ? 'Edit Action' : 'New Action'}
      </h5>

      <div class="space-y-3">
        <FormTextarea
          label="Action Description"
          bind:value={formData.action_text}
          placeholder="Describe the action to be taken..."
          rows={2}
          required={true}
          error={formErrors.action_text}
          on:input={() => formErrors.action_text = ''}
        />

        <FormInput
          label="Assigned To"
          type="text"
          bind:value={formData.name_text}
          placeholder="Person responsible"
          required={true}
          error={formErrors.name_text}
          on:input={() => formErrors.name_text = ''}
        />

        <div class="grid grid-cols-2 gap-3">
          <FormInput
            label="Deadline"
            type="date"
            bind:value={formData.date_deadline}
            placeholder="Optional deadline"
          />

          <FormSelect
            label="Status"
            bind:value={formData.status}
            options={statusOptions}
          />
        </div>

        <div class="flex space-x-2">
          <ProtectedButton
            action="modify"
            variant="amber"
            size="small"
            on:click={handleSave}
          >
            {editingActionId ? 'Update' : 'Save'} Action
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

  <!-- Actions List -->
  {#if filteredActions.length === 0}
    <div class="text-center py-6 text-gray-400">
      <Icon name="clipboard" size={12} className="text-gray-600 mx-auto mb-2" />
      <p class="text-sm">
        {statusFilter === 'all' ? 'No actions yet' : `No ${statusFilter} actions`}
      </p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each filteredActions as action (action.id)}
        {@const overdue = isOverdue(action.date_deadline) && action.status !== 'completed'}
        <div class="bg-slate-800 rounded p-3 border {overdue ? 'border-red-500/50' : 'border-amber-400/30'}">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1 min-w-0 mr-3">
              <p class="text-white mb-1">{action.action_text}</p>
              <div class="flex items-center space-x-3 text-sm text-gray-400">
                <div class="flex items-center space-x-1">
                  <Icon name="user" size={3} />
                  <span>{action.name_text}</span>
                </div>
                {#if action.date_deadline}
                  <div class="flex items-center space-x-1 {overdue ? 'text-red-400' : ''}">
                    <Icon name="calendar" size={3} />
                    <span>{formatDate(action.date_deadline)}</span>
                    {#if overdue}
                      <span class="font-semibold">(Overdue)</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <Badge variant={getStatusBadgeVariant(action.status)} size="small">
              {action.status}
            </Badge>
          </div>

          <!-- Action Buttons - all hide for read-only users -->
          <div class="flex space-x-2">
            <ProtectedButton
              action="modify"
              variant="secondary"
              size="small"
              icon="edit"
              on:click={() => startEdit(action)}
            >
              Edit
            </ProtectedButton>

            <ProtectedButton
              action="modify"
              variant="danger"
              size="small"
              icon="delete"
              on:click={() => deleteConfirmAction = action}
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
  bind:show={deleteConfirmAction}
  title="Delete Action"
  message="Are you sure you want to delete this action? This cannot be undone."
  confirmText="Delete"
  confirmVariant="danger"
  on:confirm={handleDelete}
/>
