<!-- src/lib/apps/admin/components/modals/EditUserModal.svelte -->
<!-- Admin → Users → ✎ Edit: correct a person's name and set their SHORT NAME
     (initials, e.g. "SP"). Management offers only people with a short name as
     meeting attendees and action assignees (migration 279). Only an admin may
     change these; the database refuses anyone else. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { usersStore } from '../../stores/usersStore';
  import Modal from '#lib/components/common/Modal.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { shortNameProblem } from '#lib/utils/shortName.js';
  import { errMessage } from '#lib/utils/errors.js';

  export let show = false;
  /** @type {any} */
  export let user = null;

  const dispatch = createEventDispatcher();

  let fullName = '';
  let shortName = '';
  let saving = false;
  let error = '';

  // Fill the fields when the dialog opens on a person — keyed on the id, so a
  // store refresh never wipes what is being typed.
  let openedFor = null;
  $: if (show && user?.id && user.id !== openedFor) {
    openedFor = user.id;
    fullName = user.full_name ?? '';
    shortName = user.short_name ?? '';
    error = '';
  }
  $: if (!show) openedFor = null;

  $: shortProblem = shortNameProblem(shortName, $usersStore.users, user?.id);
  $: nameProblem = fullName.trim() ? '' : 'A name is needed.';

  async function save() {
    if (!user || shortProblem || nameProblem) return;
    const id = user.id;
    saving = true; error = '';
    try {
      await usersStore.updateProfile(id, { full_name: fullName, short_name: shortName });
      dispatch('saved');
      show = false;
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not save the changes.');
    } finally {
      saving = false;
    }
  }
</script>

<Modal bind:show title="Edit user" size="small" on:close>
  {#if user}
    <div class="space-y-4">
      <p class="text-sm text-slate-400">{user.email}</p>

      <FormInput label="Name" bind:value={fullName} error={nameProblem} required />

      <div>
        <FormInput label="Short name" bind:value={shortName} placeholder="e.g. SP" error={shortProblem} />
        <p class="text-xs text-slate-400 mt-1">
          Initials used in Management for meeting attendees and action assignees, shown there as
          “SP (Stephen Pallett)” when choosing. People with no short name are not offered there.
          Up to 10 letters, numbers, dots or hyphens; no two people may share one.
        </p>
      </div>

      {#if error}<ErrorDisplay {error} />{/if}

      <div class="flex justify-end gap-2">
        <Button variant="secondary" on:click={() => (show = false)} disabled={saving}>Cancel</Button>
        <Button variant="primary" on:click={save} disabled={saving || !!shortProblem || !!nameProblem}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  {/if}
</Modal>
