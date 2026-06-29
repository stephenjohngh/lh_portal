<!-- src/lib/apps/golden_thread/components/GtIngestForm.svelte -->
<!--
  Golden Thread ingest form — upload a file + metadata to create a DRAFT register
  document (build step 3). Dispatches `submit` with the meta payload; the parent
  calls gtStore.createDraft. Standard theme + common/ components only.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import DocAttachInput from '$lib/components/common/DocAttachInput.svelte';
  import Button       from '$lib/components/common/Button.svelte';

  /** @type {Array<{code:number,name:string}>} */
  export let categories = [];
  export let saving = false;

  const dispatch = createEventDispatcher();

  let schedule1_category = '';
  let document_type = '';
  let title = '';
  let summary = '';
  let safety_critical = false;
  let access_scope = 'internal';
  let security_classification = 'official';
  let review_cycle_days = '';
  let tagsText = '';
  /** @type {File|null} */
  let file = null;
  let formError = '';

  $: categoryOptions = categories.map((c) => ({ value: String(c.code), label: `${c.code} — ${c.name}` }));

  const ACCESS_OPTIONS = [
    { value: 'internal',   label: 'Internal (in-app only)' },
    { value: 'registered', label: 'Registered (logged-in users)' },
    { value: 'public',     label: 'Public' }
  ];
  const CLASSIFICATION_OPTIONS = [
    { value: 'official',           label: 'Official' },
    { value: 'official_sensitive', label: 'Official-Sensitive' }
  ];

  function submit() {
    formError = '';
    if (!schedule1_category) return (formError = 'Select a Schedule-1 category.');
    if (!document_type.trim()) return (formError = 'Document type is required.');
    if (!title.trim()) return (formError = 'Title is required.');
    if (!file) return (formError = 'Attach a file.');
    if (safety_critical && !summary.trim()) {
      return (formError = 'A plain-English summary is required for safety-critical documents.');
    }

    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const days = review_cycle_days === '' ? null : Number(review_cycle_days);

    dispatch('submit', {
      schedule1_category: Number(schedule1_category),
      document_type: document_type.trim(),
      title: title.trim(),
      summary: summary.trim(),
      safety_critical,
      access_scope,
      security_classification,
      review_cycle_days: Number.isFinite(days) ? days : null,
      tags,
      file
    });
  }
</script>

<form class="space-y-4 max-w-2xl" on:submit|preventDefault={submit}>
  <FormSelect
    label="Schedule-1 category"
    bind:value={schedule1_category}
    options={categoryOptions}
    required
    helpText="Which prescribed category (SI 2024/41 Sch 1) this document satisfies."
  />

  <div class="grid gap-4 sm:grid-cols-2">
    <FormInput label="Document type" bind:value={document_type} required
      placeholder="e.g. Fire strategy" helpText="BSA Master Document List type" />
    <FormInput label="Title" bind:value={title} required />
  </div>

  <FormTextarea label="Summary" bind:value={summary} rows={3}
    helpText="Plain-English summary. Required when safety-critical." />

  <div class="grid gap-4 sm:grid-cols-2">
    <FormSelect label="Access scope" bind:value={access_scope} options={ACCESS_OPTIONS} />
    <FormSelect label="Security classification" bind:value={security_classification} options={CLASSIFICATION_OPTIONS} />
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <FormInput label="Review cycle (days)" type="number" bind:value={review_cycle_days}
      placeholder="e.g. 365" helpText="Optional. Drives the review-due date on acceptance." />
    <FormInput label="Tags" bind:value={tagsText} placeholder="comma, separated" />
  </div>

  <Checkbox bind:checked={safety_critical} label="Safety-critical document" />

  <div>
    <p class="text-xs text-slate-400 mb-1.5">File</p>
    <DocAttachInput bind:file accept="*/*" />
  </div>

  {#if formError}
    <p class="text-sm text-red-400">{formError}</p>
  {/if}

  <div class="flex gap-2">
    <Button type="submit" variant="primary" loading={saving} disabled={saving}>
      Create draft
    </Button>
    <Button type="button" variant="secondary" disabled={saving} on:click={() => dispatch('cancel')}>
      Cancel
    </Button>
  </div>
</form>
