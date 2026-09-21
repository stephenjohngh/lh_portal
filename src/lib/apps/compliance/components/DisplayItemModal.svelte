<!-- src/lib/apps/admin/components/DisplayItemModal.svelte -->
<!-- src/lib/apps/compliance/components/DisplayItemModal.svelte -->
<!-- Create / edit a display_items row (BSA s.82 register). Registration fields
     only (R5) — refresh/exception handling (R6) is done from the register row
     itself via displayRegisterStore.setStatus, not here.

     Category is fixed context, not a field the user picks here: for ap_notice
     /bac this is always an EDIT of the seeded singleton row (see migration
     199); for compliance_notice/other it's whichever "+ Add" button in
     DisplayRegisterTab opened this modal. There is no category picker because
     there is nothing to pick — s.82 names the three categories, the register
     doesn't ask the user to reclassify a slot. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { listCurrentDocuments } from '$lib/apps/golden_thread/public.js';

  /** @typedef {import('$lib/database.types').Tables<'display_items'>} DisplayItem */
  /** @type {DisplayItem|null} */
  export let item = null;   // row or null (create — only for compliance_notice/other)
  /** @type {'ap_notice'|'bac'|'compliance_notice'|'other'} */
  export let category;
  export let saving = false;

  const dispatch = createEventDispatcher();
  const isEdit = !!item;

  const CATEGORY_TITLE = {
    ap_notice:         'Accountable Persons notice',
    bac:               'Building Assessment Certificate',
    compliance_notice: isEdit ? 'Edit compliance notice' : 'New compliance notice',
    other:             isEdit ? 'Edit display item' : 'New display item',
  };

  let title             = item?.title ?? '';
  let currentVersion    = item?.current_version ?? '';
  let approvalDate      = item?.approval_date ?? '';
  let reviewDate        = item?.review_date ?? '';
  let displayLocation   = item?.display_location ?? '';
  let accessibleFormat  = item?.accessible_format ?? '';
  let responsiblePersonId = item?.responsible_person_id ?? '';
  let frequencyDays     = item?.inspection_frequency_days ?? '';
  let linkedGtDocumentId = item?.linked_gt_document_id ?? '';

  let gtDocuments = [];
  onMount(async () => {
    await profilesStore.load();
    try { gtDocuments = await listCurrentDocuments(); } catch { gtDocuments = []; }
  });

  $: personOptions = [{ value: '', label: '— none —' }, ...$profiles.list.map(p => ({ value: p.id, label: p.full_name }))];
  $: gtDocOptions = [
    { value: '', label: '— none —' },
    ...gtDocuments.map(d => ({ value: d.id, label: `${d.reference} — ${d.title}` })),
  ];

  $: valid = title.trim().length > 0 && displayLocation.trim().length > 0;

  function handleSave() {
    if (!valid) return;
    dispatch('save', {
      id: item?.id ?? null,
      data: {
        title, category,
        previousStatus: item?.status ?? null,
        current_version: currentVersion,
        approval_date: approvalDate,
        review_date: reviewDate,
        display_location: displayLocation,
        accessible_format: accessibleFormat,
        responsible_person_id: responsiblePersonId,
        inspection_frequency_days: frequencyDays,
        linked_gt_document_id: linkedGtDocumentId,
      },
    });
  }
</script>

<Modal show={true} title={CATEGORY_TITLE[category]} size="medium" on:close={() => dispatch('close')}>
  <div class="flex flex-col gap-1">
    {#if item?.status === 'not_set'}
      <p class="not-set-hint">
        BSA s.82 requires this to be displayed in the building. Fill in its
        details below to mark it as displayed.
      </p>
    {/if}

    <FormInput label="Title" required bind:value={title} placeholder="e.g. Accountable Persons Notice" disabled={saving} />
    <FormInput label="Current version" bind:value={currentVersion} placeholder="e.g. v3" disabled={saving} />

    <div class="grid grid-cols-2 gap-3">
      <FormInput label="Approval date" type="date" bind:value={approvalDate} disabled={saving} />
      <FormInput label="Review date" type="date" bind:value={reviewDate} disabled={saving} />
    </div>

    <FormInput label="Display location" required bind:value={displayLocation} placeholder="e.g. Ground floor lobby noticeboard" disabled={saving} />
    <FormInput label="Accessible format" bind:value={accessibleFormat} placeholder="e.g. A3 laminated + large-print copy on request" disabled={saving} />

    <div class="grid grid-cols-2 gap-3">
      <FormSelect label="Responsible person" options={personOptions} bind:value={responsiblePersonId} placeholder="" disabled={saving} />
      <FormInput label="Inspection frequency (days)" type="number" bind:value={frequencyDays} placeholder="e.g. 30" disabled={saving} />
    </div>

    <FormSelect
      label="Linked Golden Thread document"
      helpText="Optional — when set, a new version of this document flags this item as needing a physical refresh."
      options={gtDocOptions}
      bind:value={linkedGtDocumentId}
      placeholder=""
      disabled={saving}
    />
  </div>

  <svelte:fragment slot="footer">
    <div class="flex justify-end gap-2 w-full">
      <Button variant="secondary" on:click={() => dispatch('close')} disabled={saving}>Cancel</Button>
      <Button variant="primary" on:click={handleSave} disabled={saving || !valid}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
      </Button>
    </div>
  </svelte:fragment>
</Modal>

<style>
  .not-set-hint {
    font-size: 0.8rem; color: rgb(251 191 36); background: rgb(251 191 36 / 0.1);
    border: 1px solid rgb(251 191 36 / 0.3); border-radius: 6px; padding: 0.5rem 0.75rem;
    margin-bottom: 0.5rem;
  }
</style>
