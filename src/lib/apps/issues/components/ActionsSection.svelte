<!-- src/lib/apps/issues/components/ActionsSection.svelte -->
<script>
  import { issuesStore } from '../stores/issuesStore';
  import { formatDate, formatDateTime, isOverdue, wasModified } from '$lib/utils/dates';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS, UI_COLORS } from '$lib/utils/constants';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import ActionForm      from './ActionForm.svelte';
  import { onMount }    from 'svelte';
  import { api }        from '$lib/utils/api';
  import { getLogger }  from '$lib/utils/logger';
  import { sortActions } from '$lib/utils/actionSort';

  const logger = getLogger('ActionsSection');

  export let issueId;
  export let actions  = [];
  // Passed in by IssueCard so we can resolve the source comment for any
  // action that was created via "Create Action from Comment".
  export let comments = [];

  // Map for fast source-comment lookup keyed by comment.id.
  $: commentById = Object.fromEntries((comments || []).map(c => [c.id, c]));

  // Set of action.ids whose source-comment block is expanded.
  let expandedSources = new Set();
  function toggleSource(actionId) {
    if (expandedSources.has(actionId)) expandedSources.delete(actionId);
    else                                expandedSources.add(actionId);
    expandedSources = expandedSources;
  }

  let showAddModal = false;
  let editingAction = null;
  let showDeleteConfirm = false;
  let pendingDeleteId = null;
  let showAllActions = false;
  let profiles = [];
  let mutationError = '';
  let saving = false;

  // Sort state — default: smart sort (Status → Deadline → Created)
  let sortField = 'smart';   // 'smart' | 'deadline' | 'updated_at' | 'created_at'
  let sortDir   = 'asc';     // 'asc' | 'desc' — for 'smart' this is ignored

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

  // Create assignee options: blank + all profiles + "External"
  $: assigneeOptions = [
    { value: '', label: '' },
    ...profiles.map(p => ({ value: p.full_name, label: p.full_name })),
    { value: 'External', label: 'External' }
  ];

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
      <Icon name="clipboard" size={5} className="text-{UI_COLORS.ACTION_TEXT}" />
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
                </p>

                <!-- Source comment, when this action was created via the
                     "Create Action from Comment" flow. The source comment
                     may have been deleted (FK ON DELETE SET NULL) — in
                     that case source_comment_id is null and this block
                     doesn't render at all. If the id is still set but
                     the comment isn't in the loaded list (filtered out
                     etc.), we show a generic "linked to a comment" line. -->
                {#if action.source_comment_id}
                  {@const src = commentById[action.source_comment_id]}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <div
                    class="mt-2 px-2 py-1.5 rounded bg-blue-900/15 border-l-2 border-blue-400/60 text-xs cursor-pointer hover:bg-blue-900/25 transition-colors"
                    on:click={() => toggleSource(action.id)}
                    title="Click to {expandedSources.has(action.id) ? 'collapse' : 'expand'} source comment"
                  >
                    <p class="text-blue-300/80 font-medium flex items-center gap-1.5">
                      <span>💬 From comment</span>
                      {#if src?.created_at}
                        <span class="text-gray-500 font-normal">— {formatDate(src.created_at)}</span>
                      {/if}
                      {#if src?.historic}
                        <span class="text-amber-400/80 font-normal">• historic</span>
                      {/if}
                      <span class="ml-auto text-gray-500 text-[10px]">
                        {expandedSources.has(action.id) ? '▾' : '▸'}
                      </span>
                    </p>
                    {#if src}
                      <p
                        class="text-gray-300 mt-1 whitespace-pre-wrap"
                        class:line-clamp-2={!expandedSources.has(action.id)}
                      >{src.comment_text}</p>
                    {:else}
                      <p class="text-gray-500 italic mt-1">Source comment is no longer available.</p>
                    {/if}
                  </div>
                {/if}
              </div>
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
<ActionForm
  show={showAddModal}
  {assigneeOptions}
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
