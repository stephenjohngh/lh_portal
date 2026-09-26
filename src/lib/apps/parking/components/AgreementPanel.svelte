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
    noticeEndDate, DEVICE_TYPES, DEVICE_LABEL, outstandingDevices, depositRefundProblem,
    EVENT_LABEL, eventSummary, basesForTenure,
  } from '../utils/agreementModel.js';
  import { fmtDate } from '$lib/utils/dates.js';
  import { HOLDER_CLASS_LABEL } from '../utils/tariffModel.js';
  import AttachedDocuments from '$lib/components/common/documents/AttachedDocuments.svelte';
  import { DOC_FOLDERS, entityFolderPath } from '$lib/utils/documentUtils.js';
  import { logAudit } from '$lib/utils/auditLogger';
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
  $: pricedAt = agreement?.tariff_id ? s.tariffs.find(t => t.id === agreement.tariff_id) ?? null : null;
  $: vatLabel = VAT_TREATMENTS.find(v => v.value === agreement?.vat_treatment)?.label ?? '—';
  $: devices = s.devices.filter(d => d.agreement_id === agreement?.id);
  $: devicesOut = outstandingDevices(agreement?.id, s.devices);
  $: refundProblem = agreement ? depositRefundProblem(agreement, s.devices) : null;
  $: live = agreement && ['draft', 'active', 'notice_given'].includes(agreement.status);
  // Bays this licence could move to: licensable, in use, not this one.
  $: moveTargets = s.bays.filter(b => b.bay_id !== agreement?.bay_id && b.in_service !== false
    && basesForTenure(b.tenure).some(x => x.value === agreement?.basis));

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
  $: if (agreement?.id !== shownFor) {
    shownFor = agreement?.id; editing = false; ending = null; noticing = false; moving = false; error = '';
    refreshTimeline();
  }
  function startEdit() {
    draft = { ...agreement, ends_on: agreement.ends_on ?? '', notice_days: agreement.notice_days ?? '',
      fee_amount: agreement.fee_amount ?? '', deposit_amount: agreement.deposit_amount ?? '',
      max_vehicles: String(agreement.max_vehicles ?? 1), notes: agreement.notes ?? '' };
    editing = true; error = '';
  }

  let newVehicle = { registration: '', make: '', model: '', colour: '', is_ev: false };

  // Serving notice: the date, who served it, and the end it produces.
  let noticing = false;
  let notice = { served_on: '', served_by: 'holder', ends_on: '' };
  function askNotice() {
    const served = todayISO();
    notice = { served_on: served, served_by: 'holder', ends_on: noticeEndDate(agreement, served) ?? '' };
    noticing = true; error = '';
  }
  // Recompute the end date when the service date changes, unless there is no
  // notice period to count from.
  function servedChanged() {
    const end = noticeEndDate(agreement, notice.served_on);
    if (end) notice = { ...notice, ends_on: end };
  }

  let newDevice = { device_type: 'fob', serial: '' };

  let moving = false;
  let move = { space_id: '', on: '' };
  function askMove() { move = { space_id: '', on: todayISO() }; moving = true; error = ''; }

  // The timeline is read from the database, which writes it; refreshed after
  // each change made here.
  let timeline = [];
  let timelineFor = null;
  async function refreshTimeline() {
    const a = agreement?.id;
    if (!a) { timeline = []; return; }
    timelineFor = a;
    try {
      const events = await parkingStore.loadEvents(a);
      if (timelineFor === a) timeline = events;
    } catch { /* the panel still works without it */ }
  }

  async function run(fn) {
    busy = true; error = '';
    try { await fn(); refreshTimeline(); }
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
  const saveNotice = () => { const a = id(); const n = notice;
    return run(async () => { await parkingStore.serveNotice(a, n); noticing = false; }); };
  const issueDevice = () => { const a = id(); const d = newDevice;
    return run(async () => { await parkingStore.issueDevice(a, d); newDevice = { device_type: d.device_type, serial: '' }; }); };
  const returnDevice = (did) => run(() => parkingStore.returnDevice(did));
  const refund = () => { const a = id(); return run(() => parkingStore.refundDeposit(a)); };
  const saveMove = () => { const a = id(); const m = move;
    return run(async () => { const newId = await parkingStore.moveToBay(a, m.space_id, m.on);
      moving = false; dispatch('moved', newId); }); };
  const deleteDraft = () => { const a = id();
    return run(async () => { await parkingStore.deleteDraft(a); confirmDelete = false; dispatch('close'); }); };

  const money = n => (n == null ? '—' : `£${Number(n).toFixed(2)}`);

  // Which agreement, and the document id: never the file name, which may name
  // the holder.
  function auditDoc(action, doc) {
    logAudit(action, 'parking_agreement_document', doc?.id ?? null, agreement?.reference ?? '',
      { appId: 'parking', eventCategory: 'parking', afterData: { agreement: agreement?.reference } });
  }
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
          <span class="text-slate-500"> · VAT: {vatLabel}</span>
          <span class="block text-xs text-slate-500" data-testid="fee-source">{pricedAt
            ? `The ${pricedAt.bay_size.toLowerCase()} list price from ${fmtDate(pricedAt.effective_from)} (${HOLDER_CLASS_LABEL[pricedAt.holder_class].toLowerCase()}), copied when the agreement was made. A later price does not change it.`
            : 'Not from the price list: set by hand, or carried over from a previous bay.'}</span></dd>
        {#if agreement.deposit_amount != null}<dt class="text-slate-500">Deposit</dt>
          <dd class="text-slate-200">{money(agreement.deposit_amount)}
            {#if agreement.deposit_refunded_on}<span class="text-slate-500"> · refunded {fmtDate(agreement.deposit_refunded_on)}</span>{/if}</dd>{/if}
      {/if}
      {#if agreement.status === 'notice_given'}
        <dt class="text-slate-500">Notice</dt>
        <dd class="text-amber-200">Served by the {agreement.notice_served_by} on {fmtDate(agreement.notice_served_on)};
          ends {fmtDate(agreement.ends_on)}</dd>
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
        {#if agreement.status === 'active'}
          <Button size="small" variant="secondary" disabled={busy} on:click={askNotice}>Serve notice</Button>
          {#if agreement.basis === 'licence' || agreement.basis === 'adjustment'}
            <Button size="small" variant="secondary" disabled={busy} on:click={askMove}>Move to another bay</Button>
          {/if}
        {/if}
        {#if agreement.status !== 'ended' && agreement.status !== 'terminated' && !editing}
          <Button size="small" variant="secondary" disabled={busy} on:click={startEdit}>Edit terms</Button>
        {/if}
        {#if agreement.status === 'draft' && $permissions.isAdmin}
          <Button size="small" variant="danger" disabled={busy} on:click={() => confirmDelete = true}>Delete draft</Button>
        {/if}
      </div>
      {#if agreement.status === 'notice_given' && agreement.ends_on && agreement.ends_on <= todayISO()}
        <p class="text-xs text-amber-300">The notice has run out. End the agreement to free the bay.</p>
      {/if}

      {#if noticing}
        <div class="rounded-lg border border-slate-600 p-3 space-y-2">
          <p class="text-sm text-slate-200">Serve notice on {agreement.reference}</p>
          <div class="grid grid-cols-2 gap-3">
            <FormInput label="Served on" type="date" bind:value={notice.served_on} on:change={servedChanged} />
            <FormSelect label="Served by" bind:value={notice.served_by} placeholder=""
              options={[{ value: 'holder', label: 'The holder' }, { value: 'licensor', label: 'Us (the licensor)' }]} />
          </div>
          <FormInput label="Ends on" type="date" bind:value={notice.ends_on}
            helpText={agreement.notice_days != null
              ? `${agreement.notice_days} days' notice from the date served, or sooner if the agreement already ends sooner.`
              : 'This agreement has no notice period, so enter the end date.'} />
          <div class="flex gap-2">
            <Button size="small" variant="primary" disabled={busy} on:click={saveNotice}>Serve notice</Button>
            <Button size="small" variant="secondary" on:click={() => noticing = false}>Cancel</Button>
          </div>
        </div>
      {/if}

      {#if moving}
        <div class="rounded-lg border border-slate-600 p-3 space-y-2">
          <p class="text-sm text-slate-200">Move {agreement.reference} to another bay</p>
          <FormSelect label="To bay" bind:value={move.space_id} placeholder="-- Choose --"
            options={moveTargets.map(b => ({ value: b.space_id, label: `${b.ref}${b.size ? ' · ' + b.size : ''}${b.current ? ' (held)' : ''}` }))} />
          <FormInput label="From" type="date" bind:value={move.on} />
          <p class="text-[11px] text-slate-500">
            This agreement ends the day before; a new one starts on the new bay with the same holder and terms,
            and the vehicles and devices go across. All of it happens together, or none of it does.
          </p>
          <div class="flex gap-2">
            <Button size="small" variant="primary" disabled={busy} on:click={saveMove}>Move</Button>
            <Button size="small" variant="secondary" on:click={() => moving = false}>Cancel</Button>
          </div>
        </div>
      {/if}

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

    <!-- The signed licence, and anything else that belongs with the agreement.
         Gated on the Parking grant like the agreement itself (migration 227),
         and removed with it by retention. The folder is named by the
         reference, never the holder: a Drive folder name is not access-
         controlled like the row is. -->
    <div class="border-t border-slate-700 pt-3" data-testid="agreement-documents">
      <AttachedDocuments
        entityType="parking_agreement"
        entityId={agreement.id}
        {canEdit}
        canDelete={$permissions.isAdmin}
        folderPath={entityFolderPath(DOC_FOLDERS.PARKING, agreement.reference, agreement.id)}
        title="Signed licence and documents"
        on:uploaded={(e) => auditDoc('create', e.detail)}
        on:deleted={(e) => auditDoc('delete', e.detail)}
      />
    </div>

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
    <!-- Access devices -->
    <div class="border-t border-slate-700 pt-3 space-y-2" data-testid="agreement-devices">
      <p class="text-sm font-semibold text-slate-200">Access devices</p>
      {#if devicesOut.length && (agreement.status === 'ended' || agreement.status === 'terminated')}
        <p class="text-xs text-red-300">⚠ {devicesOut.length} still out after the agreement ended. It still opens the gate.</p>
      {/if}
      {#each devices as d (d.id)}
        <div class="flex items-center justify-between text-sm">
          <span class={d.returned_on ? 'text-slate-500' : 'text-slate-200'}>
            {DEVICE_LABEL[d.device_type]} <span class="font-mono">{d.serial}</span>
            <span class="text-xs text-slate-500"> · issued {fmtDate(d.issued_on)}{d.returned_on ? ' · returned ' + fmtDate(d.returned_on) : ''}</span>
          </span>
          {#if canEdit && !d.returned_on}
            <button class="text-xs text-slate-400 hover:text-white" disabled={busy} on:click={() => returnDevice(d.id)}>Returned</button>
          {/if}
        </div>
      {:else}
        <p class="text-xs text-slate-500 italic">None issued.</p>
      {/each}
      {#if canEdit && live}
        <div class="grid grid-cols-[8rem_1fr_auto] gap-2 items-end">
          <FormSelect label="Issue" bind:value={newDevice.device_type} options={DEVICE_TYPES} placeholder="" />
          <FormInput label="Serial / number" bind:value={newDevice.serial} />
          <div class="pb-1"><Button size="small" variant="secondary" disabled={busy} on:click={issueDevice}>Issue</Button></div>
        </div>
      {/if}
      {#if canEdit && agreement.deposit_amount && !agreement.deposit_refunded_on}
        <div class="flex items-center gap-3">
          <Button size="small" variant="secondary" disabled={busy || !!refundProblem} on:click={refund}>Deposit refunded</Button>
          {#if refundProblem}<span class="text-xs text-slate-500">{refundProblem}</span>{/if}
        </div>
      {/if}
    </div>

    <!-- Timeline: written by the database, never edited -->
    <div class="border-t border-slate-700 pt-3" data-testid="agreement-timeline">
      <p class="text-sm font-semibold text-slate-200 mb-2">Timeline</p>
      {#each timeline as e (e.id)}
        <div class="text-xs py-1 border-b border-slate-800 last:border-0">
          <span class="text-slate-500">{fmtDate(e.created_at)}</span>
          <span class="text-slate-200 ml-1">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
          {#if eventSummary(e)}<span class="text-slate-400"> · {eventSummary(e)}</span>{/if}
        </div>
      {:else}
        <p class="text-xs text-slate-500 italic">Nothing recorded yet.</p>
      {/each}
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
