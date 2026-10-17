<!-- src/lib/apps/parking/components/SightingHistory.svelte -->
<!-- A car's earlier unauthorised-parking sightings (migration 245): when, where,
     the note and the photo. Shown under Car check's answer, whatever it is. -->
<script>
  import PhotoLightbox from '#lib/components/common/PhotoLightbox.svelte';
  import { normalisePhotoUrl } from '#lib/utils/driveUtils.js';
  import { fmtDateTime } from '#lib/utils/dates.js';
  import { SIGHTING_PLACES } from '../utils/sightingModel.js';

  /** @type {Array<{ id: string, place: string, seen_at: string, notes: string|null, photos: string[] }>} */
  export let sightings = [];

  /** @type {string[]|null} */
  let viewing = null;
</script>

{#if sightings.length}
  <div class="text-sm border-t border-white/10 pt-2" data-testid="sighting-history">
    <p class="text-white font-semibold">Seen here before — {sightings.length} time{sightings.length === 1 ? '' : 's'}</p>
    <ul class="mt-1 space-y-2">
      {#each sightings as s (s.id)}
        <li class="flex gap-2">
          {#if s.photos?.length}
            <button type="button" class="shrink-0" on:click={() => (viewing = s.photos.map(normalisePhotoUrl))}
              title="Show the photo">
              <img src={normalisePhotoUrl(s.photos[0])} alt="Car" class="h-12 w-16 object-cover rounded border border-white/20" />
            </button>
          {/if}
          <span>
            <span class="block text-slate-100">{fmtDateTime(s.seen_at)} · {SIGHTING_PLACES[s.place] ?? s.place}</span>
            {#if s.notes}<span class="block text-xs text-slate-300 whitespace-pre-line">{s.notes}</span>{/if}
          </span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

{#if viewing}
  <PhotoLightbox photos={viewing} on:close={() => (viewing = null)} />
{/if}
