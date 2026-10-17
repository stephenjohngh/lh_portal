<!-- src/lib/apps/parking/components/RecordSighting.svelte -->
<!-- Record a car that is not allowed where it is (migration 245): where, a
     photo, a note. The date and time are the phone's, when Save is pressed.
     It works with no signal (2026-10-17): Save keeps the record and photo on
     the phone and they are sent when there is a signal (parkingQueue.js). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { online } from '#lib/stores/online.js';
  import { compressImage } from '#lib/apps/inspection/utils/imageCompression.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { sightingStore } from '../stores/sightingStore.js';
  import { SIGHTING_PLACES } from '../utils/sightingModel.js';
  import { formatReg, normaliseReg } from '../utils/agreementModel.js';

  export let registration = '';

  const dispatch = createEventDispatcher();
  let place = '';
  let notes = '';
  /** @type {Blob|null} */
  let photo = null;
  let preview = '';
  let saving = false;
  let error = '';

  async function pickPhoto(/** @type {Event} */ e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files?.[0];
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    try { photo = await compressImage(file); }
    catch { photo = file; }                       // compression is a saving, not a need
    preview = URL.createObjectURL(photo);
    input.value = '';
  }

  async function save() {
    saving = true; error = '';
    try {
      const { sighting, queued, photoError } = await sightingStore.record({ registration, place, notes, photo });
      if (preview) URL.revokeObjectURL(preview);
      dispatch('recorded', { sighting, queued, photoError });
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'It could not be saved.')
        + ($online ? '' : ' There is no signal: keep this open and press Save again when there is.');
    } finally { saving = false; }
  }
</script>

<div class="rounded-xl border border-slate-500 bg-slate-800 p-4 space-y-3" data-testid="record-sighting">
  <p class="text-lg font-semibold text-white">Record <span class="font-mono">{formatReg(normaliseReg(registration))}</span></p>

  <fieldset class="flex gap-2">
    <legend class="sr-only">Where is it?</legend>
    {#each Object.entries(SIGHTING_PLACES) as [value, label]}
      <label class="flex-1 min-h-[48px] flex items-center justify-center rounded-lg border cursor-pointer text-base
        {place === value ? 'border-purple-400 bg-purple-900/40 text-white' : 'border-slate-600 text-slate-300'}">
        <input type="radio" class="sr-only" bind:group={place} {value} /> {label}
      </label>
    {/each}
  </fieldset>

  <label class="relative flex min-h-[48px] items-center justify-center rounded-lg border border-slate-500 text-slate-200 cursor-pointer">
    📷 {photo ? 'Take the photo again' : 'Take a photo'}
    <input type="file" accept="image/*" capture="environment" class="absolute inset-0 opacity-0" on:change={pickPhoto} />
  </label>
  {#if preview}<img src={preview} alt="The car" class="w-full rounded-lg" />{/if}

  <label class="block">
    <span class="text-sm text-slate-300">Notes</span>
    <textarea bind:value={notes} rows="3" placeholder="Where exactly, what it was doing, any note left…"
      class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 p-2 text-base"></textarea>
  </label>

  {#if error}<p class="text-sm text-amber-300" role="alert">{error}</p>{/if}

  <div class="flex gap-2">
    <button type="button" on:click={save} disabled={saving || !place}
      class="flex-1 min-h-[52px] rounded-lg bg-purple-600 text-white text-lg font-semibold disabled:opacity-40">
      {saving ? 'Saving…' : 'Save'}</button>
    <button type="button" on:click={() => dispatch('cancel')} disabled={saving}
      class="min-h-[52px] px-4 rounded-lg border border-slate-500 text-slate-200">Cancel</button>
  </div>
  {#if !place}<p class="text-xs text-slate-400">Choose where the car is. The date and time are added when you press Save.</p>{/if}
</div>
