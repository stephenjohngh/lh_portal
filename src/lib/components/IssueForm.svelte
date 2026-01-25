<!-- src/lib/components/issues/IssueForm.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { PRIORITIES } from '$lib/utils/priorities';
  import { ISSUE_STATUS, ISSUE_STATUS_OPTIONS } from '$lib/utils/constants';

  export let show = false;
  export let issue = null; // null for new, object for edit
  
  const dispatch = createEventDispatcher();
  
  let formData = {
    name: issue?.name || '',
    description: issue?.description || '',
    priority: issue?.priority || 3,
    status: issue?.status || ISSUE_STATUS.CURRENT
  };

  $: if (issue) {
    formData = {
      name: issue.name,
      description: issue.description,
      priority: parseInt(issue.priority) || 3,
      status: issue.status || ISSUE_STATUS.CURRENT
    };
  }

  function handleSubmit() {
    if (!formData.name.trim()) return;
    dispatch('submit', formData);
    close();
  }

  function close() {
    dispatch('close');
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">
        {issue ? 'Edit Issue' : 'New Issue'}
      </h3>
      
      <div class="space-y-4">
        <div>
          <label for="issue-name" class="block text-sm font-medium mb-2">Name *</label>
          <input
            id="issue-name"
            type="text"
            bind:value={formData.name}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="Issue name"
          />
        </div>
        
        <div>
          <label for="issue-description" class="block text-sm font-medium mb-2">Description</label>
          <textarea
            id="issue-description"
            bind:value={formData.description}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            rows="4"
            placeholder="Issue description"
          ></textarea>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="issue-priority" class="block text-sm font-medium mb-2">Priority *</label>
            <select
              id="issue-priority"
              bind:value={formData.priority}
              class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              {#each PRIORITIES as priority}
                <option value={priority.value}>
                  {priority.value} - {priority.label}
                </option>
              {/each}
            </select>
          </div>
          
          <div>
            <label for="issue-status" class="block text-sm font-medium mb-2">Status *</label>
            <select
              id="issue-status"
              bind:value={formData.status}
              class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            >
              {#each ISSUE_STATUS_OPTIONS as statusOption}
                <option value={statusOption.value}>{statusOption.label}</option>
              {/each}
            </select>
          </div>
        </div>
        
        <div class="flex space-x-2 justify-end">
          <button
            on:click={close}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            on:click={handleSubmit}
            class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
          >
            {issue ? 'Update' : 'Create'} Issue
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
