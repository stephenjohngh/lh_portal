<!-- src/lib/apps/complaints/components/ComplaintActions.svelte
     What will be done about a complaint: "revise the fire door inspection
     frequency", "retrain the night porters". `mor_mitigations` by another name
     (design §5.3). Distinct from a maintenance job — an action may not be one.

     The table, its policies and the store's add/update/delete were built with
     the app and no screen ever used them (found running the Complaints
     tutorial, 2026-10-26). Editors add and complete; only an admin deletes,
     as the database already enforces. -->
<script>
  import { complaintsStore } from '../stores/complaintsStore.js';
  import Button from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { fmtDate, today } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { actionStatusLabel, isActionOverdue } from '../utils/complaintActions.js';

  /** The complaint these belong to. */
  export let caseId;
  export let actions = [];
  export let canEdit = false;
  export let isAdmin = false;

  let description = '';
  let owner = '';
  let targetDate = '';
  let busy = false;
  let error = '';
  let removing = null;

  async function add() {
    const id = caseId, text = description.trim(), who = owner.trim(), by = targetDate || null;
    if (!text) return;
    busy = true; error = '';
    try {
      await complaintsStore.addAction(id, { description: text, owner: who || null, target_date: by });
      description = ''; owner = ''; targetDate = '';
    } catch (/** @type {any} */ err) { error = errMessage(err); } finally { busy = false; }
  }

  async function setStatus(action, status) {
    const id = action.id;
    busy = true; error = '';
    try {
      await complaintsStore.updateAction(id, {
        status, completed_at: status === 'complete' ? new Date().toISOString() : null,
      });
    } catch (/** @type {any} */ err) { error = errMessage(err); } finally { busy = false; }
  }

  async function confirmRemove() {
    const a = removing;
    busy = true; error = '';
    try { await complaintsStore.deleteAction(a.id); removing = null; }
    catch (/** @type {any} */ err) { error = errMessage(err); removing = null; }
    finally { busy = false; }
  }
</script>

<div class="border-t border-slate-700 pt-3" data-testid="complaint-actions">
  <h4 class="text-xs font-semibold text-white mb-2">What will be done about it</h4>

  {#if error}<ErrorDisplay message={error} />{/if}

  {#if actions.length === 0}
    <p class="text-xs text-slate-500">No actions recorded.</p>
  {:else}
    <ul class="space-y-2">
      {#each actions as a (a.id)}
        <li class="p-2 rounded border border-slate-700 bg-slate-800/40">
          <p class="text-sm text-slate-200" class:line-through={a.status === 'complete'}>{a.description}</p>
          <p class="text-[11px] text-slate-500 mt-0.5">
            {actionStatusLabel(a.status)}
            {#if a.owner}· {a.owner}{/if}
            {#if a.target_date}
              · due {fmtDate(a.target_date)}
              {#if isActionOverdue(a, today())}<span class="text-red-400">· overdue</span>{/if}
            {/if}
            {#if a.completed_at}· done {fmtDate(a.completed_at)}{/if}
          </p>
          {#if canEdit}
            <div class="flex gap-2 mt-1">
              {#if a.status === 'open'}
                <Button variant="tertiary" size="xs" disabled={busy} on:click={() => setStatus(a, 'in_progress')}>Start</Button>
              {/if}
              {#if a.status !== 'complete'}
                <Button variant="tertiary" size="xs" disabled={busy} on:click={() => setStatus(a, 'complete')}>Mark done</Button>
              {:else}
                <Button variant="tertiary" size="xs" disabled={busy} on:click={() => setStatus(a, 'open')}>Reopen</Button>
              {/if}
              {#if isAdmin}
                <Button variant="tertiary" size="xs" disabled={busy} on:click={() => removing = a}>Remove</Button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if canEdit}
    <div class="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
      <div class="sm:col-span-3">
        <FormInput label="Add an action" bind:value={description} placeholder="What will be done" />
      </div>
      <FormInput label="Owner (optional)" bind:value={owner} placeholder="Who is doing it" />
      <FormInput label="Due (optional)" type="date" bind:value={targetDate} />
      <div class="pb-4">
        <Button variant="secondary" size="small" disabled={busy || !description.trim()} on:click={add}>Add action</Button>
      </div>
    </div>
  {/if}
</div>

<ConfirmDialog show={!!removing} danger={true} title="Remove this action?"
  message="It is deleted, not hidden. Only an administrator can do this."
  confirmText="Remove" processing={busy}
  on:confirm={confirmRemove} on:cancel={() => removing = null} />
