<!-- src/lib/apps/walk/components/WalkDoorInspectionPanel.svelte -->
<!-- Enhanced door inspection with checklist.
     Photo capture/upload and result/notes/save are handled by WalkResultSection. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import WalkResultSection from './WalkResultSection.svelte';
  import WalkCheckbox     from './common/WalkCheckbox.svelte';

  const logger = getLogger('WalkDoorInspectionPanel');
  const dispatch = createEventDispatcher();

  export let element;
  export let session;

  // Bound to WalkResultSection
  let result   = null;
  let notes    = '';
  let photoUrl = null;

  // Checklist — door-specific
  let checklist = { frame: false, seals: false, glass: false };

  let saving      = false;
  let uploadError = null;

  async function handleSave() {
    saving = true; uploadError = null;
    try {
      // Prepend checklist items to notes
      let combinedNotes = notes;
      const checked = [
        checklist.frame && 'Frame ✓',
        checklist.seals && 'Seals ✓',
        checklist.glass && 'Glass ✓'
      ].filter(Boolean);
      if (checked.length) {
        const checklistText = `Checked: ${checked.join(', ')}`;
        combinedNotes = notes ? `${checklistText}\n${notes}` : checklistText;
      }

      await walkStore.recordInspection({ elementId: element.id, result, notes: combinedNotes, photoUrl });
      dispatch('saved');
    } catch (err) {
      logger('Save failed:', err);
      uploadError = err.message;
    } finally {
      saving = false;
    }
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="dip">
  <div class="dip-hdr">
    <button class="back-btn" on:click={handleCancel}>← BACK</button>
    <div class="dip-title">DOOR INSPECTION</div>
  </div>

  <div class="dip-body">

    <!-- Element info -->
    <div class="element-info">
      <div class="element-id">{element.asset_id || element.element_type}</div>
      {#if element.subtype}<div class="element-sub">{element.subtype}</div>{/if}
    </div>

    <!-- Checklist — door-specific -->
    <div class="section">
      <div class="section-label">INSPECTION CHECKLIST</div>
      <div class="checklist">
        <WalkCheckbox bind:checked={checklist.frame} label="Frame" />
        <WalkCheckbox bind:checked={checklist.seals} label="Seals" />
        <WalkCheckbox bind:checked={checklist.glass} label="Glass" />
      </div>
    </div>

    <!-- Shared: result buttons, photo, notes, error, save -->
    <WalkResultSection
      bind:result
      bind:notes
      bind:photoUrl
      {session}
      {element}
      saving={saving}
      error={uploadError}
      notesLabel="NOTES (OPTIONAL)"
      notesRows={3}
      placeholder="Any observations…"
      saveLabel="✓ SAVE INSPECTION"
      on:save={handleSave}
    />

  </div>
</div>

<style>
  .dip {
    display: flex; flex-direction: column; flex: 1;
    background: #0d0d14; color: #f0f0f0;
    font-family: 'DM Mono', 'Courier New', monospace;
    overflow-y: auto; padding-bottom: 2rem;
  }

  .dip-hdr {
    display: flex; align-items: center; gap: 1rem;
    padding: 1rem 1.25rem; border-bottom: 1px solid #2e2e42;
    position: sticky; top: 0; background: #111122; z-index: 5;
  }
  .back-btn {
    background: none; border: none; color: #fb923c;
    font-family: inherit; font-size: 0.875rem; font-weight: 700;
    cursor: pointer; padding: 0;
  }
  .back-btn:hover { color: #fdba74; }
  .dip-title {
    font-size: 0.75rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700;
  }

  .dip-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.5rem; }

  .element-info {
    background: #111122; border: 2px solid #2e2e42; border-radius: 10px; padding: 1rem;
  }
  .element-id  { font-size: 1.25rem; font-weight: 800; color: #fb923c; }
  .element-sub { font-size: 0.875rem; color: #ccc; margin-top: 0.25rem; }

  .section       { display: flex; flex-direction: column; gap: 0.75rem; }
  .section-label { font-size: 0.62rem; letter-spacing: 0.2em; color: #ccc; }

  /* Checklist */
  .checklist { display: flex; flex-direction: column; gap: 0.5rem; }
</style>
