<!-- src/lib/apps/inspection/components/InspectionPanel.svelte -->
<!-- Single inspection panel for any component type.
     Dynamically renders the condition attributes (checkable=true) for this
     component's type. -->

<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { inspectionStore }  from '../stores/inspectionStore.js';
  import { resultLabel }  from '../utils/inspectionHelpers.js';
  import { buildComponentRef } from '$lib/utils/componentRef.js';
  import { noAccessReasonLabel } from '$lib/utils/resultConstants.js';
  import { applyChecklistMode } from '../utils/checklistRules.js';
  import { fmtDate, fmtTime } from '$lib/utils/dates';
  import InspectionResultSection from './InspectionResultSection.svelte';
  import WalkButton         from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import WalkSpinner        from '$lib/apps/inspection/components/common/WalkSpinner.svelte';
  import WalkBadge          from '$lib/apps/inspection/components/common/WalkBadge.svelte';
  import WalkPhotoLightbox  from '$lib/apps/inspection/components/common/WalkPhotoLightbox.svelte';

  const logger   = getLogger('InspectionPanel');
  const dispatch = createEventDispatcher();

  export let component;   // current components row
  export let floor;       // current floors row
  export let type;        // component_types row for this component
  export let plan  = null; // component's plan (if placed) — for the 📍 button
  export let session;     // active walk_sessions row

  $: attrDefs      = $inspectionStore.attrDefs;
  $: allTypes      = $inspectionStore.types;
  $: componentRef  = component
    ? buildComponentRef(component, $inspectionStore.floors, allTypes)
    : '?';

  // The definition driving this session (null for ad-hoc / repair sessions) —
  // its checklist_mode narrows the checklist, its pass_fail_rule may make the
  // derived result binding.
  $: definition   = session?._walk?.definition ?? null;
  $: passFailRule = definition?.pass_fail_rule ?? 'manual';

  // Checkable attrs for this component's type, narrowed by the definition's
  // checklist_mode ('explicit' keeps only its checklist_attr_ids).
  $: typeId         = allTypes.find(t => t.code === component?.type_code)?.id ?? null;
  $: checklistDefs  = applyChecklistMode(
    typeId ? (attrDefs[typeId] ?? []).filter(d => d.checkable) : [],
    definition,
  );

  // Form state
  let result           = '';
  let notes            = '';
  /** @type {Record<string, boolean|undefined>} */
  let checklistResults = {};
  /** @type {string[]} */
  let photoUrls        = [];
  /** @type {Array<{ blob: Blob, filename: string, folderPath: string[] }>} */
  let photoBlobs       = [];   // captured-but-not-uploaded; queued by recordInspection
  /** @type {string|null} */
  let noAccessReason   = null;
  /** @type {Record<string, string|number>} */
  let readings         = {};   // G2: structured text/number readings
  let saving           = false;
  let error            = null;

  // History
  /** @type {any[]} */
  let history     = [];
  let histLoading = true;

  // Reset when component changes
  $: component, resetForm();
  function resetForm() {
    result = ''; notes = ''; checklistResults = {}; photoUrls = []; photoBlobs = [];
    noAccessReason = null; readings = {}; error = null;
  }

  onMount(async () => {
    await loadHistory();
  });

  $: component?.id, loadHistory();
  async function loadHistory() {
    if (!component?.id) return;
    histLoading = true;
    history = await inspectionStore.loadComponentInspectionHistory(component.id);
    histLoading = false;
  }

  async function handleSave() {
    if (!result) { error = 'Select a result first.'; return; }
    saving = true; error = null;
    try {
      await inspectionStore.recordInspection({
        componentId:      component.id,
        result,
        notes,
        photoUrls,
        photoBlobs,
        checklistResults,
        noAccessReason,
        readings,
      });
      dispatch('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger('❌ recordInspection:', msg);
      error = msg;
    } finally {
      saving = false;
    }
  }

  function resultColor(r) {
    return { ok:'green', failed:'red', problem:'amber', inactive:'grey' }[r] ?? 'grey';
  }

  // Lightbox for history photos
  let lightboxPhotos = [];
  let lightboxIndex  = 0;
  function openLightbox(photos, i) { lightboxPhotos = photos; lightboxIndex = i; }
  function closeLightbox()         { lightboxPhotos = []; }
</script>

<div class="ip">
  <!-- Back on its own line, above the component block -->
  <div class="ip-back">
    <WalkButton variant="ghost" size="sm" on:click={() => dispatch('cancel')}>← Back</WalkButton>
  </div>

  <!-- Component block — same shape as the walk card (ref, then type + label,
       📍 on the right); no coloured dot, since the ref carries the type initial. -->
  <div class="ip-cid">
    <div class="cid-info">
      <div class="cref">{componentRef}</div>
      <div class="cmeta">
        {#if type}<span class="ctype-name">{type.name}</span>{/if}
        {#if component?.label}<span class="clabel">{component.label}</span>{/if}
      </div>
    </div>
    <button class="plan-btn" on:click={() => dispatch('showplan')}
      disabled={!plan}
      title={plan ? 'Show on floor plan' : 'Component not placed on a plan'}>
      📍
    </button>
  </div>

  <div class="ip-body">
    <InspectionResultSection
      bind:result
      bind:notes
      bind:checklistResults
      bind:photoUrls
      bind:photoBlobs
      bind:noAccessReason
      bind:readings
      {checklistDefs}
      {passFailRule}
      {saving}
      {error}
      {session}
      {component}
      {floor}
      {type}
      on:save={handleSave}
    />

    <!-- -- History -------------------------------------------------------------- -->
    {#if histLoading}
      <WalkSpinner />
    {:else if history.length > 0}
      <div class="hist-sec">
        <div class="hist-title">PREVIOUS INSPECTIONS</div>
        <div class="hist-list">
          {#each history.slice(0, 5) as h (h.id)}
            <div class="hist-row">
              <WalkBadge color={resultColor(h.inspection_result)}>{resultLabel(h.inspection_result)}</WalkBadge>
              <div class="hist-body">
                <div class="hist-date">{fmtDate(h.inspected_at)} {fmtTime(h.inspected_at)}</div>
                {#if h.session?.session_name}<div class="hist-sess">{h.session.session_name}</div>{/if}
                {#if h.inspection_result === 'no_access'}
                  <div class="hist-noacc">⊘ Not assessed — {noAccessReasonLabel(h.no_access_reason)}</div>
                {/if}
                {#if h.inspector_notes}<div class="hist-notes">{h.inspector_notes}</div>{/if}
                {#if h.photo_urls?.length > 0}
                  <div class="hist-photos">
                    {#each h.photo_urls as url, i (url)}
                      <button
                        class="hist-photo-btn"
                        on:click={() => openLightbox(h.photo_urls, i)}
                        title="View photo {i + 1}"
                      >
                        <img src={url} alt="Photo {i+1}" />
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

{#if lightboxPhotos.length > 0}
  <WalkPhotoLightbox
    photos={lightboxPhotos}
    startIndex={lightboxIndex}
    on:close={closeLightbox}
  />
{/if}

<style>
  .ip { display:flex; flex-direction:column; min-height:calc(100vh - 64px); background:#0d0d14; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; }
  .ip-back { padding:0.75rem 1rem; background:#111122; border-bottom:1px solid #1a1a2e; }
  /* Mirrors the walk card's .cid/.cref/.cmeta block + 📍 on the right */
  .ip-cid { display:flex; align-items:center; gap:0.875rem; padding:0.875rem 1.25rem 1rem; background:#111122; border-bottom:1px solid #2e2e42; }
  .cid-info { flex:1; min-width:0; }
  .cref   { font-size:1.25rem; font-weight:700; color:#f0f0f0; font-variant-numeric:tabular-nums; letter-spacing:0.02em; }
  .cmeta  { display:flex; align-items:baseline; gap:0.5rem; margin-top:0.15rem; min-width:0; }
  .ctype-name { font-size:0.72rem; color:#888; flex-shrink:0; }
  .clabel { font-size:0.72rem; color:#fb923c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .plan-btn { padding:0.875rem; background:#111122; border:1px solid #2e2e42; border-radius:8px; color:#aaa; font-family:inherit; font-size:0.78rem; cursor:pointer; transition:all 0.15s; flex-shrink:0; }
  .plan-btn:hover:not(:disabled) { border-color:#fb923c; color:#fb923c; }
  .plan-btn:disabled { opacity:0.3; cursor:not-allowed; }
  .ip-body { padding:1.25rem; display:flex; flex-direction:column; gap:1.5rem; flex:1; }
  .hist-sec   { margin-top:0.5rem; }
  .hist-title { font-size:0.62rem; letter-spacing:0.2em; color:#888; margin-bottom:0.75rem; }
  .hist-list  { display:flex; flex-direction:column; gap:0.75rem; }
  .hist-row   { display:flex; align-items:flex-start; gap:0.75rem; }
  .hist-body  { flex:1; min-width:0; }
  .hist-date  { font-size:0.7rem; color:#ccc; }
  .hist-sess  { font-size:0.68rem; color:#888; }
  .hist-notes { font-size:0.75rem; color:#ddd; font-style:italic; margin-top:0.2rem; }
  .hist-noacc { font-size:0.72rem; color:#c4b5fd; margin-top:0.15rem; }
  .hist-photos    { display:flex; gap:0.3rem; margin-top:0.35rem; flex-wrap:wrap; }
  .hist-photo-btn { display:block; width:3rem; height:3rem; padding:0; border:1px solid #2e2e42; border-radius:4px; overflow:hidden; cursor:zoom-in; background:none; transition:border-color 0.15s; }
  .hist-photo-btn:hover { border-color:#fb923c; }
  .hist-photo-btn img { width:100%; height:100%; object-fit:cover; display:block; }
</style>
