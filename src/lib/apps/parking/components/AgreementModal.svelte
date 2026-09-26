<!-- src/lib/apps/parking/components/AgreementModal.svelte -->
<!-- Allocate a bay, or record who holds a demised one. Saves a DRAFT: the
     draft holds the bay against overlap, and activating it is a separate,
     deliberate step on the agreement itself. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import {
    basesForTenure, validateAgreement, validateHolder, normaliseReg,
    FEE_PERIODS, VAT_TREATMENTS, todayISO, HOLDER_TYPE_LABEL,
  } from '../utils/agreementModel.js';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Checkbox     from '$lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import HolderFields from './HolderFields.svelte';

  export let show = false;
  export let bay = null;

  const dispatch = createEventDispatcher();

  let holderMode = 'existing';   // 'existing' | 'new'
  let holderId = '';
  let newHolder = {};
  let terms = {};
  let vehicles = [];
  let openedFor = null;
  let saving = false;
  let error = '';

  $: bases = bay ? basesForTenure(bay.tenure) : [];
  $: isRecord = terms.basis === 'demise_record' || terms.basis === 'lease_right_record';

  // Reset when opened for a bay (a primitive key: the bay object changes on
  // every store update and would otherwise wipe the form while typing).
  $: key = show && bay ? bay.space_id : null;
  $: if (key && key !== openedFor) {
    openedFor = key;
    const b = basesForTenure(bay.tenure);
    holderMode = $parkingStore.holders.length ? 'existing' : 'new';
    holderId = ''; newHolder = { holder_type: '' };
    terms = {
      basis: b[0]?.value ?? '', unit_ref: bay.unit_ref ?? '',
      starts_on: todayISO(), ends_on: '', notice_days: '28',
      fee_amount: '', fee_period: 'month', vat_treatment: 'not_decided',
      deposit_amount: '', max_vehicles: '1', notes: '',
    };
    vehicles = [{ registration: '', make: '', model: '', colour: '', is_ev: false }];
    error = '';
  }
  $: if (!show) openedFor = null;

  // Keep the vehicle lines no longer than the agreement allows.
  $: maxV = Math.max(1, Number(terms.max_vehicles) || 1);
  function addLine() { if (vehicles.length < maxV) vehicles = [...vehicles, { registration: '', is_ev: false }]; }
  function removeLine(i) { vehicles = vehicles.filter((_, j) => j !== i); }

  $: holderOptions = $parkingStore.holders.map(h => ({
    value: h.id, label: `${h.company_name ? h.company_name + ' — ' : ''}${h.display_name} (${HOLDER_TYPE_LABEL[h.holder_type]})`,
  }));

  async function save() {
    const spaceId = bay.space_id;             // captured before any await
    const holder = holderMode === 'new'
      ? newHolder
      : $parkingStore.holders.find(h => h.id === holderId);
    if (holderMode === 'new') {
      const hp = validateHolder(newHolder);
      if (hp) { error = hp; return; }
    }
    // Check the agreement BEFORE creating a new holder, so a refused
    // agreement does not leave a stray holder behind.
    const problem = validateAgreement(terms, bay, holder, $parkingStore.agreements);
    if (problem) { error = problem; return; }
    const lines = vehicles.filter(v => normaliseReg(v.registration));
    if (lines.length > maxV) { error = `This agreement allows ${maxV} vehicle${maxV === 1 ? '' : 's'}.`; return; }

    saving = true; error = '';
    try {
      const hid = holderMode === 'new' ? (await parkingStore.saveHolder(null, newHolder)).id : holderId;
      const saved = await parkingStore.createAgreement(spaceId, hid, terms, lines);
      dispatch('saved', saved);
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<Modal {show} title={bay ? `${isRecord ? 'Record the holder of' : 'Allocate'} ${bay.ref}` : ''} size="large"
  on:close={() => dispatch('close')}>
  {#if bay}
    {#if bases.length === 0}
      <p class="text-sm text-slate-300">This bay is not for allocation. Change how it is held on the bay first.</p>
    {:else}
      <div class="space-y-5">
        <!-- Holder -->
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-slate-200">Holder</h3>
          <div class="flex gap-4 text-sm text-slate-300">
            <label class="inline-flex items-center gap-2">
              <input type="radio" bind:group={holderMode} value="existing" disabled={!holderOptions.length} /> Existing holder
            </label>
            <label class="inline-flex items-center gap-2">
              <input type="radio" bind:group={holderMode} value="new" /> New holder
            </label>
          </div>
          {#if holderMode === 'existing'}
            <FormSelect label="Holder" bind:value={holderId} options={holderOptions} placeholder="-- Choose --" />
          {:else}
            <HolderFields bind:holder={newHolder} />
          {/if}
          {#if bay.planning_restricted}
            <p class="text-xs text-amber-300">This bay is residents only: an external holder will be refused.</p>
          {/if}
        </section>

        <!-- Terms -->
        <section class="space-y-3 border-t border-slate-700 pt-4">
          <h3 class="text-sm font-semibold text-slate-200">Terms</h3>
          <FormSelect label="Basis" bind:value={terms.basis} options={bases} placeholder="" />
          {#if isRecord}
            <FormInput label="Which flat's lease" bind:value={terms.unit_ref}
              helpText="The bay belongs to this lease, whoever holds it." />
          {/if}
          <div class="grid grid-cols-3 gap-3">
            <FormInput label="Starts" type="date" bind:value={terms.starts_on} />
            <FormInput label="Ends (blank = rolling)" type="date" bind:value={terms.ends_on} />
            <FormInput label="Notice (days)" bind:value={terms.notice_days} />
          </div>
          {#if !isRecord}
            <div class="grid grid-cols-3 gap-3">
              <FormInput label="Fee (£)" bind:value={terms.fee_amount} placeholder="e.g. 60.00" />
              <FormSelect label="Per" bind:value={terms.fee_period} options={FEE_PERIODS} placeholder="" />
              <FormInput label="Deposit (£)" bind:value={terms.deposit_amount} />
            </div>
            <FormSelect label="VAT" bind:value={terms.vat_treatment} options={VAT_TREATMENTS} placeholder=""
              helpText="Set from the accountant's advice, never guessed." />
          {/if}
          <FormSelect label="Vehicles allowed" bind:value={terms.max_vehicles} options={['1', '2', '3', '4']} placeholder="" />
          <FormTextarea label="Notes" bind:value={terms.notes} rows={2} />
        </section>

        <!-- Vehicles -->
        <section class="space-y-2 border-t border-slate-700 pt-4">
          <h3 class="text-sm font-semibold text-slate-200">Vehicles</h3>
          {#each vehicles as v, i}
            <div class="grid grid-cols-[8rem_1fr_1fr_1fr_auto_auto] gap-2 items-end">
              <FormInput label={i === 0 ? 'Registration' : ''} bind:value={v.registration} placeholder="AB12 CDE" />
              <FormInput label={i === 0 ? 'Make' : ''} bind:value={v.make} />
              <FormInput label={i === 0 ? 'Model' : ''} bind:value={v.model} />
              <FormInput label={i === 0 ? 'Colour' : ''} bind:value={v.colour} />
              <div class="pb-2"><Checkbox bind:checked={v.is_ev} label="EV" /></div>
              <button class="pb-2 text-slate-500 hover:text-red-400" title="Remove" on:click={() => removeLine(i)}>✕</button>
            </div>
          {/each}
          {#if vehicles.length < maxV}
            <button class="text-xs text-purple-400 hover:text-purple-300" on:click={addLine}>+ Add a vehicle</button>
          {/if}
        </section>

        {#if error}<ErrorDisplay message={error} />{/if}
      </div>
    {/if}
  {/if}
  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
    {#if bases.length}
      <Button variant="primary" loading={saving} disabled={saving} on:click={save}>Save as draft</Button>
    {/if}
  </div>
</Modal>
