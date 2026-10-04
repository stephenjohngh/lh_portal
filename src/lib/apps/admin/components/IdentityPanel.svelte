<!-- src/lib/apps/admin/components/IdentityPanel.svelte -->
<!-- Admin → Other Config → Building & business: the building's name and address,
     the business that runs it, and who signs the letters to residents.

     These used to be written into the code — the building as "Lonsdale House" in
     some exports and "Lancaster House" in others, the letters signed
     "[Building Safety Manager name]" every time. They are details that change,
     so they are an admin's to set (user, 2026-10-03). Every export and letter
     reads them from here; an empty field prints as a bracketed placeholder.
     Logo and colours are deployment branding and are not here.

     The building is the one `facilities` row; the business and signatory are
     portal_settings.organisation ($lib/utils/identity.js). -->
<script>
  import { onMount } from 'svelte';
  import { portalSettings } from '$lib/stores/portalSettings.js';
  import { ORGANISATION_FIELDS, cleanOrganisation } from '$lib/utils/identity.js';
  import { logAudit } from '$lib/utils/auditLogger';
  import { errMessage } from '$lib/utils/errors';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  let building = /** @type {{ name: string, short_name: string, address: string } | null} */ (null);
  let organisation = /** @type {Record<string, string> | null} */ (null);
  let savingBuilding = false, savingOrg = false;
  let savedBuilding = false, savedOrg = false;
  let error = '';

  // Read afresh on opening; fill the form once, never on a later store update,
  // or it would wipe what the admin is typing.
  let refreshed = false;
  onMount(async () => { await portalSettings.load(); refreshed = true; });
  $: if (refreshed && building === null) reset();

  function reset() {
    const b = $portalSettings.building;
    building = { name: b?.name ?? '', short_name: b?.short_name ?? '', address: b?.address ?? '' };
    organisation = Object.fromEntries(ORGANISATION_FIELDS.map(({ key }) => [key, $portalSettings.organisation?.[key] ?? '']));
  }

  async function saveBuilding() {
    if (!building) return;
    const before = $portalSettings.building;
    savingBuilding = true; savedBuilding = false; error = '';
    try {
      const after = await portalSettings.saveBuilding(building);
      savedBuilding = true;
      logAudit('update', 'facility', after.id, after.name, {
        appId: 'admin', eventCategory: 'system', severity: 'info',
        beforeData: { name: before?.name, short_name: before?.short_name, address: before?.address },
        afterData:  { name: after.name, short_name: after.short_name, address: after.address },
      });
    } catch (err) {
      error = errMessage(err, 'The building details could not be saved.');
    } finally {
      savingBuilding = false;
    }
  }

  async function saveOrganisation() {
    if (!organisation) return;
    const before = $portalSettings.organisation;
    savingOrg = true; savedOrg = false; error = '';
    try {
      const after = await portalSettings.saveOrganisation(organisation);
      savedOrg = true;
      logAudit('update', 'portal_setting', 'organisation', 'Business and letter details', {
        appId: 'admin', eventCategory: 'system', severity: 'info',
        beforeData: before, afterData: after,
      });
    } catch (err) {
      error = errMessage(err, 'The business details could not be saved.');
    } finally {
      savingOrg = false;
    }
  }

  $: buildingIncomplete = !!building && (!building.name.trim() || !building.short_name.trim());
  $: unsetOrg = organisation ? ORGANISATION_FIELDS.filter(({ key }) => !cleanOrganisation(organisation)[key]) : [];
</script>

<div class="space-y-6 max-w-3xl">
  {#if building === null || organisation === null}
    <LoadingSpinner text="Loading the building and business details…" />
  {:else}
    {#if error}<ErrorDisplay message={error} onDismiss={() => (error = '')} />{/if}

    <!-- ── The building ─────────────────────────────────────────────── -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
      <div>
        <h3 class="text-base font-semibold text-slate-100">The building</h3>
        <p class="text-sm text-slate-400 mt-1">
          Its name heads every report, export and letter. The short name is used where
          space is tight.
        </p>
      </div>
      <FormInput label="Building name" bind:value={building.name} required />
      <FormInput label="Short name" bind:value={building.short_name} required />
      <FormTextarea label="Address" bind:value={building.address} rows={3} />
      <div class="flex items-center justify-end gap-3">
        {#if savedBuilding}<p class="text-sm text-green-400">✓ Saved</p>{/if}
        <Button variant="primary" on:click={saveBuilding} disabled={savingBuilding || buildingIncomplete}>
          {savingBuilding ? 'Saving…' : 'Save building'}
        </Button>
      </div>
    </div>

    <!-- ── The business and the letters ────────────────────────────── -->
    <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
      <div>
        <h3 class="text-base font-semibold text-slate-100">The business, and who signs the letters</h3>
        <p class="text-sm text-slate-400 mt-1">
          Used on the letters to residents and on documents that leave the building.
          A field left empty prints as a placeholder in square brackets, to be filled in by hand.
        </p>
      </div>
      {#each ORGANISATION_FIELDS as f (f.key)}
        {#if f.multiline}
          <FormTextarea label={f.label} bind:value={organisation[f.key]} rows={3} placeholder={f.placeholder} />
        {:else}
          <FormInput label={f.label} bind:value={organisation[f.key]} placeholder={f.placeholder} />
        {/if}
      {/each}
      {#if unsetOrg.length}
        <p class="text-xs text-amber-300" data-testid="identity-unset">
          ⚠ Not set, so printed as a placeholder: {unsetOrg.map((f) => f.label).join(', ')}.
        </p>
      {/if}
      <div class="flex items-center justify-end gap-3">
        {#if savedOrg}<p class="text-sm text-green-400">✓ Saved</p>{/if}
        <Button variant="primary" on:click={saveOrganisation} disabled={savingOrg}>
          {savingOrg ? 'Saving…' : 'Save business details'}
        </Button>
      </div>
    </div>
  {/if}
</div>
