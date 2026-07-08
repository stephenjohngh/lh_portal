<!-- src/lib/apps/golden_thread/components/GtRiskForm.svelte -->
<!-- Create / edit a risk (gt_risks). Dispatches `submit` with the field payload;
     the parent calls gtRiskStore.createRisk / saveRisk. Scoring is 5x5 with a
     live band preview. Standard theme + common/ components. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import Badge        from '$lib/components/common/Badge.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import {
    RISK_DOMAINS, RISK_DOMAIN_LABELS, RISK_SOURCES,
    LIKELIHOOD_LABELS, IMPACT_LABELS, scoreBand,
  } from '$lib/apps/golden_thread/utils/gtRiskScoring.js';

  export let risk = null;            // row or null (create)
  export let persons = [];           // gt_persons registry (owner picker)
  export let saving = false;

  const dispatch = createEventDispatcher();
  const isEdit = !!risk;

  let title       = risk?.title ?? '';
  let domain      = risk?.domain ?? 'fire';
  let description = risk?.description ?? '';
  let hazard      = risk?.hazard ?? '';
  let cause       = risk?.cause ?? '';
  let consequence = risk?.consequence ?? '';
  let likelihood  = risk?.likelihood ?? 3;
  let impact      = risk?.impact ?? 3;
  let residual    = risk?.residual_score ?? '';
  let building_location = risk?.building_location ?? '';
  let source      = risk?.source ?? 'manual';
  let owner_id    = risk?.owner_id ?? '';
  let review_cycle_days = risk?.review_cycle_days ?? '';
  let identified_at = risk?.identified_at ?? '';
  let formError = '';

  const domainOptions = RISK_DOMAINS.map((d) => ({ value: d, label: RISK_DOMAIN_LABELS[d] }));
  const sourceOptions = RISK_SOURCES.map((s) => ({ value: s, label: s.toUpperCase() }));
  const scale = [1, 2, 3, 4, 5];
  $: ownerOptions = persons.map((p) => ({ value: p.id, label: p.organisation ? `${p.full_name} (${p.organisation})` : p.full_name }));

  $: inherent = Number(likelihood) * Number(impact);
  $: effective = residual === '' ? inherent : Number(residual);
  $: band = scoreBand(effective);

  function submit() {
    formError = '';
    if (!title.trim()) return (formError = 'Title is required.');
    dispatch('submit', {
      id: risk?.id ?? null,
      data: {
        title: title.trim(), domain, description: description.trim() || null,
        hazard: hazard.trim() || null, cause: cause.trim() || null, consequence: consequence.trim() || null,
        likelihood: Number(likelihood), impact: Number(impact),
        residual_score: residual === '' ? null : Number(residual),
        building_location: building_location.trim() || null,
        source, owner_id: owner_id || null,
        review_cycle_days: review_cycle_days === '' ? null : Number(review_cycle_days),
        identified_at: identified_at || null,
      },
    });
  }
</script>

<Modal show={true} title={isEdit ? `Edit ${risk.reference}` : 'New risk'} size="large" on:close={() => dispatch('close')}>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
      <FormInput label="Title" bind:value={title} required placeholder="e.g. External wall fire spread" />
      <FormSelect label="Domain" bind:value={domain} options={domainOptions} />
    </div>
    <FormTextarea label="Description (hazard & how harm occurs)" bind:value={description} rows={2} />

    <div class="grid gap-4 sm:grid-cols-3">
      <FormInput label="Hazard" bind:value={hazard} placeholder="source of harm" />
      <FormInput label="Cause / trigger" bind:value={cause} />
      <FormInput label="Consequence" bind:value={consequence} placeholder="worst credible outcome" />
    </div>

    <!-- Scoring -->
    <div class="rounded-lg border border-slate-700 p-3 space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-slate-200">Scoring (5×5)</p>
        <span class="text-xs text-slate-400">
          Inherent <strong class="text-slate-200">{inherent}</strong> · effective <strong class="text-slate-200">{effective}</strong>
          {#if band}<Badge color={band.badge}>{band.label}</Badge>{/if}
        </span>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <p class="text-xs text-slate-400 mb-1">Likelihood</p>
          <select bind:value={likelihood} class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
            {#each scale as n}<option value={n}>{n} — {LIKELIHOOD_LABELS[n]}</option>{/each}
          </select>
        </div>
        <div>
          <p class="text-xs text-slate-400 mb-1">Impact</p>
          <select bind:value={impact} class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100">
            {#each scale as n}<option value={n}>{n} — {IMPACT_LABELS[n]}</option>{/each}
          </select>
        </div>
        <FormInput label="Residual score (after controls, optional 1–25)" type="number" bind:value={residual} placeholder="—" />
      </div>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <FormInput label="Building location" bind:value={building_location} placeholder="e.g. Core B, levels 4–8 risers" />
      <FormSelect label="Owner" bind:value={owner_id} options={ownerOptions} placeholder="— None —" helpText="Accountable person (People registry)." />
    </div>
    <div class="grid gap-4 sm:grid-cols-3">
      <FormSelect label="Source" bind:value={source} options={sourceOptions} />
      <FormInput label="Identified on" type="date" bind:value={identified_at} />
      <FormInput label="Review cycle (days)" type="number" bind:value={review_cycle_days} placeholder="e.g. 365" />
    </div>

    {#if formError}<p class="text-sm text-red-400">{formError}</p>{/if}
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
    <Button variant="primary" loading={saving} disabled={saving || !title.trim()} on:click={submit}>
      {isEdit ? 'Save changes' : 'Create risk'}
    </Button>
  </svelte:fragment>
</Modal>
