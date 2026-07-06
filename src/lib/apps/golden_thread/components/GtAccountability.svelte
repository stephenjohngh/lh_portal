<!-- src/lib/apps/golden_thread/components/GtAccountability.svelte -->
<!--
  Golden Thread AP/PAP register (gt_accountable_persons). Records who holds
  accountability for the building (BSA 2022) and feeds the Safety Case. Editor-
  gated add; a tenure is CLOSED (ended_on) rather than deleted, so the record is
  permanent. Current tenures listed first, then past.
-->
<script>
  import { gtStore }     from '$lib/apps/golden_thread/stores/gtStore';
  import { permissions } from '$lib/stores/permissions';
  import { AP_ROLES, AP_ROLE_LABEL, AP_ROLE_BADGE } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import FormSelect   from '$lib/components/common/FormSelect.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import Badge        from '$lib/components/common/Badge.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import { fmtDate }  from '$lib/utils/dates';

  export let saving = false;

  $: canEdit = $permissions.isAdmin || $permissions.canModify;
  $: people  = $gtStore.accountablePersons ?? [];
  $: current = people.filter((p) => !p.ended_on);
  $: past    = people.filter((p) => p.ended_on);

  const roleOptions = AP_ROLES.map((r) => ({ value: r, label: AP_ROLE_LABEL[r] }));

  let role = 'pap';
  let name = '';
  let organisation = '';
  let appointed_on = '';
  let duties = '';
  let contact = '';
  let formError = '';

  async function add() {
    formError = '';
    if (!name.trim()) return (formError = 'Name is required.');
    const r = await gtStore.addAccountablePerson({
      role,
      name: name.trim(),
      organisation: organisation.trim() || null,
      appointed_on: appointed_on || null,
      duties: duties.trim() || null,
      contact: contact.trim() || null,
    });
    if (r.success) {
      role = 'pap'; name = ''; organisation = ''; appointed_on = ''; duties = ''; contact = '';
    } else {
      formError = r.error ?? 'Failed to add.';
    }
  }

  /** @type {any|null} */
  let pendingClose = null;
  let closing = false;
  async function confirmClose() {
    if (!pendingClose) return;
    closing = true;
    await gtStore.editAccountablePerson(pendingClose.id, { ended_on: new Date().toISOString().slice(0, 10) });
    closing = false;
    pendingClose = null;
  }
</script>

<div class="space-y-6 max-w-3xl">
  <div>
    <h2 class="text-lg font-semibold text-white">Accountability</h2>
    <p class="text-xs text-slate-500 mt-0.5">
      The building's Accountable Person(s) and Principal Accountable Person (BSA 2022).
      A tenure is closed, never deleted.
    </p>
  </div>

  {#if canEdit}
    <form class="grid gap-3 sm:grid-cols-2" on:submit|preventDefault={add}>
      <FormSelect label="Role" bind:value={role} options={roleOptions} />
      <FormInput label="Name" bind:value={name} required />
      <FormInput label="Organisation" bind:value={organisation} placeholder="optional" />
      <FormInput label="Appointed on" type="date" bind:value={appointed_on} />
      <FormInput label="Contact" bind:value={contact} placeholder="optional" />
      <div class="sm:col-span-2">
        <FormTextarea label="Duties / scope" bind:value={duties} rows={2}
          placeholder="Parts of the building / systems this person is accountable for" />
      </div>
      <div class="sm:col-span-2">
        <Button type="submit" variant="primary" loading={saving} disabled={saving}>Add to register</Button>
        {#if formError}<span class="text-sm text-red-400 ml-3">{formError}</span>{/if}
      </div>
    </form>
  {/if}

  <!-- Current -->
  <section>
    <h3 class="text-sm font-semibold text-slate-300 mb-2">Current</h3>
    {#if current.length === 0}
      <p class="text-sm text-slate-500 italic">No current accountable persons recorded.</p>
    {:else}
      <ul class="divide-y divide-slate-700 rounded-lg border border-slate-700">
        {#each current as p (p.id)}
          <li class="px-3 py-2.5 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <Badge color={AP_ROLE_BADGE[p.role] ?? 'bg-slate-500'}>{AP_ROLE_LABEL[p.role] ?? p.role}</Badge>
                <span class="text-sm text-white">{p.name}</span>
                {#if p.organisation}<span class="text-xs text-slate-500">· {p.organisation}</span>{/if}
              </div>
              {#if p.duties}<p class="text-xs text-slate-400 mt-1">{p.duties}</p>{/if}
              <p class="text-[11px] text-slate-500 mt-1">
                {#if p.appointed_on}Appointed {fmtDate(p.appointed_on)}{/if}
                {#if p.contact}{#if p.appointed_on} · {/if}{p.contact}{/if}
              </p>
            </div>
            {#if canEdit}
              <Button variant="secondary" size="small" on:click={() => (pendingClose = p)}>Close tenure</Button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Past -->
  {#if past.length > 0}
    <section>
      <h3 class="text-sm font-semibold text-slate-300 mb-2">Past</h3>
      <ul class="divide-y divide-slate-700 rounded-lg border border-slate-700 opacity-70">
        {#each past as p (p.id)}
          <li class="px-3 py-2 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="text-sm text-slate-300">{p.name}</span>
              <span class="text-xs text-slate-500 ml-2">{AP_ROLE_LABEL[p.role] ?? p.role}</span>
            </div>
            <span class="text-[11px] text-slate-500">
              {p.appointed_on ? fmtDate(p.appointed_on) : '—'} – {fmtDate(p.ended_on)}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<ConfirmDialog
  show={!!pendingClose}
  title="Close tenure"
  message={pendingClose ? `End ${pendingClose.name}'s tenure as ${AP_ROLE_LABEL[pendingClose.role] ?? pendingClose.role}? This is recorded, not deleted.` : ''}
  confirmText="Close tenure"
  processing={closing}
  on:confirm={confirmClose}
  on:cancel={() => (pendingClose = null)}
/>
