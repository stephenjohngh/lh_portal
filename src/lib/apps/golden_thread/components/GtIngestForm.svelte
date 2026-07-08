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
  import { DOCUMENT_TYPES } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import { assessCompetence, COMPETENCE_LABELS } from '$lib/apps/golden_thread/utils/gtCompetence.js';

  /** @type {Array<{code:number,name:string}>} */
  export let categories = [];
  /** Current documents this draft could supersede. */
  export let currentDocs = [];
  /** gt_persons registry for author/reviewer selection. */
  export let persons = [];
  export let saving = false;

  const dispatch = createEventDispatcher();

  let schedule1_category = '';
  let document_type = '';
  let title = '';
  let summary = '';
  let scope_description = '';
  let building_location = '';
  let uniclass_code = '';
  let container_id = '';
  let safety_critical = false;
  let contains_pii = false;
  let access_scope = 'internal';
  let security_classification = 'official';
  let review_cycle_days = '';
  let tagsText = '';
  let supersedes = '';
  let author_id = '';
  let reviewer_id = '';
  /** @type {File|null} */
  let file = null;
  let formError = '';

  $: categoryOptions = categories.map((c) => ({ value: String(c.code), label: `${c.code} — ${c.name}` }));
  const docTypeOptions = DOCUMENT_TYPES.map((t) => ({ value: t, label: t }));
  $: supersedesOptions = currentDocs.map((d) => ({ value: d.id, label: `${d.reference} — ${d.title}` }));
  const personLabel = (p) => (p.organisation ? `${p.full_name} (${p.organisation})` : p.full_name);
  $: authorOptions   = persons.filter((p) => ['author', 'both'].includes(p.role)).map((p) => ({ value: p.id, label: personLabel(p) }));
  $: reviewerOptions = persons.filter((p) => ['reviewer', 'both'].includes(p.role)).map((p) => ({ value: p.id, label: personLabel(p) }));

  // Competence gate (Stage E, soft) — warn if the chosen reviewer/author is not
  // competent for this document's domain, or their competence has lapsed.
  $: reviewerAssess = assessCompetence(persons.find((p) => p.id === reviewer_id) ?? null, document_type);
  $: authorAssess   = assessCompetence(persons.find((p) => p.id === author_id) ?? null, document_type);
  function competenceWarning(a) {
    if (!a || a.ok) return '';
    if (a.expired) return 'competence has lapsed';
    if (a.missing) return `not recorded as competent for ${COMPETENCE_LABELS[a.required] ?? a.required}`;
    return '';
  }

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
    if (!document_type) return (formError = 'Select a document type.');
    if (!title.trim()) return (formError = 'Title is required.');
    if (!file) return (formError = 'Attach a file.');
    if (safety_critical && !summary.trim()) {
      return (formError = 'A plain-English summary is required for safety-critical documents.');
    }

    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const days = review_cycle_days === '' ? null : Number(review_cycle_days);

    dispatch('submit', {
      schedule1_category: Number(schedule1_category),
      document_type,
      title: title.trim(),
      summary: summary.trim(),
      scope_description: scope_description.trim() || null,
      building_location: building_location.trim() || null,
      uniclass_code: uniclass_code.trim() || null,
      container_id: container_id.trim() || null,
      safety_critical,
      contains_pii,
      access_scope,
      security_classification,
      review_cycle_days: Number.isFinite(days) ? days : null,
      tags,
      supersedes: supersedes || null,
      author_id: author_id || null,
      reviewer_id: reviewer_id || null,
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
    <FormSelect label="Document type" bind:value={document_type} options={docTypeOptions} required
      helpText="Master Document List type." />
    <FormInput label="Title" bind:value={title} required />
  </div>

  <FormTextarea label="Summary" bind:value={summary} rows={3}
    helpText="Plain-English summary. Required when safety-critical." />

  <FormTextarea label="Scope / applicability" bind:value={scope_description} rows={2}
    helpText="What the document covers — systems, areas, or the extent of the building it applies to." />

  <div class="grid gap-4 sm:grid-cols-2">
    <FormInput label="Building location" bind:value={building_location}
      placeholder="e.g. Whole building, Core A stair" helpText="Where in the building this applies." />
    <FormInput label="Uniclass code" bind:value={uniclass_code}
      placeholder="e.g. Pr_35_31_—" helpText="Optional classification code." />
  </div>

  <FormInput label="Information container ID" bind:value={container_id}
    placeholder="ISO 19650 container reference" helpText="Optional CDE container identifier for this information." />

  <div class="grid gap-4 sm:grid-cols-2">
    <div>
      <FormSelect label="Author" bind:value={author_id} options={authorOptions}
        placeholder="— None —" helpText="From the People registry." />
      {#if competenceWarning(authorAssess)}
        <p class="text-[11px] text-amber-400 mt-0.5">⚠ Author {competenceWarning(authorAssess)}.</p>
      {/if}
    </div>
    <div>
      <FormSelect label="Reviewer" bind:value={reviewer_id} options={reviewerOptions}
        placeholder="— None —" />
      {#if competenceWarning(reviewerAssess)}
        <p class="text-[11px] text-amber-400 mt-0.5">⚠ Reviewer {competenceWarning(reviewerAssess)}.</p>
      {/if}
    </div>
  </div>

  <FormSelect label="Supersedes (optional)" bind:value={supersedes} options={supersedesOptions}
    placeholder="— None (new document) —"
    helpText="Pick the current document this replaces; it is auto-superseded when this one is accepted." />

  <div class="grid gap-4 sm:grid-cols-2">
    <FormSelect label="Access scope" bind:value={access_scope} options={ACCESS_OPTIONS} />
    <FormSelect label="Security classification" bind:value={security_classification} options={CLASSIFICATION_OPTIONS} />
  </div>

  <div class="grid gap-4 sm:grid-cols-2">
    <FormInput label="Review cycle (days)" type="number" bind:value={review_cycle_days}
      placeholder="e.g. 365" helpText="Optional. Drives the review-due date on acceptance." />
    <FormInput label="Tags" bind:value={tagsText} placeholder="comma, separated" />
  </div>

  <div class="flex flex-wrap gap-x-6 gap-y-2">
    <Checkbox bind:checked={safety_critical} label="Safety-critical document" />
    <Checkbox bind:checked={contains_pii} label="Contains personal data (PII)" />
  </div>

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
