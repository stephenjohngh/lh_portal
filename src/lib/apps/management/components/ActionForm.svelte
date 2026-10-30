<!-- src/lib/apps/management/components/ActionForm.svelte -->
<!-- Add / edit action modal. No store calls — dispatches 'submit' (add) or
     'update' (edit) so ActionsSection can handle the mutation and own the
     saving/error state. Editing keeps the dialog open after Update so work can
     be saved and carried on; Close shuts it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { ACTION_STATUS, ACTION_STATUS_OPTIONS } from '#lib/utils/constants.js';
  import { permissions } from '#lib/stores/permissions';
  import { toDateTimeLocal } from '#lib/utils/dates.js';
  import Button          from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';

  export let show              = false;
  export let assigneeOptions   = [];   // [{ value, label }]
  export let saving            = false;
  /** null = add a new action; an action row = edit it. */
  export let action            = null;
  /** Shown inside the dialog, e.g. a failed save. */
  export let error             = '';
  // Optional prefill — used when the form is opened from a suggestion
  // (e.g. the "Create Action from Comment" flow). Defaults to '' so
  // existing call sites that just pass `show` keep their previous behaviour.
  export let initialActionText = '';

  const dispatch = createEventDispatcher();

  let action_text         = '';
  let name_text           = '';
  let date_deadline       = '';
  let status              = ACTION_STATUS.PENDING;
  let override_created_at = '';
  let override_updated_at = '';

  // Reset the fields when the dialog opens, or opens on a different action —
  // keyed on a primitive, so a store refresh after a save never wipes what is
  // being typed.
  $: openKey = show ? (action?.id ?? 'new') : null;
  let lastKey = null;
  $: if (openKey !== lastKey) {
    lastKey = openKey;
    if (openKey !== null) {
      if (action) {
        action_text         = action.action_text ?? '';
        name_text           = action.name_text ?? '';
        date_deadline       = action.date_deadline ?? '';
        status              = action.status ?? ACTION_STATUS.PENDING;
        override_created_at = toDateTimeLocal(action.created_at);
        override_updated_at = toDateTimeLocal(action.updated_at);
      } else {
        action_text = initialActionText; name_text = ''; date_deadline = '';
        status = ACTION_STATUS.PENDING; override_created_at = ''; override_updated_at = '';
      }
    }
  }

  function handleSubmit() {
    if (!action_text.trim()) return;
    if (action) {
      dispatch('update', {
        ...action, action_text, name_text, date_deadline, status,
        override_created_at, override_updated_at
      });
    } else {
      dispatch('submit', { action_text, name_text, date_deadline, status });
    }
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700 max-h-[90vh] overflow-y-auto">
      <h3 class="text-xl font-bold mb-4">{action ? 'Edit Action' : 'New Action'}</h3>
      {#if error}
        <p class="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-3">{error}</p>
      {/if}
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
        {#if action && $permissions.isAdmin}
          <div class="border-t border-slate-600 pt-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="action-admin-created" class="block text-xs admin-only-label mb-1">Created</label>
                <input id="action-admin-created" type="datetime-local" bind:value={override_created_at}
                       class="admin-only w-full px-2 py-1 text-xs rounded" />
              </div>
              <div>
                <label for="action-admin-updated" class="block text-xs admin-only-label mb-1">Modified</label>
                <input id="action-admin-updated" type="datetime-local" bind:value={override_updated_at}
                       class="admin-only w-full px-2 py-1 text-xs rounded" />
              </div>
            </div>
          </div>
        {/if}
        <div class="flex space-x-2 justify-end">
          <Button variant="secondary" size="large" on:click={handleCancel}>
            {action ? 'Close' : 'Cancel'}
          </Button>
          <ProtectedButton
            action="modify"
            variant="amber"
            size="large"
            icon={action ? 'edit' : 'plus'}
            disabled={saving || !action_text.trim()}
            on:click={handleSubmit}
          >
            {saving ? 'Saving…' : (action ? 'Update' : 'Add Action')}
          </ProtectedButton>
        </div>
      </div>
    </div>
  </div>
{/if}
