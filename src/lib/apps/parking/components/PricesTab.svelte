<!-- src/lib/apps/parking/components/PricesTab.svelte -->
<!-- The price list, by bay size (design §5.7, migration 225). A price change
     is a NEW price from a date, never an edit: the old one closes the day
     before, and agreements already made keep the fee they were copied at.
     Everyone with the Parking grant reads it; only an admin sets prices. -->
<script>
  import { parkingStore } from '../stores/parkingStore.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { priceList, priceLabel, validateTariff, HOLDER_CLASSES, HOLDER_CLASS_LABEL } from '../utils/tariffModel.js';
  import { FEE_PERIODS, VAT_TREATMENTS, DEFAULT_VAT, todayISO } from '../utils/agreementModel.js';
  import { PARKING_BAY_TYPES } from '#lib/apps/building_assets/utils/spaceTypeOptions.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import Modal          from '#lib/components/common/Modal.svelte';
  import Button         from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import FormInput      from '#lib/components/common/FormInput.svelte';
  import FormSelect     from '#lib/components/common/FormSelect.svelte';
  import FormTextarea   from '#lib/components/common/FormTextarea.svelte';
  import ConfirmDialog  from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay   from '#lib/components/common/ErrorDisplay.svelte';

  const VAT = Object.fromEntries(VAT_TREATMENTS.map(v => [v.value, v.label]));

  $: today = todayISO();
  $: list = priceList($parkingStore.tariffs, today);
  $: usedBy = (id) => $parkingStore.agreements.filter(a => a.tariff_id === id).length;

  let showForm = false;
  let form = {};
  let saving = false;
  let formError = '';
  let error = '';
  let pendingDelete = null;
  let deleting = false;

  function openForm(size = '') {
    form = { bay_size: size, holder_class: 'all', amount: '', period: 'month',
      vat_treatment: DEFAULT_VAT, deposit_amount: '', effective_from: today, notes: '' };
    formError = '';
    showForm = true;
  }

  async function save() {
    const problem = validateTariff(form, $parkingStore.tariffs);
    if (problem) { formError = problem; return; }
    saving = true; formError = '';
    try {
      await parkingStore.addTariff(form);
      showForm = false;
    } catch (/** @type {any} */ err) {
      formError = err.message;
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    const id = pendingDelete.id;
    deleting = true; error = '';
    try {
      await parkingStore.deleteTariff(id);
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      deleting = false;
      pendingDelete = null;
    }
  }

  const period = (t) => `${t.effective_to ? fmtDate(t.effective_from) + ' to ' + fmtDate(t.effective_to) : 'from ' + fmtDate(t.effective_from)}`;
</script>

<div class="space-y-4 max-w-4xl">
  <div class="flex items-start justify-between gap-4">
    <p class="text-sm text-slate-400">
      What a bay costs, by its size. A new agreement is filled in from this list; an agreement already made keeps
      the fee it was made at, whatever the list says later. To change a price, add a new one from the date it
      changes. The old one closes the day before.
    </p>
    <ProtectedButton requireAdmin={true} variant="primary" on:click={() => openForm()}>+ New price</ProtectedButton>
  </div>
  {#if error}<ErrorDisplay message={error} />{/if}

  {#each list as row (row.size)}
    <section class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2" data-testid="price-{row.size}">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-200">{row.size}</h3>
        {#if $permissions.isAdmin}
          <button class="text-xs text-purple-400 hover:text-purple-300" on:click={() => openForm(row.size)}>+ Price for {row.size}</button>
        {/if}
      </div>
      {#if !row.current.length && !row.upcoming.length}
        <p class="text-xs text-amber-300">No price set. A new agreement for a {row.size.toLowerCase()} bay will have its fee typed by hand.</p>
      {/if}
      {#each [...row.current.map(t => ({ t, when: 'Current' })), ...row.upcoming.map(t => ({ t, when: 'From ' + fmtDate(t.effective_from) })), ...row.past.map(t => ({ t, when: 'Ended' }))] as { t, when } (t.id)}
        <div class="grid grid-cols-[6rem_1fr_auto] gap-3 items-start text-sm {when === 'Ended' ? 'text-slate-500' : 'text-slate-300'}">
          <span class="text-xs uppercase tracking-wide {when === 'Current' ? 'text-green-400' : 'text-slate-500'}">{when}</span>
          <div>
            <span class="font-semibold {when === 'Ended' ? '' : 'text-white'}">{priceLabel(t)}</span>
            <span class="text-xs"> · {HOLDER_CLASS_LABEL[t.holder_class]} · {period(t)} · VAT: {VAT[t.vat_treatment]}</span>
            {#if t.deposit_amount != null}<span class="text-xs"> · deposit £{Number(t.deposit_amount).toFixed(2)}</span>{/if}
            {#if usedBy(t.id)}<span class="text-xs text-slate-500"> · {usedBy(t.id)} agreement{usedBy(t.id) === 1 ? '' : 's'} made at it</span>{/if}
            {#if t.notes}<p class="text-xs text-slate-500">{t.notes}</p>{/if}
          </div>
          {#if $permissions.isAdmin && !usedBy(t.id) && when !== 'Ended'}
            <button class="text-xs text-slate-500 hover:text-red-400" title="Remove a price added in error"
              on:click={() => pendingDelete = t}>Remove</button>
          {:else}<span></span>{/if}
        </div>
      {/each}
    </section>
  {/each}
</div>

<Modal show={showForm} title="New price" size="medium" on:close={() => showForm = false}>
  <div class="space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <FormSelect label="Bay size" bind:value={form.bay_size} options={PARKING_BAY_TYPES} placeholder="-- Choose --" />
      <FormSelect label="For" bind:value={form.holder_class} options={HOLDER_CLASSES} placeholder=""
        helpText="Everyone, unless residents and external holders pay differently." />
    </div>
    <div class="grid grid-cols-3 gap-3">
      <FormInput label="Price (£)" bind:value={form.amount} placeholder="e.g. 60.00" />
      <FormSelect label="Per" bind:value={form.period} options={FEE_PERIODS} placeholder="" />
      <FormInput label="Deposit (£)" bind:value={form.deposit_amount} />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <FormSelect label="VAT" bind:value={form.vat_treatment} options={VAT_TREATMENTS} placeholder=""
        helpText="No VAT is charged at present. Change it only on the accountant's advice." />
      <FormInput label="Starts" type="date" bind:value={form.effective_from}
        helpText="The current price for this size ends the day before." />
    </div>
    <FormTextarea label="Notes" bind:value={form.notes} rows={2} />
    <p class="text-xs text-slate-500">An accessible bay costs what its size costs: there is no separate price for one.</p>
    {#if formError}<ErrorDisplay message={formError} />{/if}
  </div>
  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => showForm = false}>Cancel</Button>
    <Button variant="primary" loading={saving} disabled={saving} on:click={save}>Add price</Button>
  </div>
</Modal>

<ConfirmDialog
  show={!!pendingDelete}
  title="Remove this price?"
  message={pendingDelete ? `${pendingDelete.bay_size}, ${priceLabel(pendingDelete)}, ${period(pendingDelete)}. Only for a price added in error: the price it replaced becomes current again. To change a price, add a new one instead.` : ''}
  danger={true}
  processing={deleting}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
