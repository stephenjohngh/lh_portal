<!-- src/lib/apps/issues/components/DecisionItem.svelte -->
<!--
  Single decision row. Mirrors CommentItem but:
    - Violet colour scheme
    - No action-suggestion panel or linked-action button
    - Displays a "Decision" badge in the metadata line
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtDateTime, wasModified } from '$lib/utils/dates';
  import { permissions }    from '$lib/stores/permissions';
  import Button             from '$lib/components/common/Button.svelte';
  import ProtectedButton    from '$lib/components/common/ProtectedButton.svelte';
  import MeetingBadge       from './meetings/MeetingBadge.svelte';

  export let decision;
  export let editingDecision = null;   // bindable
  export let saving          = false;

  const dispatch = createEventDispatcher();

  function cancelEdit() { dispatch('editCancel'); }
</script>

{#if editingDecision?.id === decision.id}
  <!-- ─── Edit mode ───────────────────────────────────────────── -->
  <div class="bg-slate-700/50 rounded p-3 border border-violet-500/50">
    <textarea
      bind:value={editingDecision.decision_text}
      class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white
             placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-y"
      rows="4"
    ></textarea>
    <label class="flex items-center gap-2 mt-2 text-sm cursor-pointer">
      <input type="checkbox" bind:checked={editingDecision.historic} class="rounded" />
      <span class="text-gray-400">Mark as historic</span>
    </label>

    {#if $permissions.isAdmin}
      <div class="border-t border-slate-600 pt-2 mt-2">
        <div class="flex items-start gap-2 px-2 py-1.5 rounded bg-amber-900/20 border border-amber-700/40 text-xs text-amber-200 mb-2">
          <span class="shrink-0">⚠️</span>
          <span><strong>Admin only — record timestamps.</strong> Leave as automatic values in normal use. Only change to correct a historical data-entry error.</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="decision-admin-created-{decision.id}" class="block text-xs text-slate-400 mb-0.5">Created</label>
            <input
              id="decision-admin-created-{decision.id}"
              type="datetime-local"
              bind:value={editingDecision.override_created_at}
              class="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label for="decision-admin-updated-{decision.id}" class="block text-xs text-slate-400 mb-0.5">Modified</label>
            <input
              id="decision-admin-updated-{decision.id}"
              type="datetime-local"
              bind:value={editingDecision.override_updated_at}
              class="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>
    {/if}

    <div class="flex justify-end gap-2 mt-2">
      <Button variant="secondary" size="small" on:click={cancelEdit}>Cancel</Button>
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        icon="edit"
        disabled={saving}
        on:click={() => dispatch('editSave')}
      >
        {saving ? 'Saving…' : 'Update'}
      </ProtectedButton>
    </div>
  </div>

{:else}
  <!-- ─── Display mode ───────────────────────────────────────── -->
  <div
    id={`decision-${decision.id}`}
    class="bg-slate-700/50 rounded p-2 border-l-2 border-violet-400 {decision.historic ? 'opacity-60' : ''}"
  >
    <div class="flex justify-between items-start gap-2">

      <!-- Text: click opens full view -->
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex-1 overflow-y-auto max-h-[6.5rem] rounded cursor-pointer hover:bg-slate-600/20 transition-colors px-1"
        title="Click to view full decision"
        on:click={() => dispatch('viewFull', decision)}
      >
        <p class="text-gray-200 text-sm whitespace-pre-wrap">{decision.decision_text}</p>
      </div>

      <div class="flex gap-1 flex-shrink-0">
        <ProtectedButton
          action="modify"
          variant="secondary"
          size="small"
          icon="edit"
          iconPosition="only"
          on:click={() => dispatch('editStart', decision)}
          title="Edit decision"
        />
        <ProtectedButton
          action="modify"
          variant="danger"
          size="small"
          icon="delete"
          iconPosition="only"
          on:click={() => dispatch('deleteRequest', decision)}
          title="Delete decision"
        />
      </div>
    </div>

    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
      <span class="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-700/50 font-semibold uppercase tracking-wide">
        Decision
      </span>
      <span>Added: {fmtDateTime(decision.created_at, decision.created_by_profile?.full_name)}</span>
      {#if wasModified(decision.created_at, decision.updated_at)}
        <span>•</span>
        <span>Modified: {fmtDateTime(decision.updated_at, decision.updated_by_profile?.full_name)}</span>
      {/if}
      {#if decision.historic}
        <span>•</span>
        <span class="text-amber-400">Historic</span>
      {/if}
      {#if decision.meeting_id}
        <MeetingBadge
          meetingId={decision.meeting_id}
          on:click={(e) => dispatch('meetingFilter', e.detail)}
        />
      {/if}
    </div>
  </div>
{/if}
