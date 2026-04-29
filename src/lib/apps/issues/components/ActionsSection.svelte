<!-- src/lib/apps/issues/components/ActionsSection.svelte -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { issuesStore } from '../stores/issuesStore';
  import { profilesStore } from '$lib/stores/profiles';
  import { fmtDate, fmtDateTime, isOverdue, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS } from '$lib/utils/constants';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import ActionForm     from './ActionForm.svelte';
  import { sortActions } from '$lib/utils/actionSort';

  export let issueId;
  export let actions  = [];

  const dispatch = createEventDispatcher();

  let showAddModal = false;
  let editingAction = null;
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showAllActions = false;
  let mutationError = '';
  let saving = false;

  // Sort state — default: smart sort (Status → Deadline → Created)
  let sortField = 'smart';   // 'smart' | 'deadline' | 'updated_at' | 'created_at'
  let sortDir   = 'asc';     // 'asc' | 'desc' — for 'smart' this is ignored

  // Profile-backed assignee options. profilesStore.load() is idempotent
  // and shared across components, so calling here is cheap.
  onMount(() => profilesStore.load());
  const assigneeOptionsStore = profilesStore.assigneeOptions();

  // Sorting: 'smart' uses the utility (Status → Deadline → Created).
  // Other fields use a simple comparator that respects sortDir.
  // Nulls always sort to the bottom regardless of direction.
  $: sortedActions = (() => {
    if (sortField === 'smart') return sortActions(actions);

    const dir = sortDir === 'desc' ? -1 : 1;
    const getVal = (a) => {
      if (sortField === 'deadline')   return a.date_deadline ? new Date(a.date_deadline).getTime() : null;
      if (sortField === 'updated_at') return new Date(a.updated_at || a.created_at).getTime();
      if (sortField === 'created_at') return new Date(a.created_at).getTime();
      return null;
    };

    return [...actions].sort((a, b) => {
      const aVal = getVal(a);
      const bVal = getVal(b);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;        // nulls last
      if (bVal === null) return -1;
      return (aVal - bVal) * dir;
    });
  })();

  // Count completed actions (computed once)
  $: completedCount = actions.filter(a => a.status === ACTION_STATUS.COMPLETED).length;

  // Filter actions based on completed status
  $: visibleActions = showAllActions
    ? sortedActions
    : sortedActions.filter(a => a.status !== ACTION_STATUS.COMPLETED);

  function toggleSortDir() {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  }

  async function addAction({ detail }) {
    saving = true;
    mutationError = '';
    const result = await issuesStore.addAction(issueId, detail);
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to add action'; return; }
    showAddModal = false;
  }

  async function updateAction() {
    if (!editingAction) return;
    saving = true;
    mutationError = '';
    const result = await issuesStore.updateAction(editingAction.id, editingAction);
    saving = false;
    if (!result.success) { mutationError = result.error ?? 'Failed to update action'; return; }
    editingAction = null;
  }

  function confirmDeleteAction(actionId) {
    mutationError = '';
    pendingDeleteId = actionId;
    showDeleteConfirm = true;
  }

  async function handleDeleteConfirm() {
    const result = await issuesStore.deleteAction(pendingDeleteId);
    if (!result.success) { mutationError = result.error ?? 'Failed to delete action'; }
    showDeleteConfirm = false;
    pendingDeleteId = null;
  }

  function handleDeleteCancel() {
    showDeleteConfirm = false;
    pendingDeleteId = null;
  }
</script>

<div class="bg-slate-800/30 rounded-lg p-3">
  <div class="flex justify-between items-center mb-2 flex-wrap gap-2">
    <h4 class="font-semibold flex items-center space-x-2">
      <Icon name="clipboard" size={5} className="text-amber-400" />
      <span>Actions ({visibleActions.length})</span>
      {#if actions.length !== visibleActions.length}
        <span class="text-xs text-gray-400">({actions.length - visibleActions.length} completed)</span>
      {/if}
    </h4>
    <div class="flex items-center gap-2 flex-wrap">
      {#if completedCount > 0}
        <Button
          variant="secondary"
          size="small"
          on:click={() => showAllActions = !showAllActions}
        >
          {showAllActions ? 'Hide' : 'Include'} Completed
        </Button>
      {/if}

      <!-- Sort controls -->
      <div class="flex items-center gap-1">
        <select
          bind:value={sortField}
          class="text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
          title="Sort actions by…"
        >
          <option value="smart">Smart</option>
          <option value="deadline">Deadline</option>
          <option value="updated_at">Modified</option>
          <option value="created_at">Created</option>
        </select>
        <button
          on:click={toggleSortDir}
          disabled={sortField === 'smart'}
          class="text-xs px-2 py-1 bg-slate-700 border border-slate-600 rounded text-gray-300 hover:bg-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 leading-none disabled:opacity-40 disabled:cursor-not-allowed"
          title={sortField === 'smart'
            ? 'Smart sort uses a fixed order (status → deadline → created)'
            : (sortDir === 'desc' ? 'Newest first — click for oldest first' : 'Oldest first — click for newest first')}
        >
          {sortDir === 'desc' ? '↓' : '↑'}
        </button>
      </div>

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
  
  {#if mutationError}
    <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-2">{mutationError}</p>
  {/if}

  {#if visibleActions.length > 0}
    <div class="space-y-1">
      {#each visibleActions as action}
        <div
          id={`action-${action.id}`}
          class="bg-slate-700/50 rounded p-2 border-l-2 border-amber-400 {action.status === ACTION_STATUS.COMPLETED ? 'opacity-60' : ''}"
        >
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
                    {#each $assigneeOptionsStore as option}
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
              <div class="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  on:click={() => editingAction = null}
                >
                  Cancel
                </Button>
                <ProtectedButton
                  action="modify"
                  variant="amber"
                  size="small"
                  icon="edit"
                  disabled={saving}
                  on:click={updateAction}
                >
                  {saving ? 'Saving…' : 'Update'}
                </ProtectedButton>
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
                      📅 Due: {fmtDate(action.date_deadline)}
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
                  Added: {fmtDateTime(action.created_at, action.created_by_profile?.full_name)}
                  {#if wasModified(action.created_at, action.updated_at)}
                    • Modified: {fmtDateTime(action.updated_at, action.updated_by_profile?.full_name)}
                  {/if}
                </p>

              </div>
              <div class="flex space-x-1">
                {#if action.source_comment_id}
                  <Button
                    variant="secondary"
                    size="small"
                    icon="comment"
                    iconPosition="only"
                    on:click={() => dispatch('jumpToComment', { commentId: action.source_comment_id })}
                    title="Jump to source comment"
                  />
                {/if}
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
<ActionForm
  show={showAddModal}
  assigneeOptions={$assigneeOptionsStore}
  {saving}
  on:submit={addAction}
  on:cancel={() => { showAddModal = false; mutationError = ''; }}
/>

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
