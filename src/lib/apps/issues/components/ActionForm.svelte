<!-- src/lib/apps/issues/components/ActionForm.svelte -->
<!-- Add-action modal. No store calls — dispatches 'submit' with action data
     so ActionsSection can handle the mutation and own saving/error state. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS } from '$lib/utils/constants';
  import Button          from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';

  export let show              = false;
  export let assigneeOptions   = [];   // [{ value, label }]
  export let saving            = false;
  // Optional prefill — used when the form is opened from a suggestion
  // (e.g. the "Create Action from Comment" flow). Defaults to '' so
  // existing call sites that just pass `show` keep their previous behaviour.
  export let initialActionText = '';

  const dispatch = createEventDispatcher();

  let action_text    = '';
  let name_text      = '';
  let date_deadline  = '';
  let status         = ACTION_STATUS.PENDING;

  // Reset form whenever the modal opens. Seed action_text from the
  // initialActionText prop (empty string by default).
  $: if (show) { action_text = initialActionText; name_text = ''; date_deadline = ''; status = ACTION_STATUS.PENDING; }

  function handleSubmit() {
    if (!action_text.trim()) return;
    dispatch('submit', { action_text, name_text, date_deadline, status });
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">New Action</h3>
      <div class="space-y-4">
        <div>
          <label for="action-text" class="block text-sm font-medium mb-2">Action Description *</label>
          <textarea
            id="action-text"
            bind:value={action_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="What needs to be done?"
            rows="3"
          ></textarea>
        </div>
        <div>
          <label for="action-assignee" class="block text-sm font-medium mb-2">Assigned To</label>
          <select
            id="action-assignee"
            bind:value={name_text}
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
            bind:value={date_deadline}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          />
        </div>
        <div>
          <label for="action-status" class="block text-sm font-medium mb-2">Status</label>
          <select
            id="action-status"
            bind:value={status}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          >
            {#each ACTION_STATUS_OPTIONS as statusOption}
              <option value={statusOption.value}>{statusOption.label}</option>
            {/each}
          </select>
        </div>
        <div class="flex space-x-2 justify-end">
          <Button variant="secondary" size="large" on:click={handleCancel}>
            Cancel
          </Button>
          <ProtectedButton
            action="modify"
            variant="amber"
            size="large"
            icon="plus"
            disabled={saving || !action_text.trim()}
            on:click={handleSubmit}
          >
            {saving ? 'Saving…' : 'Add Action'}
          </ProtectedButton>
        </div>
      </div>
    </div>
  </div>
{/if}
