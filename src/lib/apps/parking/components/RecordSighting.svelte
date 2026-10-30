<!-- src/lib/apps/parking/components/RecordSighting.svelte -->
<!-- Record a car that is not allowed where it is (migration 245): where, a
     photo, a note. The date and time are the phone's, when Save is pressed.
     It works with no signal (2026-10-17): Save keeps the record and photo on
     the phone and they are sent when there is a signal (parkingQueue.js). -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import { online } from '#lib/stores/online.js';
  import { compressImage } from '#lib/apps/inspection/utils/imageCompression.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { sightingStore } from '../stores/sightingStore.js';
  import { SIGHTING_PLACES } from '../utils/sightingModel.js';
  import { formatReg, normaliseReg } from '../utils/agreementModel.js';

  export let registration = '';
  /** Where the car is — chosen on Car check before checking (2026-10-17). */
  export let place = '';
  /** Starts the note: e.g. that the car has a permit for the OTHER place. */
  export let prefillNotes = '';

  const dispatch = createEventDispatcher();
  // A known detail starts the note BELOW a blank first line, so the person can
  // type their own text above it (2026-10-25); a blank line left there is dropped on save.
  let notes = prefillNotes ? `\n${prefillNotes}` : '';
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
      const { sighting, queued, photoError } = await sightingStore.record({ registration, place, notes: notes.replace(/^(\s*\n)+/, ''), photo });
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

  <p class="text-sm text-slate-300">Where: <span class="text-white font-semibold">{SIGHTING_PLACES[place] ?? '—'}</span></p>

  <label class="relative flex min-h-[48px] items-center justify-center rounded-lg border border-slate-500 text-slate-200 cursor-pointer">
    📷 {photo ? 'Take the photo again' : 'Take a photo'}
    <input type="file" accept="image/*" capture="environment" class="absolute inset-0 opacity-0" on:change={pickPhoto} />
  </label>
  {#if preview}<img src={preview} alt="The car" class="w-full rounded-lg" />{/if}

  <label class="block">
    <span class="text-sm text-slate-300">Notes</span>
    <textarea bind:value={notes} rows="4" on:focus={(e) => { if (notes.startsWith('\n')) e.currentTarget.setSelectionRange(0, 0); }} placeholder="Where exactly, what it was doing, any note left…"
      class="mt-1 w-full rounded-lg bg-slate-900 border border-slate-600 p-2 text-base"></textarea>
  </label>

  {#if error}<p class="text-sm text-amber-300" role="alert">{error}</p>{/if}

  <div class="flex gap-2">
    <Button variant="primary" size="large" disabled={saving || !place} on:click={save}>{saving ? 'Saving…' : 'Save'}</Button>
    <Button variant="tertiary" size="xs" disabled={saving} on:click={() => dispatch('cancel')}>Cancel</Button>
  </div>
  <p class="text-xs text-slate-400">The date and time are added when you press Save.</p>
</div>
