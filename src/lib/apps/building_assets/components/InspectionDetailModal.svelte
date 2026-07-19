<!-- src/lib/apps/building_assets/components/InspectionDetailModal.svelte -->
<!-- Read-only detail of a single component inspection (opened from a session row
     in InspectionsTab): type/floor header, result + meta, condition checklist,
     notes, and a photo grid with its own lightbox. Extracted from InspectionsTab
     so the tab stays focused on the session list. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { typeByCode, defsForType, conditionChecklistDisplay } from '../lookups.js';
  import { resultBadgeColor, noAccessReasonLabel } from '$lib/utils/resultConstants.js';
  import { resultLabel }      from '$lib/apps/inspection/utils/inspectionHelpers.js';
  import { fmtDateTime }      from '$lib/utils/dates';
  import Modal    from '$lib/components/common/Modal.svelte';
  import Badge    from '$lib/components/common/Badge.svelte';
  import ConditionChecklistChips from './ConditionChecklistChips.svelte';
  import PhotoLightbox from '$lib/components/common/PhotoLightbox.svelte';

  export let inspection;   // component_inspections row (includes photo_urls)
  export let group;        // component group: asset_id, label, type_code, floor_name
  export let session = null; // walk session: inspector name, session_type
  export let types    = [];
  export let attrDefs = {};

  const dispatch = createEventDispatcher();

  $: typeObj = typeByCode(types, group?.type_code);
  $: items   = conditionChecklistDisplay(inspection, defsForType(attrDefs, types, group?.type_code));
  $: result  = inspection?.inspection_result ?? inspection?.result;

  let lightboxPhotos = [];
  let lightboxIndex  = 0;
  function openLightbox(photos, i) { lightboxPhotos = photos; lightboxIndex = i; }
  function closeLightbox()         { lightboxPhotos = []; }
</script>

<Modal
  show={true}
  title="{group.asset_id ?? '?'}{group.label ? ' — ' + group.label : ''}"
  size="medium"
  on:close={() => dispatch('close')}
>
  <!-- Type + floor header -->
  <div class="id-header">
    {#if typeObj}
      <span class="id-type-chip" style="background:#{typeObj.colour}22; border-color:#{typeObj.colour}66;">
        <span class="id-type-dot" style="background:#{typeObj.colour};">{typeObj.initial}</span>
        {typeObj.name}
      </span>
    {:else}
      <span class="id-type-chip id-type-unknown">{group.type_code ?? '—'}</span>
    {/if}
    {#if group.floor_name}
      <span class="id-floor">📍 {group.floor_name}</span>
    {/if}
  </div>

  <!-- Result + meta -->
  <div class="id-result-row">
    <Badge color={resultBadgeColor(result)} size="large">
      {resultLabel(result)}
    </Badge>
    <div class="id-meta">
      <span>{fmtDateTime(inspection.inspected_at)}</span>
      {#if session?.inspector_name}
        <span class="id-inspector">by {session.inspector_name}</span>
      {:else if session?.inspector?.full_name}
        <span class="id-inspector">by {session.inspector.full_name}</span>
      {/if}
      {#if session?.session_type}
        <span class="id-stype">{session.session_type}</span>
      {/if}
    </div>
  </div>

  <!-- Why it could not be assessed -->
  {#if result === 'no_access'}
    <div class="id-section">
      <p class="id-section-lbl">Not assessed</p>
      <p class="id-noacc">⊘ {noAccessReasonLabel(inspection.no_access_reason)}
        <span class="id-noacc-note">— attended but could not assess; the component's status is unchanged.</span>
      </p>
    </div>
  {/if}

  <!-- Condition checklist -->
  {#if items.length > 0}
    <div class="id-section">
      <p class="id-section-lbl">Condition checks</p>
      <ConditionChecklistChips {items} size="sm" />
    </div>
  {/if}

  <!-- Notes -->
  {#if inspection.inspector_notes}
    <div class="id-section">
      <p class="id-section-lbl">Notes</p>
      <p class="id-notes">{inspection.inspector_notes}</p>
    </div>
  {/if}

  <!-- Photos -->
  {#if inspection.photo_urls?.length > 0}
    <div class="id-section">
      <p class="id-section-lbl">Photos ({inspection.photo_urls.length})</p>
      <div class="id-photos">
        {#each inspection.photo_urls as url, i (url)}
          <button
            class="id-photo-btn"
            on:click={() => openLightbox(inspection.photo_urls, i)}
            title="View photo {i + 1}"
          >
            <img src={url} alt="Photo {i + 1}" />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</Modal>

{#if lightboxPhotos.length > 0}
  <PhotoLightbox photos={lightboxPhotos} startIndex={lightboxIndex} on:close={closeLightbox} />
{/if}

<style>
  .id-header     { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .id-type-chip  { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; padding: 0.2rem 0.55rem; border-radius: 4px; border: 1px solid; }
  .id-type-unknown { background: rgb(71 85 105 / 0.3); border-color: rgb(71 85 105); color: rgb(156 163 175); }
  .id-type-dot   { width: 1.1rem; height: 1.1rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.6rem; font-weight: 700; color: #fff; flex-shrink: 0; }
  .id-floor      { font-size: 0.82rem; color: rgb(148 163 184); }

  .id-result-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
  .id-meta       { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.82rem; color: rgb(148 163 184); }
  .id-inspector  { color: rgb(167 139 250); }
  .id-stype      { text-transform: capitalize; color: rgb(107 114 128); font-size: 0.75rem; }

  .id-section      { margin-top: 1rem; }
  .id-section-lbl  { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: rgb(100 116 139); font-weight: 600; margin-bottom: 0.5rem; }
  .id-noacc { color: rgb(196 181 253); font-size: 0.875rem; }
  .id-noacc-note { color: rgb(148 163 184); font-size: 0.8rem; }
  .id-notes        { font-size: 0.875rem; color: rgb(226 232 240); white-space: pre-line; line-height: 1.6; background: rgb(15 23 42 / 0.4); border: 1px solid rgb(71 85 105 / 0.5); border-radius: 6px; padding: 0.75rem; }

  .id-photos       { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .id-photo-btn    { display: block; width: 6rem; height: 6rem; padding: 0; border: 2px solid rgb(71 85 105 / 0.6); border-radius: 6px; overflow: hidden; cursor: zoom-in; background: none; transition: border-color 0.15s; flex-shrink: 0; }
  .id-photo-btn:hover { border-color: rgb(148 163 184); }
  .id-photo-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
