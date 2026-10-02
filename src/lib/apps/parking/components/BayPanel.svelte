<!-- src/lib/apps/parking/components/BayPanel.svelte -->
<!-- One bay: what the drawing says (read-only, owned by Building Assets) and
     the parking facts (editable here). The split on screen is the split in
     ownership, so nobody edits a bay's size here and wonders why the plan
     did not change. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { TENURES, UNIT_TENURES, BAY_STATE, validateBayFacts } from '../utils/bayModel.js';
  import Button       from '$lib/components/common/Button.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { fmtDate } from '$lib/utils/dates.js';
  import { basesForTenure, LIVE, STATUS_LABEL, BASIS_LABEL } from '../utils/agreementModel.js';
  import { nextFor } from '../utils/waitingListModel.js';

  /** @type {import('../utils/bayModel.js').MergedBay | null} */
  export let bay = null;
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  // The form is reset only when a DIFFERENT bay is selected. Keyed on the id,
  // a primitive: the bay object is replaced on every store update, and keying
  // on it would wipe what the person is typing (CLAUDE.md, object props).
  let form = {};
  let loadedFor = null;
  let saving = false;
  let error = '';
  let saved = false;

  $: if (bay?.space_id && bay.space_id !== loadedFor) {
    loadedFor = bay.space_id;
    form = {
      tenure: bay.tenure, unit_ref: bay.unit_ref ?? '',
      is_accessible: bay.is_accessible, is_tandem: bay.is_tandem,
      planning_restricted: bay.planning_restricted,
      in_service: bay.in_service, out_of_use_reason: bay.out_of_use_reason ?? '',
      out_of_use_until: bay.out_of_use_until ?? '',
      max_height_m: bay.max_height_m ?? '', notes: bay.notes ?? '',
    };
    error = ''; saved = false;
  }

  $: outOfUse = form.in_service === false;
  $: needsUnit = UNIT_TENURES.has(form.tenure);

  async function save() {
    const spaceId = bay.space_id;              // captured before the await
    const problem = validateBayFacts(form);
    if (problem) { error = problem; return; }
    saving = true; error = ''; saved = false;
    try {
      await parkingStore.saveBay(spaceId, form);
      saved = true;
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  const m = n => (n == null ? '—' : n.toFixed(2));

  // Who holds the bay: live agreements (a draft holds it too), newest first,
  // and how many ended ones sit behind them.
  $: agreements = bay?.bay_id ? $parkingStore.agreements.filter(a => a.bay_id === bay.bay_id) : [];
  $: live = agreements.filter(a => LIVE.has(a.status)).sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  $: pastCount = agreements.length - live.length;
  $: holderName = (id) => {
    const h = $parkingStore.holders.find(x => x.id === id);
    return h ? (h.company_name ? `${h.company_name} — ${h.display_name}` : h.display_name) : '—';
  };
  $: allocatable = bay && basesForTenure(bay.tenure).length > 0;
  // A licensable bay out of use cannot be allocated (migration 229); a demised
  // bay's holder can still be recorded.
  $: blockedOutOfUse = bay && bay.in_service === false && bay.tenure === 'licensable';
  // First come, first served: who is next for a free bay of this size.
  $: next = bay && bay.state === 'free' ? nextFor(bay, $parkingStore.applications) : null;
  $: isRecordBay = bay && (bay.tenure === 'demised' || bay.tenure === 'lease_right');
</script>

{#if bay}
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4" data-testid="bay-panel">
    <div class="flex items-start justify-between">
      <div>
        <p class="font-mono text-lg text-white">{bay.ref}</p>
        <p class="text-xs mt-0.5 inline-flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full" style="background:{BAY_STATE[bay.state]?.colour}"></span>
          <span class="text-slate-300">{BAY_STATE[bay.state]?.label}</span>
        </p>
      </div>
      <button class="text-slate-500 hover:text-white" title="Close" on:click={() => dispatch('close')}>✕</button>
    </div>

    <!-- The drawing: Building Assets' facts, shown not edited -->
    <dl class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-slate-500">Size</dt>
      <dd class="text-slate-200">{bay.size ?? 'Not set'}</dd>
      <dt class="text-slate-500">Measured</dt>
      <dd class="text-slate-200">
        {#if bay.measured}{m(bay.measured.width)} × {m(bay.measured.length)} m · {m(bay.measured.area)} m²
        {:else}<span class="text-slate-500">The plan has no scale</span>{/if}
      </dd>
      <dt class="text-slate-500">Name</dt>
      <dd class="text-slate-200">{bay.space?.label || bay.space?.name || '—'}</dd>
    </dl>
    <p class="text-[11px] text-slate-500">
      Size, number, name and shape are set in Building Assets → Plan View, where the bay is drawn.
      {#if !bay.number}<span class="text-amber-400">This bay has no number yet, so its reference ends in an id fragment.</span>{/if}
    </p>

    <!-- Who holds it -->
    <div class="border-t border-slate-700 pt-3 space-y-2" data-testid="bay-holders">
      <p class="text-sm font-semibold text-slate-200">Held by</p>
      {#each live as a (a.id)}
        <button class="block w-full text-left rounded-lg bg-slate-900/50 hover:bg-slate-900 p-2 text-sm"
          on:click={() => dispatch('showAgreement', a.id)}>
          <span class="text-slate-200">{holderName(a.holder_id)}</span>
          <span class="block text-xs text-slate-400">
            <span class="font-mono">{a.reference}</span> · {BASIS_LABEL[a.basis]} · {STATUS_LABEL[a.status]}
            · {fmtDate(a.starts_on)} → {a.ends_on ? fmtDate(a.ends_on) : 'rolling'}
          </span>
        </button>
      {:else}
        <p class="text-xs text-slate-500">Nobody.</p>
      {/each}
      {#if pastCount}<p class="text-[11px] text-slate-500">{pastCount} earlier agreement{pastCount === 1 ? '' : 's'} on the Agreements tab.</p>{/if}
      {#if bay.offer}
        <p class="text-xs text-amber-300">Offered to {holderName(bay.offer.holder_id)} until {fmtDate(bay.offer.offer_expires_on)}.
          Only they can be allocated it while the offer stands.</p>
      {:else if next}
        <p class="text-xs text-slate-400">Next on the waiting list: <span class="text-slate-200">{holderName(next.holder_id)}</span>
          (joined {fmtDate(next.joined_on)}). Offer it from the Waiting list tab.</p>
      {/if}
      {#if canEdit && allocatable && blockedOutOfUse}
        <p class="text-[11px] text-slate-500">Out of use: bring it back into use before allocating it.</p>
      {:else if canEdit && allocatable}
        <Button size="small" variant="primary" on:click={() => dispatch('allocate', bay.space_id)}>
          {isRecordBay ? 'Record the holder' : live.length ? 'Allocate from another date' : 'Allocate'}
        </Button>
      {:else if !allocatable}
        <p class="text-[11px] text-slate-500">Not for allocation.</p>
      {/if}
    </div>

    <!-- The parking facts: editable here -->
    {#if canEdit}
      <div class="border-t border-slate-700 pt-4 space-y-3">
        <FormSelect label="Held as" bind:value={form.tenure}
          options={TENURES.map(t => ({ value: t.value, label: t.label }))} placeholder=""
          helpText={TENURES.find(t => t.value === form.tenure)?.hint ?? ''} />
        {#if needsUnit}
          <FormInput label="Which flat's lease" bind:value={form.unit_ref} placeholder="e.g. Flat 12"
            helpText="A unit, not a person: the bay belongs to the lease, whoever holds it." />
        {/if}

        <div class="space-y-1.5">
          <Checkbox bind:checked={form.is_accessible} label="Accessible bay (wider, for a disabled driver)" />
          <Checkbox bind:checked={form.is_tandem} label="Tandem (one bay behind another)" />
          <Checkbox bind:checked={form.planning_restricted} label="Residents only" />
        </div>

        <Checkbox checked={outOfUse} label="Out of use"
          on:change={(e) => form.in_service = !e.target.checked} />
        {#if outOfUse}
          <FormInput label="Why" bind:value={form.out_of_use_reason} placeholder="e.g. Water ingress under repair" />
          <FormInput label="Back in use (expected)" type="date" bind:value={form.out_of_use_until} />
        {/if}

        <FormInput label="Headroom (m)" bind:value={form.max_height_m} placeholder="e.g. 2.1" />
        <FormTextarea label="Notes" bind:value={form.notes} rows={2} />

        {#if error}<ErrorDisplay message={error} />{/if}
        <div class="flex items-center gap-3">
          <Button variant="primary" size="small" loading={saving} disabled={saving} on:click={save}>Save</Button>
          {#if saved}<span class="text-xs text-green-400">Saved</span>{/if}
        </div>
      </div>
    {:else}
      <dl class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm border-t border-slate-700 pt-3">
        <dt class="text-slate-500">Held as</dt>
        <dd class="text-slate-200">{TENURES.find(t => t.value === bay.tenure)?.label}{#if bay.unit_ref} · {bay.unit_ref}{/if}</dd>
        {#if !bay.in_service}
          <dt class="text-slate-500">Out of use</dt>
          <dd class="text-red-300">{bay.out_of_use_reason}{#if bay.out_of_use_until} · until {fmtDate(bay.out_of_use_until)}{/if}</dd>
        {/if}
        {#if bay.notes}<dt class="text-slate-500">Notes</dt><dd class="text-slate-300">{bay.notes}</dd>{/if}
      </dl>
    {/if}
  </div>
{/if}
