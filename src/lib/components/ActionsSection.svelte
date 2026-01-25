<!-- src/lib/components/issues/ActionsSection.svelte -->
<script>
  import { issuesStore } from './issuesStore';
  import { formatDate, isOverdue } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS } from '$lib/utils/constants';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let issueId;
  export let actions = [];

  let showAddModal = false;
  let editingAction = null;
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let newAction = { 
    action_text: '', 
    name_text: '', 
    date_deadline: '', 
    status: ACTION_STATUS.PENDING
  };

  // Sort actions: non-completed first by date, then completed by date
  $: sortedActions = [...actions].sort((a, b) => {
    const aCompleted = a.status === ACTION_STATUS.COMPLETED;
    const bCompleted = b.status === ACTION_STATUS.COMPLETED;
    
    // If one is completed and the other isn't, non-completed comes first
    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }
    
    // Both have same completion status, sort by date (earlier first)
    const aDate = new Date(a.created_at);
    const bDate = new Date(b.created_at);
    return aDate - bDate;
  });

  async function addAction() {
    if (!newAction.action_text.trim()) return;
    await issuesStore.addAction(issueId, newAction);
    newAction = { 
      action_text: '', 
      name_text: '', 
      date_deadline: '', 
      status: ACTION_STATUS.PENDING
    };
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

<div class="bg-slate-800/30 rounded-lg p-4">
  <div class="flex justify-between items-center mb-3">
    <h4 class="font-semibold flex items-center space-x-2">
      <Icon name="clipboard" size={5} className="text-green-400" />
      <span>Actions</span>
    </h4>
    <button
      on:click={() => showAddModal = true}
      class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
    >
      Add Action
    </button>
  </div>
  
  {#if sortedActions.length > 0}
    <div class="space-y-2">
      {#each sortedActions as action}
        <div class="bg-slate-700/50 rounded p-3 border-l-2 border-green-400 {action.status === ACTION_STATUS.COMPLETED ? 'opacity-60' : ''}">
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
              <div>
                <label for="edit-action-assignee" class="block text-sm font-medium mb-1 text-gray-300">
                  Assigned To
                </label>
                <input
                  id="edit-action-assignee"
                  type="text"
                  bind:value={editingAction.name_text}
                  class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  placeholder="Assigned to"
                />
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
              <div class="flex space-x-2">
                <button
                  on:click={updateAction}
                  class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                >
                  Save
                </button>
                <button
                  on:click={() => editingAction = null}
                  class="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          {:else}
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <p class="text-gray-200 font-medium whitespace-pre-wrap {action.status === ACTION_STATUS.COMPLETED ? 'line-through' : ''}">
                  {action.action_text}
                </p>
                <div class="flex flex-wrap gap-2 mt-2 text-xs">
                  {#if action.name_text}
                    <span class="px-2 py-1 bg-blue-600/20 text-blue-300 rounded">
                      👤 {action.name_text}
                    </span>
                  {/if}
                  {#if action.date_deadline}
                    <span class="px-2 py-1 rounded {isOverdue(action.date_deadline) && action.status !== ACTION_STATUS.COMPLETED ? 'bg-red-600 text-white font-semibold' : 'bg-orange-600/20 text-orange-300'}">
                      📅 Due: {formatDate(action.date_deadline)}
                      {#if isOverdue(action.date_deadline) && action.status !== ACTION_STATUS.COMPLETED}
                        ⚠️
                      {/if}
                    </span>
                  {/if}
                  <span class="px-2 py-1 bg-purple-600/20 text-purple-300 rounded capitalize">
                    {action.status}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1">
                  Added: {formatDate(action.created_at)}
                  {#if action.updated_at && action.updated_at !== action.created_at}
                    • Modified: {formatDate(action.updated_at)}
                  {/if}
                </p>              </div>
              <div class="flex space-x-1">
                <button
                  on:click={() => editingAction = {...action}}
                  class="p-1 hover:bg-slate-600 rounded"
                  title="Edit action"
                >
                  <Icon name="edit" size={4} />
                </button>
                <button
                  on:click={() => confirmDeleteAction(action.id)}
                  class="p-1 hover:bg-red-600/20 rounded text-red-400"
                  title="Delete action"
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
          <input
            id="action-assignee"
            type="text"
            bind:value={newAction.name_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="Person or team name"
          />
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
          <button
            on:click={() => showAddModal = false}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            on:click={addAction}
            class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
          >
            Add Action
          </button>
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
