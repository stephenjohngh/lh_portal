<!-- src/lib/components/issues/ActionsSection.svelte -->
<script>
  import { issuesStore } from './issuesStore';

  export let issueId;
  export let actions = [];

  let showAddModal = false;
  let editingAction = null;
  let newAction = { 
    action_text: '', 
    name_text: '', 
    date_deadline: '', 
    status: 'pending' 
  };

  // Sort actions: non-completed first by date, then completed by date
  $: sortedActions = [...actions].sort((a, b) => {
    const aCompleted = a.status === 'completed';
    const bCompleted = b.status === 'completed';
    
    // If one is completed and the other isn't, non-completed comes first
    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }
    
    // Both have same completion status, sort by date (earlier first)
    const aDate = new Date(a.date_added);
    const bDate = new Date(b.date_added);
    return aDate - bDate;
  });

  async function addAction() {
    if (!newAction.action_text.trim()) return;
    await issuesStore.addAction(issueId, newAction);
    newAction = { action_text: '', name_text: '', date_deadline: '', status: 'pending' };
    showAddModal = false;
  }

  async function updateAction() {
    if (!editingAction) return;
    await issuesStore.updateAction(editingAction.id, editingAction);
    editingAction = null;
  }

  async function deleteAction(actionId) {
    if (!confirm('Delete this action?')) return;
    await issuesStore.deleteAction(actionId);
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function isOverdue(deadlineString) {
    if (!deadlineString) return false;
    const deadline = new Date(deadlineString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);
    return deadline < today;
  }
</script>

<div class="bg-slate-800/30 rounded-lg p-4">
  <div class="flex justify-between items-center mb-3">
    <h4 class="font-semibold flex items-center space-x-2">
      <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
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
        <div class="bg-slate-700/50 rounded p-3 border-l-2 border-green-400 {action.status === 'completed' ? 'opacity-60' : ''}">
          {#if editingAction?.id === action.id}
            <div class="space-y-3">
              <div>
                <label for="edit-action-text" class="block text-sm font-medium mb-1 text-gray-300">
                  Action Description
                </label>
                <input
                  id="edit-action-text"
                  type="text"
                  bind:value={editingAction.action_text}
                  class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                  placeholder="Action description"
                />
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
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="completed">Completed</option>
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
                <p class="text-gray-200 font-medium {action.status === 'completed' ? 'line-through' : ''}">
                  {action.action_text}
                </p>
                <div class="flex flex-wrap gap-2 mt-2 text-xs">
                  {#if action.name_text}
                    <span class="px-2 py-1 bg-blue-600/20 text-blue-300 rounded">
                      👤 {action.name_text}
                    </span>
                  {/if}
                  {#if action.date_deadline}
                    <span class="px-2 py-1 rounded {isOverdue(action.date_deadline) && action.status !== 'completed' ? 'bg-red-600 text-white font-semibold' : 'bg-orange-600/20 text-orange-300'}">
                      📅 Due: {formatDate(action.date_deadline)}
                      {#if isOverdue(action.date_deadline) && action.status !== 'completed'}
                        ⚠️
                      {/if}
                    </span>
                  {/if}
                  <span class="px-2 py-1 bg-purple-600/20 text-purple-300 rounded capitalize">
                    {action.status}
                  </span>
                </div>
                <p class="text-xs text-gray-500 mt-1">Added: {formatDate(action.date_added)}</p>
              </div>
              <div class="flex space-x-1">
                <button
                  on:click={() => editingAction = {...action}}
                  class="p-1 hover:bg-slate-600 rounded"
                  title="Edit action"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button
                  on:click={() => deleteAction(action.id)}
                  class="p-1 hover:bg-red-600/20 rounded text-red-400"
                  title="Delete action"
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
          <input
            id="action-text"
            type="text"
            bind:value={newAction.action_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="What needs to be done?"
          />
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
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
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
