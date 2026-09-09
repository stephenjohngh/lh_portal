<!-- src/lib/apps/admin/components/DisplayItemModal.svelte -->
<!-- Create / edit a display_items row (BSA s.82 register). Registration fields
     only (R5) — refresh/exception handling (R6) is done from the register row
     itself via displayRegisterStore.setStatus, not here. -->
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
  export let item = null;   // row or null (create)
  export let saving = false;

  const dispatch = createEventDispatcher();
  const isEdit = !!item;

  const CATEGORY_OPTIONS = [
    { value: 'ap_notice',         label: 'Accountable Persons notice' },
    { value: 'bac',                label: 'Building Assessment Certificate' },
    { value: 'compliance_notice', label: 'Compliance notice' },
    { value: 'other',              label: 'Other' },
  ];

  let title             = item?.title ?? '';
  let category          = item?.category ?? 'other';
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

<Modal show={true} title={isEdit ? 'Edit display item' : 'New display item'} size="medium" on:close={() => dispatch('close')}>
  <div class="flex flex-col gap-1">
    <FormInput label="Title" required bind:value={title} placeholder="e.g. Accountable Persons Notice" disabled={saving} />
    <FormSelect label="Category" options={CATEGORY_OPTIONS} bind:value={category} placeholder="" disabled={saving} />
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
