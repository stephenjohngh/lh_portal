<!-- src/lib/apps/walk/components/WalkInspectionPanel.svelte -->
<!-- Record an inspection result for non-door elements.
     Photo capture/upload is handled by WalkResultSection. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { getElementDisplayName } from '$lib/utils/planConstants';
  import { fmtDateTime } from '$lib/utils/dates';
  import WalkResultSection from './WalkResultSection.svelte';
  import WalkSpinner      from './common/WalkSpinner.svelte';
  import WalkError from './common/WalkError.svelte';

  const logger   = getLogger('WalkInspectionPanel');
  const dispatch = createEventDispatcher();

  export let element;
  export let session;
  // For building-wide sessions session.floor_level is NULL — the parent (WalkSession)
  // should pass $walkStore.currentFloor here so the header shows the correct floor.
  export let floorLevel = session?.floor_level ?? null;

  let result         = '';
  let notes          = '';
  let photoUrl       = null;
  let saving         = false;
  let error          = null;
  let history        = [];
  let loadingHistory = true;

  onMount(async () => {
    history = await walkStore.loadElementInspectionHistory(element.id);
    loadingHistory = false;
  });

  $: displayName = getElementDisplayName(element, floorLevel);

  async function handleSave() {
    if (!result) return;
    saving = true; error = null;
    try {
      await walkStore.recordInspection({ elementId: element.id, result, notes, photoUrl });
      dispatch('saved');
    } catch (err) {
      logger('Save failed:', err.message);
      error = err.message;
    } finally { saving = false; }
  }
</script>

<div class="ip">

  <div class="ip-hdr">
    <button class="back-btn" on:click={() => dispatch('cancel')}>← Back</button>
    <div class="ip-name-block">
      <div class="ip-name">{displayName}</div>
      {#if element.label}<div class="ip-label">{element.label}</div>{/if}
    </div>
  </div>

  <div class="ip-body">

    <WalkResultSection
      bind:result
      bind:notes
      bind:photoUrl
      {session}
      {element}
      {saving}
      {error}
      on:save={handleSave}
    />

    <!-- Inspection History -->
    <div class="sec">
      <div class="sec-lbl">INSPECTION HISTORY</div>
      {#if loadingHistory}
        <WalkSpinner size="sm" text="Loading…" />
      {:else if history.length === 0}
        <div class="hist-msg">No previous inspections recorded for this element.</div>
      {:else}
        <div class="hist-list">
          {#each history as rec}
            <div class="hist-item hist-{rec.inspection_result}">
              <div class="hist-hdr">
                <div class="hist-result">
                  {rec.inspection_result === 'OK'     ? '✓ PASS'   :
                   rec.inspection_result === 'failed' ? '✗ FAIL'   :
                   rec.inspection_result === 'problem'? '⚙ PROBLEM' : '— INACTIVE'}
                </div>
                <div class="hist-date">{fmtDateTime(rec.inspected_at)}</div>
              </div>
              {#if rec.inspector?.full_name}
                <div class="hist-who">by {rec.inspector.full_name}</div>
              {/if}
              {#if rec.inspector_notes}
                <div class="hist-notes">{rec.inspector_notes}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

  </div>
</div>

<style>
  .ip {
    display: flex; flex-direction: column; flex: 1;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    overflow-y: auto; padding-bottom: 2rem;
  }

  .ip-hdr {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42;
    position: sticky; top: 0; background: #111122; z-index: 5;
  }
  .back-btn {
    background: none; border: none; color: #fb923c;
    font-family: inherit; font-size: 0.875rem; font-weight: 700;
    cursor: pointer; padding: 0; white-space: nowrap;
  }
  .back-btn:hover { color: #fdba74; }
  .ip-name-block { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .ip-name  { font-size: 0.95rem; color: #f0f0f0; font-weight: 700; letter-spacing: 0.04em; }
  .ip-label { font-size: 0.75rem; color: #fb923c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .ip-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.5rem; }

  .sec     { display: flex; flex-direction: column; gap: 0.75rem; }
  .sec-lbl { font-size: 0.62rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }

  .hist-msg  { font-size: 0.8rem; color: #ccc; padding: 0.5rem 0; }
  .hist-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .hist-item {
    padding: 0.875rem 1rem; border-radius: 8px;
    border: 1px solid #2e2e42; background: #111122;
  }
  .hist-hdr    { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.25rem; }
  .hist-result { font-size: 0.85rem; font-weight: 700; letter-spacing: 0.06em; }
  .hist-pass   .hist-result { color: #4ade80; }
  .hist-fail   .hist-result { color: #f87171; }
  .hist-repair .hist-result { color: #fb923c; }
  .hist-na     .hist-result { color: #ccc; }
  .hist-date  { font-size: 0.68rem; color: #ccc; }
  .hist-who   { font-size: 0.72rem; color: #fb923c; margin-bottom: 0.25rem; }
  .hist-notes { font-size: 0.8rem; color: #eee; line-height: 1.4; }
</style>
