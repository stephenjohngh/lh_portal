<!-- src/lib/apps/issues/components/ActionsSection.svelte -->
<!-- ✨ REFACTORED: Now uses Modal, FormInput, FormTextarea, FormSelect, and validation -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDate, formatDateTime, isOverdue } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS } from '$lib/utils/constants';
  import { isRequired } from '$lib/utils/validation';
  import Icon from '$lib/components/icons/Icon.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  // ✨ NEW: Import form components
  import Modal from '$lib/components/common/Modal.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';

  export let issueId;
  export let actions = [];

  let showAddModal = false;
  let editingAction = null;
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showAllActions = false;
  let profiles = [];
  
  let newAction = { 
    action_text: '', 
    name_text: '', 
    date_deadline: '', 
    status: ACTION_STATUS.PENDING
  };

  // ✨ NEW: Validation errors
  let errors = {
    action_text: ''
  };

  // Fetch all profiles on mount
  onMount(async () => {
    await loadProfiles();
  });

  async function loadProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .order('full_name');
    
    if (error) {
      console.error('Error loading profiles:', error);
      profiles = [];
    } else {
      profiles = data || [];
    }
  }

  // Create assignee options: all profiles + "External"
  $: assigneeOptions = [
    { value: '', label: '-- Select assignee --' },
    ...profiles.map(p => ({ value: p.full_name, label: p.full_name })),
    { value: 'External', label: 'External' }
  ];

  // Sort actions: non-completed first by date, then completed by date
  $: sortedActions = [...actions].sort((a, b) => {
    const aCompleted = a.status === ACTION_STATUS.COMPLETED;
    const bCompleted = b.status === ACTION_STATUS.COMPLETED;
    
    if (aCompleted !== bCompleted) {
      return aCompleted ? 1 : -1;
    }
    
    const aDate = new Date(a.created_at);
    const bDate = new Date(b.created_at);
    return aDate - bDate;
  });

  // Filter actions based on completed status
  $: visibleActions = showAllActions
    ? sortedActions
    : sortedActions.filter(a => a.status !== ACTION_STATUS.COMPLETED);

  async function addAction() {
    // ✨ NEW: Validation
    errors = { action_text: '' };
    
    if (!isRequired(newAction.action_text)) {
      errors.action_text = 'Action description is required';
      return;
    }
    
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
    
    // ✨ NEW: Validation for edit
    if (!isRequired(editingAction.action_text)) {
      return;
    }
    
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
      <Icon name="clipboard" size={5} className="text-green-400" />
      <span>Actions ({visibleActions.length})</span>
      {#if actions.length !== visibleActions.length}
        <span class="text-xs text-gray-400">({actions.length - visibleActions.length} completed)</span>
      {/if}
    </h4>
    <div class="flex items-center space-x-3">
      <label class="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showAllActions}
          class="w-4 h-4 rounded border-gray-600 bg-slate-700 text-green-600 focus:ring-green-500"
        />
        <span>Show all</span>
      </label>
      <button
        on:click={() => showAddModal = true}
        class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
      >
        Add Action
      </button>
    </div>
  </div>
  
  {#if visibleActions.length > 0}
    <div class="space-y-1">
      {#each visibleActions as action}
        <div class="bg-slate-700/50 rounded p-2 border-l-2 border-green-400 {action.status === ACTION_STATUS.COMPLETED ? 'opacity-60' : ''}">
          {#if editingAction?.id === action.id}
            <!-- ✨ REFACTORED: Inline edit form now uses form components -->
            <div class="space-y-3">
              <FormTextarea
                label="Action Description"
                bind:value={editingAction.action_text}
                rows={3}
                required={true}
                placeholder="Action description"
              />
              
              <FormSelect
                label="Assigned To"
                bind:value={editingAction.name_text}
                options={assigneeOptions}
              />
              
              <FormInput
                label="Deadline"
                type="date"
                bind:value={editingAction.date_deadline}
              />
              
              <FormSelect
                label="Status"
                bind:value={editingAction.status}
                options={ACTION_STATUS_OPTIONS}
              />
              
              <div class="flex space-x-2">
                <button
                  on:click={updateAction}
                  class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                >
                  Save
                </button>
                <button
                  on:click={() => editingAction = null}
                  class="px-3 py-1 bg-slate-600 hover:bg-slate-700 rounded text-sm"
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
                <div class="flex flex-wrap gap-2 mt-1 text-xs">
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
                  Added: {formatDateTime(action.created_at, action.created_by_profile?.full_name)}
                  {#if action.updated_at && new Date(action.updated_at).getTime() !== new Date(action.created_at).getTime()}
                    • Modified: {formatDateTime(action.updated_at, action.updated_by_profile?.full_name)}
                  {/if}
                </p>
              </div>
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

<!-- ✨ REFACTORED: Add Action Modal using Modal component -->
<Modal 
  bind:show={showAddModal} 
  title="New Action"
  size="medium"
  on:close={() => {
    showAddModal = false;
    errors = { action_text: '' };
  }}
>
  <div class="space-y-4">
    <FormTextarea
      label="Action Description"
      bind:value={newAction.action_text}
      required={true}
      error={errors.action_text}
      rows={3}
      placeholder="What needs to be done?"
    />
    
    <FormSelect
      label="Assigned To"
      bind:value={newAction.name_text}
      options={assigneeOptions}
      helpText="Select who will handle this action"
    />
    
    <FormInput
      label="Deadline"
      type="date"
      bind:value={newAction.date_deadline}
      helpText="Optional deadline for completion"
    />
    
    <FormSelect
      label="Status"
      bind:value={newAction.status}
      options={ACTION_STATUS_OPTIONS}
    />
  </div>
  
  <div slot="footer" class="flex justify-end space-x-2">
    <button
      on:click={() => showAddModal = false}
      class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
    >
      Cancel
    </button>
    <button
      on:click={addAction}
      class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
    >
      Add Action
    </button>
  </div>
</Modal>

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
