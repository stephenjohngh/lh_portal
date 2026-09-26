<!-- src/lib/apps/parking/components/HolderFields.svelte -->
<!-- The fields of a holder, bound to one object. Used on its own (HolderModal)
     and inside a new agreement, so a holder is described one way everywhere.

     ⛔ There is no flat, "resident of", date-of-birth or identity field, and
     there must never be one: a holder is a PARTY TO AN AGREEMENT, not a
     resident record (design §3; HOLDER_FIELDS in agreementModel.js, which a
     test pins). A flat appears only on an agreement, as the unit a demised bay
     belongs to. -->
<script>
  import { HOLDER_TYPES, isExternal } from '../utils/agreementModel.js';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';

  export let holder = {};
</script>

<div class="space-y-3">
  <FormSelect label="Kind of holder" bind:value={holder.holder_type} placeholder="-- Choose --"
    options={HOLDER_TYPES} />
  <FormInput label="Name" bind:value={holder.display_name}
    helpText={holder.holder_type === 'external_company' ? 'The contact person at the company.' : ''} />
  {#if holder.holder_type === 'external_company'}
    <FormInput label="Company" bind:value={holder.company_name} />
  {/if}
  <div class="grid grid-cols-2 gap-3">
    <FormInput label="Email" type="email" bind:value={holder.email} />
    <FormInput label="Phone" bind:value={holder.phone} />
  </div>
  <FormTextarea label="Correspondence address" bind:value={holder.correspondence_address} rows={2}
    helpText="Where notice under the licence is served. An email or an address is required." />

  {#if isExternal(holder.holder_type)}
    <div class="rounded-lg border border-amber-700/50 bg-amber-900/10 p-3 space-y-2">
      <p class="text-xs text-amber-200">
        This person is not a resident. They must be given the parking privacy notice before
        their details are recorded here.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <FormInput label="Privacy notice version" bind:value={holder.privacy_notice_version} placeholder="e.g. v1 Sept 2026" />
        <FormInput label="Given on" type="date" bind:value={holder.privacy_notice_at} />
      </div>
    </div>
  {/if}
</div>
