<!-- src/lib/apps/parking/components/AgreementModal.svelte -->
<!-- Allocate a bay, or record who holds a demised one. Saves a DRAFT: the
     draft holds the bay against overlap, and activating it is a separate,
     deliberate step on the agreement itself. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import {
    basesForTenure, validateAgreement, validateHolder, normaliseReg,
    FEE_PERIODS, VAT_TREATMENTS, DEFAULT_VAT, todayISO, HOLDER_TYPE_LABEL,
  } from '../utils/agreementModel.js';
  import Modal        from '#lib/components/common/Modal.svelte';
  import Button       from '#lib/components/common/Button.svelte';
  import FormSelect   from '#lib/components/common/FormSelect.svelte';
  import FormInput    from '#lib/components/common/FormInput.svelte';
  import FormTextarea from '#lib/components/common/FormTextarea.svelte';
  import Checkbox     from '#lib/components/common/Checkbox.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import HolderFields from './HolderFields.svelte';
  import { tariffFor, termsFromTariff, matchesTariff, priceLabel, HOLDER_CLASS_LABEL } from '../utils/tariffModel.js';

  export let show = false;
  export let bay = null;
  // Set when accepting a waiting-list offer: the person the bay was offered to.
  export let presetHolderId = null;

  const dispatch = createEventDispatcher();

  let holderMode = 'existing';   // 'existing' | 'new'
  let holderId = '';
  let newHolder = {};
  let terms = {};
  let vehicles = [{ registration: '', make: '', model: '', colour: '', is_ev: false }];   // one, never empty: the form binds vehicles[0]
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
    holderMode = presetHolderId || $parkingStore.holders.length ? 'existing' : 'new';
    holderId = presetHolderId ?? ''; newHolder = { holder_type: '' };
    terms = {
      basis: b[0]?.value ?? '', unit_ref: bay.unit_ref ?? '',
      starts_on: todayISO(), ends_on: '', notice_days: '28',
      fee_amount: '', fee_period: 'month', vat_treatment: DEFAULT_VAT,
      deposit_amount: '', max_vehicles: '1', notes: '',
    };
    vehicles = [{ registration: '', make: '', model: '', colour: '', is_ev: false }];
    error = '';
    filledFrom = null;
  }
  $: if (!show) openedFor = null;

  // ⭐ The price list fills the fee in — once per price, keyed on its id, so a
  // fee the person has typed over is not put back while they edit other
  // fields. The agreement COPIES the price; the list changing later never
  // reprices it (design §5.7).
  $: pickedType = holderMode === 'new'
    ? newHolder.holder_type
    : $parkingStore.holders.find(h => h.id === holderId)?.holder_type;
  $: tariff = bay && !isRecord ? tariffFor($parkingStore.tariffs, bay.size, pickedType, terms.starts_on) : null;
  let filledFrom = null;
  $: if (!show) filledFrom = null;
  // In a function, so writing `terms` does not make this depend on itself.
  function fillFrom(t) {
    if (!t || t.id === filledFrom) return;
    filledFrom = t.id;
    terms = { ...terms, ...termsFromTariff(t) };
  }
  $: fillFrom(tariff);
  $: fromList = matchesTariff(terms, tariff);

  // Keep the vehicle lines no longer than the agreement allows.
  $: maxV = Math.max(1, Number(terms.max_vehicles) || 1);

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
            {#if tariff}
              <p class="text-xs {fromList ? 'text-slate-400' : 'text-amber-300'}" data-testid="price-note">
                {fromList ? 'From the price list' : 'Differs from the price list'}: {priceLabel(tariff)} for a
                {bay.size.toLowerCase()} bay ({HOLDER_CLASS_LABEL[tariff.holder_class].toLowerCase()}).
                {#if !fromList}<button class="text-purple-400 hover:text-purple-300 ml-1"
                  on:click={() => terms = { ...terms, ...termsFromTariff(tariff) }}>Use the list price</button>{/if}
              </p>
            {:else}
              <p class="text-xs text-slate-500" data-testid="price-note">
                {bay.size ? `No price is set for a ${bay.size.toLowerCase()} bay on that date.` : 'This bay has no size, so the price list cannot price it.'}
                Type the fee.
              </p>
            {/if}
            <div class="grid grid-cols-3 gap-3">
              <FormInput label="Fee (£)" bind:value={terms.fee_amount} placeholder="e.g. 60.00" />
              <FormSelect label="Per" bind:value={terms.fee_period} options={FEE_PERIODS} placeholder="" />
              <FormInput label="Deposit (£)" bind:value={terms.deposit_amount} />
            </div>
            <FormSelect label="VAT" bind:value={terms.vat_treatment} options={VAT_TREATMENTS} placeholder=""
              helpText="No VAT is charged at present. Change it only on the accountant's advice." />
          {/if}
          <FormTextarea label="Notes" bind:value={terms.notes} rows={2} />
        </section>

        <!-- Vehicle: one per agreement (user, 2026-10-10). Laid out as on the
             agreement — registration, make, model, then colour and EV. Leave
             the registration blank to add the vehicle later. -->
        <section class="space-y-2 border-t border-slate-700 pt-4">
          <h3 class="text-sm font-semibold text-slate-200">Vehicle</h3>
          <div class="grid grid-cols-[1.3fr_1fr_1fr] gap-2">
            <FormInput label="Registration" bind:value={vehicles[0].registration} placeholder="AB12 CDE" inputClass="uppercase" />
            <FormInput label="Make" bind:value={vehicles[0].make} />
            <FormInput label="Model" bind:value={vehicles[0].model} />
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <div class="w-40"><FormInput label="Colour" bind:value={vehicles[0].colour} /></div>
            <div class="pb-2"><Checkbox bind:checked={vehicles[0].is_ev} label="EV" /></div>
          </div>
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
