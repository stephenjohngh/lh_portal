<!-- src/lib/apps/inspection/components/InspectionResultSection.svelte -->
<!-- Result selection, dynamic checklist, multi-photo capture, notes, save.
     Supports up to 4 photos per inspection. photo_urls is an array.
     Photo capture/display is delegated to PhotoPanel; this component owns
     pendingPhotos state so uploadAllPending() can run at save time. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { uploadToSupabase } from '$lib/apps/inspection/utils/supabaseUpload';
  import { uploadToGoogleDrive } from '$lib/apps/inspection/utils/googleDriveUpload';
  import WalkTextarea from '$lib/apps/inspection/components/common/WalkTextarea.svelte';
  import WalkError    from '$lib/apps/inspection/components/common/WalkError.svelte';
  import WalkButton   from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import PhotoPanel   from './PhotoPanel.svelte';

  const logger   = getLogger('InspectionResultSection');
  const dispatch = createEventDispatcher();

  // Two-way bindable
  export let result           = '';
  export let notes            = '';
  export let checklistResults = {};   // { type_attribute_id: boolean }
  export let photoUrls        = [];   // already-uploaded URLs (array)

  // One-way from parent
  export let checklistDefs = [];   // type_attributes with checkable=true for this component's type
  export let saving        = false;
  export let error         = null;
  export let session       = null;
  export let component     = null;
  export let saveLabel     = 'RECORD INSPECTION';

  $: canSave = !!result;

  // -- Checklist help popup -----------------------------------------------------
  let activeHelpId = null;
  function toggleHelp(id) { activeHelpId = activeHelpId === id ? null : id; }

  // -- Split checklist into pass/fail vs text/number input attrs ----------------
  $: passFailDefs = checklistDefs.filter(d => d.display_type !== 'text' && d.display_type !== 'number');
  $: inputDefs    = checklistDefs.filter(d => d.display_type === 'text' || d.display_type === 'number');

  // Reset text/number input values whenever the component changes (checklistDefs changes)
  let inputValues = {};
  $: checklistDefs, inputValues = {};

  // -- Checklist reactive logic -------------------------------------------------
  // Only pass/fail attrs drive the result. The "Failed: X, Y" line is kept
  // in autoFailNote (never written into the notes textarea) so that user-typed
  // notes and text/number readings are never overwritten by reactive changes.
  // All parts are assembled into the final notes only inside handleSaveClick.
  let autoFailNote = '';
  $: if (passFailDefs.length > 0) {
    const anyFail = passFailDefs.some(d => checklistResults[d.id] === false);
    const allPass = passFailDefs.every(d => checklistResults[d.id] === true);
    if (anyFail) {
      result = 'failed';
      const failedNames = passFailDefs
        .filter(d => checklistResults[d.id] === false)
        .map(d => d.name);
      autoFailNote = 'Failed: ' + failedNames.join(', ');
    } else if (allPass) {
      result = 'ok';
      autoFailNote = '';
    } else {
      autoFailNote = '';
    }
  }

  // -- Photo state --------------------------------------------------------------
  // PhotoPanel owns the camera/capture UI; this component owns pendingPhotos
  // so that uploadAllPending() can run as part of the save flow here.
  let pendingPhotos = [];   // { blob, preview, uploading, error }

  async function uploadAllPending() {
    const uploaded = [];
    for (let i = 0; i < pendingPhotos.length; i++) {
      const p = pendingPhotos[i];
      pendingPhotos[i] = { ...p, uploading: true };
      pendingPhotos = [...pendingPhotos];
      try {
        const sessionName = session?.session_name || session?.building || 'session';
        const compName    = component?.asset_id || component?.id?.slice(0, 8) || 'comp';
        const fileName    = `${compName}_${Date.now()}_${i}.jpg`;
        let url;
        try {
          url = await uploadToSupabase(p.blob, fileName, session?.id);
        } catch {
          url = await uploadToGoogleDrive(p.blob, fileName, sessionName);
        }
        uploaded.push(url);
        pendingPhotos[i] = { ...pendingPhotos[i], uploading: false };
        pendingPhotos = [...pendingPhotos];
      } catch (err) {
        logger('❌ Photo upload failed:', err);
        pendingPhotos[i] = { ...pendingPhotos[i], uploading: false, error: 'Upload failed — photo omitted.' };
        pendingPhotos = [...pendingPhotos];
      }
    }
    return uploaded;
  }

  async function handleSaveClick() {
    // Build final notes from three independent parts — none clobbers the others:
    //   1. autoFailNote  — "Failed: AttrA, AttrB" (from pass/fail checklist reactive)
    //   2. inputLines    — "AttrName: value" per text/number reading
    //   3. notes         — whatever the user typed in the Notes textarea
    const inputLines = inputDefs
      .filter(d => inputValues[d.id] !== undefined && String(inputValues[d.id]).trim() !== '')
      .map(d => `${d.name}: ${String(inputValues[d.id]).trim()}`);

    const parts = [
      autoFailNote,
      inputLines.join('\n'),
      notes.trim(),
    ].filter(Boolean);
    notes = parts.join('\n');

    const newUrls = await uploadAllPending();
    photoUrls     = [...photoUrls, ...newUrls];
    // Clear pending (successful ones now in photoUrls; keep only those that errored)
    pendingPhotos = pendingPhotos.filter(p => !!p.error);
    dispatch('save');
  }

  $: uploading = pendingPhotos.some(p => p.uploading);
</script>

<!-- -- Dynamic checklist — PASS / FAIL per attribute --------------------------- -->
{#if passFailDefs.length > 0}
  <div class="sec">
    <div class="sec-lbl">CONDITION CHECKS</div>
    <div class="checklist">
      {#each passFailDefs as def (def.id)}
        <div class="cl-item">
          <div class="cl-row">
            <span class="cl-label">
              {def.name}
              {#if def.help_notes}
                <button class="cl-help-btn" class:cl-help-active={activeHelpId === def.id}
                  on:click={() => toggleHelp(def.id)} title="Show guidance">ⓘ</button>
              {/if}
            </span>
            <div class="cl-btns">
              <button
                class="cl-btn cl-pass"
                class:cl-sel-pass={checklistResults[def.id] === true}
                on:click={() => checklistResults = { ...checklistResults, [def.id]: true }}
              >✓ PASS</button>
              <button
                class="cl-btn cl-fail"
                class:cl-sel-fail={checklistResults[def.id] === false}
                on:click={() => checklistResults = { ...checklistResults, [def.id]: false }}
              >✗ FAIL</button>
            </div>
          </div>
          {#if def.help_notes && activeHelpId === def.id}
            <div class="cl-help-popup">{def.help_notes}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- -- Text / number attrs — recorded as notes on save ------------------------- -->
{#if inputDefs.length > 0}
  <div class="sec">
    <div class="sec-lbl">READINGS</div>
    <div class="checklist">
      {#each inputDefs as def (def.id)}
        <div class="cl-item">
          <div class="cl-row cl-row-input">
            <span class="cl-label">
              {def.name}
              {#if def.help_notes}
                <button class="cl-help-btn" class:cl-help-active={activeHelpId === def.id}
                  on:click={() => toggleHelp(def.id)} title="Show guidance">ⓘ</button>
              {/if}
            </span>
            <input
              class="cl-input"
              type={def.display_type === 'number' ? 'number' : 'text'}
              placeholder={def.display_type === 'number' ? '0' : '—'}
              bind:value={inputValues[def.id]}
            />
          </div>
          {#if def.help_notes && activeHelpId === def.id}
            <div class="cl-help-popup">{def.help_notes}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- -- Result buttons ----------------------------------------------------------- -->
<div class="sec">
  <div class="sec-lbl">INSPECTION RESULT</div>
  <div class="result-grid">
    <button class="rb r-pass"   class:sel={result === 'ok'}       on:click={() => result = 'ok'}>
      <span class="ri">✓</span><span class="rl">PASS</span>
    </button>
    <button class="rb r-fail"   class:sel={result === 'failed'}   on:click={() => result = 'failed'}>
      <span class="ri">✗</span><span class="rl">FAIL</span>
    </button>
    <button class="rb r-repair" class:sel={result === 'problem'}  on:click={() => result = 'problem'}>
      <span class="ri">⚙</span><span class="rl">PROBLEM</span>
    </button>
    <button class="rb r-na"     class:sel={result === 'inactive'} on:click={() => result = 'inactive'}>
      <span class="ri">—</span><span class="rl">INACTIVE</span>
    </button>
  </div>
</div>

<!-- -- Photos ------------------------------------------------------------------- -->
<PhotoPanel bind:photoUrls bind:pendingPhotos />

<!-- -- Notes -------------------------------------------------------------------- -->
<div class="sec">
  <div class="sec-lbl">NOTES</div>
  {#if autoFailNote}
    <div class="auto-note">{autoFailNote}</div>
  {/if}
  <WalkTextarea bind:value={notes} placeholder="Observations, issues, actions required…" rows={4} />
</div>

<WalkError message={error || ''} />

<WalkButton variant="primary" size="full"
  disabled={!canSave}
  loading={saving || uploading}
  on:click={handleSaveClick}>
  {saving || uploading ? 'SAVING…' : saveLabel}
</WalkButton>

<style>
  .sec     { display:flex; flex-direction:column; gap:0.75rem; }
  .sec-lbl { font-size:0.62rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }

  /* Checklist — pass/fail per attribute */
  .checklist      { display:flex; flex-direction:column; gap:0.5rem; }
  .cl-item        { display:flex; flex-direction:column; gap:0.35rem; }
  .cl-row         { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; }
  .cl-label       { font-size:0.82rem; color:#f0f0f0; flex:1; min-width:0; display:flex; align-items:center; gap:0.4rem; }
  .cl-btns        { display:flex; gap:0.35rem; flex-shrink:0; }
  .cl-btn         { padding:0.4rem 0.75rem; border-radius:6px; border:2px solid transparent; font-family:'DM Mono','Courier New',monospace; font-size:0.7rem; font-weight:700; letter-spacing:0.08em; cursor:pointer; background:#1a1a2e; transition:all 0.15s; min-width:4rem; }
  .cl-pass        { color:#4ade80; border-color:#2e2e42; }
  .cl-pass:hover  { border-color:#22c55e; }
  .cl-sel-pass    { border-color:#22c55e; background:#0a1f0a; color:#4ade80; }
  .cl-fail        { color:#f87171; border-color:#2e2e42; }
  .cl-fail:hover  { border-color:#ef4444; }
  .cl-sel-fail    { border-color:#ef4444; background:#1f0a0a; color:#f87171; }
  .cl-help-btn    { background:none; border:none; color:#7dd3fc; font-size:0.85rem; cursor:pointer; padding:0; line-height:1; flex-shrink:0; opacity:0.7; transition:opacity 0.15s; }
  .cl-help-btn:hover, .cl-help-active { opacity:1; color:#38bdf8; }
  .cl-help-popup  { font-size:0.76rem; color:#bae6fd; background:#0c1a2e; border:1px solid #1e3a5f; border-radius:6px; padding:0.5rem 0.65rem; line-height:1.5; }
  /* Auto-generated fail note — read-only, shown above the notes textarea */
  .auto-note { font-size:0.76rem; color:#f87171; background:#1f0a0a; border:1px solid #7f1d1d; border-radius:6px; padding:0.45rem 0.65rem; line-height:1.5; }

  /* Text / number reading inputs */
  .cl-row-input   { align-items:center; }
  .cl-input       { width:7rem; padding:0.4rem 0.6rem; background:#111122; border:2px solid #2e2e42; border-radius:6px; color:#f0f0f0; font-family:'DM Mono','Courier New',monospace; font-size:0.82rem; text-align:right; transition:border-color 0.15s; flex-shrink:0; }
  .cl-input[type="number"] { padding-right:1.5rem; }
  .cl-input:focus { outline:none; border-color:#fb923c; }
  .cl-input::placeholder { color:#555; }

  /* Result grid */
  .result-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }
  .rb { display:flex; flex-direction:column; align-items:center; gap:0.4rem; padding:1.25rem 0.5rem; border-radius:10px; border:2px solid transparent; font-family:'DM Mono','Courier New',monospace; cursor:pointer; transition:all 0.15s; background:#1a1a2e; }
  .ri { font-size:1.6rem; }
  .rl { font-size:0.7rem; font-weight:700; letter-spacing:0.12em; }
  .r-pass        { color:#4ade80; } .r-pass:hover  { border-color:#22c55e; } .r-pass.sel  { border-color:#22c55e; background:#0a1f0a; }
  .r-fail        { color:#f87171; } .r-fail:hover  { border-color:#ef4444; } .r-fail.sel  { border-color:#ef4444; background:#1f0a0a; }
  .r-repair      { color:#fb923c; } .r-repair:hover{ border-color:#ea580c; } .r-repair.sel{ border-color:#ea580c; background:#2a1000; }
  .r-na          { color:#ccc;    } .r-na:hover    { border-color:#5e5e78; } .r-na.sel    { border-color:#5e5e78; background:#181828; }

</style>
