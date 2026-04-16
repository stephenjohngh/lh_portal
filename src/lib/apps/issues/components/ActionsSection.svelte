<!-- src/lib/apps/issues/components/ActionsSection.svelte -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDate,formatDateTime, isOverdue, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS, UI_COLORS } from '$lib/utils/constants';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { onMount }    from 'svelte';
  import { api }        from '$lib/utils/api';
  import { getLogger }  from '$lib/utils/logger';
  import { sortActions } from '$lib/utils/actionSort'; // ← NEW: Import sorting utility

  const logger = getLogger('ActionsSection');

  export let issueId;
  export let actions = [];

  let showAddModal = false;
  let editingAction = null;
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showAllActions = false; // NEW: Show completed actions toggle
  let profiles = []; // List of all user profiles
  
  let newAction = { 
    action_text: '', 
    name_text: '', 
    date_deadline: '', 
    status: ACTION_STATUS.PENDING
  };

  // Fetch all profiles on mount
  onMount(async () => {
    await loadProfiles();
  });

  async function loadProfiles() {
    try {
      profiles = await api.get('profiles', { select: 'full_name', orderBy: 'full_name' });
    } catch (err) {
      logger('❌ Error loading profiles:', err);
      profiles = [];
    }
  }

  function resetNewAction() {
    newAction = { 
      action_text: '', 
      name_text: '', 
      date_deadline: '', 
      status: ACTION_STATUS.PENDING
    };
  }

  // Create assignee options: blank + all profiles + "External"
  $: assigneeOptions = [
    { value: '', label: '' },
    ...profiles.map(p => ({ value: p.full_name, label: p.full_name })),
    { value: 'External', label: 'External' }
  ];

  // NEW SORTING: Status → Deadline → Created (using utility function)
  $: sortedActions = sortActions(actions);

  // Count completed actions (computed once)
  $: completedCount = actions.filter(a => a.status === ACTION_STATUS.COMPLETED).length;

  // Filter actions based on completed status
  $: visibleActions = showAllActions
    ? sortedActions
    : sortedActions.filter(a => a.status !== ACTION_STATUS.COMPLETED);

  async function addAction() {
    if (!newAction.action_text.trim()) return;
    await issuesStore.addAction(issueId, newAction);
    resetNewAction();
    showAddModal = false;
  }

  async function updateAction() {
    if (!editingAction) return;
    await issuesStore.updateAction(editingAction.id, editingAction);
    editingAction = null;
  }

  function confirmDeleteAction(actionId) {
    pendingDeleteId = actionId;
    showDeleteConfirm = true;
  }

  async function handleDeleteConfirm() {
    await issuesStore.deleteAction(pendingDeleteId);
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
      <Icon name="clipboard" size={5} className="text-{UI_COLORS.ACTION_TEXT}" />
      <span>Actions ({visibleActions.length})</span>
      {#if actions.length !== visibleActions.length}
        <span class="text-xs text-gray-400">({actions.length - visibleActions.length} completed)</span>
      {/if}
    </h4>
    <div class="flex items-center space-x-3">
      {#if completedCount > 0}
        <Button
          variant="secondary"
          size="small"
          on:click={() => showAllActions = !showAllActions}
        >
          {showAllActions ? 'Hide' : 'Include'} Completed
        </Button>
      {/if}
      <ProtectedButton
        action="modify"
        variant="amber"
        size="small"
        icon="clipboard"
        on:click={() => showAddModal = true}
      >
        Add Action
      </ProtectedButton>
    </div>
  </div>
  
  {#if visibleActions.length > 0}
    <div class="space-y-1">
      {#each visibleActions as action}
        <div class="bg-slate-700/50 rounded p-2 border-l-2 border-amber-400 {action.status === ACTION_STATUS.COMPLETED ? 'opacity-60' : ''}">
          {#if editingAction?.id === action.id}
            <div class="space-y-3">
              <div>
                <label for="edit-action-text" class="block text-sm font-medium mb-1 text-gray-300">
                  Action Description
                </label>
                <textarea
                  id="edit-action-text"
                  bind:value={editingAction.action_text}
                  class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  placeholder="Action description"
                  rows="3"
                ></textarea>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label for="edit-action-assignee" class="block text-sm font-medium mb-1 text-gray-300">
                    Assigned To
                  </label>
                  <select
                    id="edit-action-assignee"
                    bind:value={editingAction.name_text}
                    class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  >
                    {#each assigneeOptions as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </div>
                <div>
                  <label for="edit-action-deadline" class="block text-sm font-medium mb-1 text-gray-300">
                    Deadline
                  </label>
                  <input
                    id="edit-action-deadline"
                    type="date"
                    bind:value={editingAction.date_deadline}
                    class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  />
                </div>
                <div>
                  <label for="edit-action-status" class="block text-sm font-medium mb-1 text-gray-300">
                    Status
                  </label>
                  <select
                    id="edit-action-status"
                    bind:value={editingAction.status}
                    class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  >
                    {#each ACTION_STATUS_OPTIONS as statusOption}
                      <option value={statusOption.value}>{statusOption.label}</option>
                    {/each}
                  </select>
                </div>
              </div>
              <div class="flex space-x-2">
                <ProtectedButton
                  action="modify"
                  variant="primary"
                  size="small"
                  on:click={updateAction}
                >
                  Save
                </ProtectedButton>
                <Button
                  variant="secondary"
                  size="small"
                  on:click={() => editingAction = null}
                >
                  Cancel
                </Button>
              </div>
            </div>
          {:else}
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <p class="text-gray-200 font-medium whitespace-pre-wrap {action.status === ACTION_STATUS.COMPLETED ? 'line-through' : ''}">
                  {action.action_text}
                </p>
                <div class="flex flex-wrap gap-2 mt-1 text-xs">
                  {#if action.name_text}
                    <span class="px-2 py-1 bg-blue-600/20 text-blue-300 rounded border border-blue-200">
                      👤 {action.name_text}
                    </span>
                  {/if}
                  {#if action.date_deadline}
                    <span class="px-2 py-1 rounded border {isOverdue(action.date_deadline) && action.status !== ACTION_STATUS.COMPLETED ? 'bg-red-600 text-white font-semibold' : 'bg-orange-600/20 text-orange-300 border-orange-200'}">
                      📅 Due: {formatDate(action.date_deadline)}
                      {#if isOverdue(action.date_deadline) && action.status !== ACTION_STATUS.COMPLETED}
                        ⚠️
                      {/if}
                    </span>
                  {/if}
                  <span class="px-2 py-1 bg-purple-600/20 text-purple-300 rounded border border-purple-200 capitalize">
                    {action.status}
                  </span>

                </div>
                <p class="text-xs text-gray-500 mt-1">
                  Added: {formatDateTime(action.created_at, action.created_by_profile?.full_name)}
                  {#if wasModified(action.created_at, action.updated_at)}
                    • Modified: {formatDateTime(action.updated_at, action.updated_by_profile?.full_name)}
                  {/if}
                </p>              </div>
              <div class="flex space-x-1">
                <ProtectedButton
                  action="modify"
                  variant="secondary"
                  size="small"
                  icon="edit"
                  iconPosition="only"
                  on:click={() => editingAction = {...action}}
                  title="Edit action"
                />
                <ProtectedButton
                  action="modify"
                  variant="danger"
                  size="small"
                  icon="delete"
                  iconPosition="only"
                  on:click={() => confirmDeleteAction(action.id)}
                  title="Delete action"
                />
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-gray-400 text-sm">No actions yet.</p>
  {/if}
</div>

<!-- Add Action Modal -->
{#if showAddModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">New Action</h3>
      <div class="space-y-4">
        <div>
          <label for="action-text" class="block text-sm font-medium mb-2">Action Description *</label>
          <textarea
            id="action-text"
            bind:value={newAction.action_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="What needs to be done?"
            rows="3"
          ></textarea>
        </div>
        <div>
          <label for="action-assignee" class="block text-sm font-medium mb-2">Assigned To</label>
          <select
            id="action-assignee"
            bind:value={newAction.name_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          >
            {#each assigneeOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <label for="action-deadline" class="block text-sm font-medium mb-2">Deadline</label>
          <input
            id="action-deadline"
            type="date"
            bind:value={newAction.date_deadline}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          />
        </div>
        <div>
          <label for="action-status" class="block text-sm font-medium mb-2">Status</label>
          <select
            id="action-status"
            bind:value={newAction.status}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          >
            {#each ACTION_STATUS_OPTIONS as statusOption}
              <option value={statusOption.value}>{statusOption.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex space-x-2 justify-end">
          <Button
            variant="secondary"
            size="large"
            on:click={() => showAddModal = false}
          >
            Cancel
          </Button>
          <ProtectedButton
            action="modify"
            variant="amber"
            size="large"
            on:click={addAction}
          >
            Add Action
          </ProtectedButton>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete Action"
  message="Are you sure you want to delete this action? This cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  on:confirm={handleDeleteConfirm}
  on:cancel={handleDeleteCancel}
/>
