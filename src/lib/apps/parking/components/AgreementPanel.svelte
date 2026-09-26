<!-- src/lib/apps/parking/components/AgreementPanel.svelte -->
<!-- One agreement: who, which bay, the terms, its vehicles, and the lifecycle.
     Ended and terminated are final — a bay comes back by a NEW agreement, so
     this one stays true about what happened. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { permissions } from '$lib/stores/permissions';
  import {
    STATUS_LABEL, BASIS_LABEL, HOLDER_TYPE_LABEL, VAT_TREATMENTS, FEE_PERIODS,
    canTransition, validateVehicle, todayISO,
  } from '../utils/agreementModel.js';
  import { fmtDate } from '$lib/utils/dates.js';
  import Button        from '$lib/components/common/Button.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import FormSelect    from '$lib/components/common/FormSelect.svelte';
  import FormTextarea  from '$lib/components/common/FormTextarea.svelte';
  import Checkbox      from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let agreement = null;
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  $: s = $parkingStore;
  $: holder = s.holders.find(h => h.id === agreement?.holder_id) ?? null;
  $: bay = s.bays.find(b => b.bay_id === agreement?.bay_id) ?? null;
  $: vehicles = s.vehicles.filter(v => v.agreement_id === agreement?.id);
  $: currentVehicles = vehicles.filter(v => !v.to_date);
  $: pastVehicles = vehicles.filter(v => v.to_date);
  $: isRecord = agreement?.basis === 'demise_record' || agreement?.basis === 'lease_right_record';
  $: vatLabel = VAT_TREATMENTS.find(v => v.value === agreement?.vat_treatment)?.label ?? '—';

  let error = '';
  let busy = false;

  // Ending or terminating asks for the date and a reason in one small form.
  let ending = null;            // 'ended' | 'terminated' | null
  let endDate = '';
  let endReason = '';
  function askEnd(to) { ending = to; endDate = todayISO(); endReason = ''; error = ''; }

  let confirmDelete = false;

  // Editing terms: a copy, reset when a different agreement is shown.
  let editing = false;
  let draft = {};
  let shownFor = null;
  $: if (agreement?.id !== shownFor) { shownFor = agreement?.id; editing = false; ending = null; error = ''; }
  function startEdit() {
    draft = { ...agreement, ends_on: agreement.ends_on ?? '', notice_days: agreement.notice_days ?? '',
      fee_amount: agreement.fee_amount ?? '', deposit_amount: agreement.deposit_amount ?? '',
      max_vehicles: String(agreement.max_vehicles ?? 1), notes: agreement.notes ?? '' };
    editing = true; error = '';
  }

  let newVehicle = { registration: '', make: '', model: '', colour: '', is_ev: false };

  async function run(fn) {
    busy = true; error = '';
    try { await fn(); }
    catch (/** @type {any} */ err) { error = err.message; }
    finally { busy = false; }
  }

  const id = () => agreement.id;              // read before any await
  const to = (status) => { const a = id(); return run(() => parkingStore.setStatus(a, status)); };
  const saveEnd = () => { const a = id(); const t = ending;
    return run(async () => { await parkingStore.setStatus(a, t, { ends_on: endDate, ended_reason: endReason }); ending = null; }); };
  const saveTerms = () => { const a = id();
    return run(async () => { await parkingStore.updateAgreement(a, draft); editing = false; }); };
  const addVehicle = () => { const a = agreement;
    const problem = validateVehicle(newVehicle, a, s.vehicles);
    if (problem) { error = problem; return; }
    return run(async () => { await parkingStore.addVehicle(a.id, newVehicle);
      newVehicle = { registration: '', make: '', model: '', colour: '', is_ev: false }; }); };
  const endVehicle = (vid) => run(() => parkingStore.endVehicle(vid));
  const deleteDraft = () => { const a = id();
    return run(async () => { await parkingStore.deleteDraft(a); confirmDelete = false; dispatch('close'); }); };

  const money = n => (n == null ? '—' : `£${Number(n).toFixed(2)}`);
</script>

{#if agreement}
  <div class="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4" data-testid="agreement-panel">
    <div class="flex items-start justify-between">
      <div>
        <p class="font-mono text-lg text-white">{agreement.reference}</p>
        <p class="text-xs text-slate-400 mt-0.5">
          {BASIS_LABEL[agreement.basis]} · <span class="text-slate-200">{STATUS_LABEL[agreement.status]}</span>
        </p>
      </div>
      <button class="text-slate-500 hover:text-white" title="Close" on:click={() => dispatch('close')}>✕</button>
    </div>

    <dl class="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt class="text-slate-500">Bay</dt>
      <dd class="text-slate-200">
        {#if bay}<button class="font-mono text-purple-300 hover:underline" on:click={() => dispatch('showBay', bay.space_id)}>{bay.ref}</button>
          {#if bay.size}<span class="text-slate-500"> · {bay.size}</span>{/if}{:else}—{/if}
      </dd>
      <dt class="text-slate-500">Holder</dt>
      <dd class="text-slate-200">
        {#if holder}{holder.company_name ? holder.company_name + ' — ' : ''}{holder.display_name}
          <span class="text-slate-500">· {HOLDER_TYPE_LABEL[holder.holder_type]}</span>{/if}
      </dd>
      {#if holder?.email || holder?.phone}
        <dt class="text-slate-500">Contact</dt>
        <dd class="text-slate-300">{holder.email ?? ''}{holder.email && holder.phone ? ' · ' : ''}{holder.phone ?? ''}</dd>
      {/if}
      {#if isRecord}
        <dt class="text-slate-500">Lease of</dt><dd class="text-slate-200">{agreement.unit_ref}</dd>
      {/if}
      <dt class="text-slate-500">Dates</dt>
      <dd class="text-slate-200">{fmtDate(agreement.starts_on)} → {agreement.ends_on ? fmtDate(agreement.ends_on) : 'rolling'}
        {#if agreement.notice_days != null}<span class="text-slate-500"> · {agreement.notice_days} days' notice</span>{/if}</dd>
      {#if !isRecord}
        <dt class="text-slate-500">Fee</dt>
        <dd class="text-slate-200">{money(agreement.fee_amount)}{agreement.fee_period ? ' per ' + agreement.fee_period : ''}
          <span class="text-slate-500"> · VAT: {vatLabel}</span></dd>
        {#if agreement.deposit_amount != null}<dt class="text-slate-500">Deposit</dt><dd class="text-slate-200">{money(agreement.deposit_amount)}</dd>{/if}
      {/if}
      {#if agreement.ended_reason}<dt class="text-slate-500">Ended</dt><dd class="text-slate-300">{agreement.ended_reason}</dd>{/if}
      {#if agreement.notes}<dt class="text-slate-500">Notes</dt><dd class="text-slate-300 whitespace-pre-wrap">{agreement.notes}</dd>{/if}
    </dl>

    {#if error}<ErrorDisplay message={error} />{/if}

    <!-- Lifecycle -->
    {#if canEdit}
      <div class="flex flex-wrap gap-2 border-t border-slate-700 pt-3">
        {#if canTransition(agreement.status, 'active')}
          <Button size="small" variant="primary" disabled={busy} on:click={() => to('active')}>
            {agreement.status === 'notice_given' ? 'Withdraw notice' : 'Activate'}</Button>
        {/if}
        {#if canTransition(agreement.status, 'ended')}
          <Button size="small" variant="secondary" disabled={busy} on:click={() => askEnd('ended')}>End</Button>
        {/if}
        {#if canTransition(agreement.status, 'terminated')}
          <Button size="small" variant="danger" disabled={busy} on:click={() => askEnd('terminated')}>Terminate</Button>
        {/if}
        {#if agreement.status !== 'ended' && agreement.status !== 'terminated' && !editing}
          <Button size="small" variant="secondary" disabled={busy} on:click={startEdit}>Edit terms</Button>
        {/if}
        {#if agreement.status === 'draft' && $permissions.isAdmin}
          <Button size="small" variant="danger" disabled={busy} on:click={() => confirmDelete = true}>Delete draft</Button>
        {/if}
      </div>
      <p class="text-[11px] text-slate-500">Serving notice arrives in the next phase; for now end the agreement on the date it ends.</p>

      {#if ending}
        <div class="rounded-lg border border-slate-600 p-3 space-y-2">
          <p class="text-sm text-slate-200">{ending === 'ended' ? 'End' : 'Terminate'} {agreement.reference}</p>
          <FormInput label="On" type="date" bind:value={endDate} />
          <FormInput label="Reason" bind:value={endReason}
            placeholder={ending === 'ended' ? 'e.g. Holder moved out' : 'e.g. Breach of the licence terms'} />
          <p class="text-[11px] text-slate-500">Its vehicles stop being authorised on the same date.</p>
          <div class="flex gap-2">
            <Button size="small" variant={ending === 'ended' ? 'primary' : 'danger'} disabled={busy} on:click={saveEnd}>Confirm</Button>
            <Button size="small" variant="secondary" on:click={() => ending = null}>Cancel</Button>
          </div>
        </div>
      {/if}

      {#if editing}
        <div class="rounded-lg border border-slate-600 p-3 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <FormInput label="Starts" type="date" bind:value={draft.starts_on} />
            <FormInput label="Ends (blank = rolling)" type="date" bind:value={draft.ends_on} />
          </div>
          {#if isRecord}
            <FormInput label="Which flat's lease" bind:value={draft.unit_ref} />
          {:else}
            <div class="grid grid-cols-3 gap-3">
              <FormInput label="Fee (£)" bind:value={draft.fee_amount} />
              <FormSelect label="Per" bind:value={draft.fee_period} options={FEE_PERIODS} placeholder="" />
              <FormInput label="Deposit (£)" bind:value={draft.deposit_amount} />
            </div>
            <FormSelect label="VAT" bind:value={draft.vat_treatment} options={VAT_TREATMENTS} placeholder="" />
          {/if}
          <div class="grid grid-cols-2 gap-3">
            <FormInput label="Notice (days)" bind:value={draft.notice_days} />
            <FormSelect label="Vehicles allowed" bind:value={draft.max_vehicles} options={['1', '2', '3', '4']} placeholder="" />
          </div>
          <FormTextarea label="Notes" bind:value={draft.notes} rows={2} />
          <div class="flex gap-2">
            <Button size="small" variant="primary" disabled={busy} on:click={saveTerms}>Save terms</Button>
            <Button size="small" variant="secondary" on:click={() => editing = false}>Cancel</Button>
          </div>
        </div>
      {/if}
    {/if}

    <!-- Vehicles -->
    <div class="border-t border-slate-700 pt-3 space-y-2">
      <p class="text-sm font-semibold text-slate-200">Vehicles
        <span class="text-xs font-normal text-slate-500">({currentVehicles.length} of {agreement.max_vehicles} allowed)</span></p>
      {#each currentVehicles as v (v.id)}
        <div class="flex items-center justify-between text-sm">
          <span><span class="font-mono text-white">{v.registration}</span>
            <span class="text-slate-400"> {[v.colour, v.make, v.model].filter(Boolean).join(' ')}</span>
            {#if v.is_ev}<span class="text-xs text-green-400 ml-1">EV</span>{/if}</span>
          {#if canEdit}<button class="text-xs text-slate-400 hover:text-red-400" disabled={busy} on:click={() => endVehicle(v.id)}>No longer used</button>{/if}
        </div>
      {:else}
        <p class="text-xs text-slate-500 italic">No vehicles.</p>
      {/each}
      {#if pastVehicles.length}
        <details class="text-xs text-slate-500">
          <summary class="cursor-pointer">{pastVehicles.length} previous</summary>
          {#each pastVehicles as v (v.id)}
            <p class="mt-1"><span class="font-mono">{v.registration}</span> · until {fmtDate(v.to_date)}</p>
          {/each}
        </details>
      {/if}
      {#if canEdit && (agreement.status === 'draft' || agreement.status === 'active' || agreement.status === 'notice_given')
            && currentVehicles.length < agreement.max_vehicles}
        <div class="grid grid-cols-[7rem_1fr_1fr_auto_auto] gap-2 items-end">
          <FormInput label="Registration" bind:value={newVehicle.registration} placeholder="AB12 CDE" />
          <FormInput label="Make" bind:value={newVehicle.make} />
          <FormInput label="Colour" bind:value={newVehicle.colour} />
          <div class="pb-2"><Checkbox bind:checked={newVehicle.is_ev} label="EV" /></div>
          <div class="pb-1"><Button size="small" variant="secondary" disabled={busy} on:click={addVehicle}>Add</Button></div>
        </div>
      {/if}
    </div>
  </div>

  <ConfirmDialog
    show={confirmDelete}
    title="Delete draft"
    message={`Delete draft ${agreement.reference} and its vehicles? A draft that was never activated leaves no record worth keeping; anything that went live is ended instead.`}
    confirmText="Delete"
    danger={true}
    processing={busy}
    on:confirm={deleteDraft}
    on:cancel={() => confirmDelete = false}
  />
{/if}
