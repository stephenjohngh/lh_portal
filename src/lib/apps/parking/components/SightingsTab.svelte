<!-- src/lib/apps/parking/components/SightingsTab.svelte -->
<!-- Parking → Unauthorised parking (migration 245, 2026-10-17): every car
     recorded from Car check as not allowed where it was — when, where, the
     registration, the note, the photo and who recorded it — newest first, with
     how many times each car has been seen. A sighting recorded in error can be
     deleted by an admin; its photo file goes first. -->
<script>
  import { onMount } from 'svelte';
  import { sightingStore } from '../stores/sightingStore.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { fmtDateTime } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
  import { formatReg } from '../utils/agreementModel.js';
  import { SIGHTING_PLACES } from '../utils/sightingModel.js';
  import Button from '#lib/components/common/Button.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import PhotoLightbox from '#lib/components/common/PhotoLightbox.svelte';

  let ready = false;
  let error = '';
  let q = '';
  let place = '';
  /** @type {string[]|null} */
  let viewing = null;
  /** @type {any} */
  let pendingDelete = null;
  let deleting = false;

  onMount(async () => {
    try { await Promise.all([sightingStore.load(), profilesStore.load()]); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the unauthorised parking records.'); }
    finally { ready = true; }
  });

  const nameOf = (/** @type {any[]} */ list, /** @type {string|null} */ id) => list.find((p) => p.id === id)?.full_name ?? '';

  $: all = $sightingStore.sightings;
  // How many times each car has been recorded — a repeat is the point of keeping these.
  $: timesSeen = all.reduce((m, s) => m.set(s.registration, (m.get(s.registration) ?? 0) + 1), new Map());
  $: shown = all.filter((s) => (!place || s.place === place)
    && matchesSearch([s.registration, formatReg(s.registration), s.notes, nameOf($profiles.list, s.created_by)], q));

  async function confirmDelete() {
    const id = pendingDelete.id;
    deleting = true; error = '';
    try { await sightingStore.remove(id); pendingDelete = null; }
    catch (/** @type {any} */ err) { error = errMessage(err, 'It could not be deleted.'); pendingDelete = null; }
    finally { deleting = false; }
  }
</script>

{#if !ready}
  <LoadingSpinner text="Loading unauthorised parking…" />
{:else}
  <div class="space-y-3">
    <p class="text-sm text-slate-400">Cars recorded from <a href="/parking/check" target="_blank" rel="noopener" class="underline">Car check ↗</a> as not allowed
      where they were. A record is a sighting — the car may yet prove to have been allowed.</p>
    <ErrorDisplay message={error || $sightingStore.error || ''} onDismiss={() => (error = '')} />

    <div class="flex flex-wrap gap-2 items-center">
      <input bind:value={q} placeholder="Search registration, note, who…" aria-label="Search unauthorised parking"
        class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-64" />
      <select bind:value={place} aria-label="Where" class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
        <option value="">Anywhere</option>
        {#each Object.entries(SIGHTING_PLACES) as [value, label]}<option {value}>{label}</option>{/each}
      </select>
      <span class="text-xs text-slate-500">{shown.length} of {all.length}</span>
    </div>

    {#if all.length === 0}
      <p class="text-sm text-slate-400">Nothing recorded yet.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm" data-testid="sightings-table">
          <thead class="text-left text-xs uppercase text-slate-500">
            <tr><th class="px-3 py-2">When</th><th class="px-3 py-2">Registration</th><th class="px-3 py-2">Where</th>
              <th class="px-3 py-2">Notes</th><th class="px-3 py-2">Photo</th><th class="px-3 py-2">Recorded by</th><th></th></tr>
          </thead>
          <tbody>
            {#each shown as s (s.id)}
              <tr class="border-t border-slate-700 align-top">
                <td class="px-3 py-2 whitespace-nowrap">{fmtDateTime(s.seen_at)}</td>
                <td class="px-3 py-2 whitespace-nowrap">
                  <span class="font-mono text-white">{formatReg(s.registration)}</span>
                  {#if (timesSeen.get(s.registration) ?? 0) > 1}
                    <span class="ml-1 text-xs rounded-full bg-red-900/50 text-red-300 px-2">seen {timesSeen.get(s.registration)}×</span>
                  {/if}
                </td>
                <td class="px-3 py-2">{SIGHTING_PLACES[s.place] ?? s.place}</td>
                <td class="px-3 py-2 whitespace-pre-line text-slate-300">{s.notes ?? ''}</td>
                <td class="px-3 py-2">
                  {#if s.photos?.length}
                    <Button variant="plain" type="button" on:click={() => (viewing = s.photos.map(normalisePhotoUrl))} title="Show the photo"><img src={normalisePhotoUrl(s.photos[0])} alt="Car" class="h-12 w-16 object-cover rounded border border-slate-600" /></Button>
                  {:else}<span class="text-slate-600">—</span>{/if}
                </td>
                <td class="px-3 py-2 text-slate-300">{nameOf($profiles.list, s.created_by) || '—'}</td>
                <td class="px-3 py-2 text-right">
                  {#if $permissions.isAdmin}
                    <Button admin variant="danger" size="xs" on:click={() => (pendingDelete = s)}>Delete</Button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/if}

{#if viewing}<PhotoLightbox photos={viewing} on:close={() => (viewing = null)} />{/if}

<ConfirmDialog show={!!pendingDelete} danger={true} processing={deleting}
  title="Delete this record?"
  message={pendingDelete ? `Delete the ${fmtDateTime(pendingDelete.seen_at)} record of ${formatReg(pendingDelete.registration)}, and its photo? This cannot be undone.` : ''}
  confirmText="Delete" on:confirm={confirmDelete} on:cancel={() => (pendingDelete = null)} />
