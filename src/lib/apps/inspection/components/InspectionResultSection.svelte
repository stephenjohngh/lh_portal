<!-- src/lib/apps/inspection/components/InspectionResultSection.svelte -->
<!-- Result selection, dynamic checklist, multi-photo capture, notes, save.
     photo_urls is a JSONB array; capture limit is MAX_PHOTOS in PhotoPanel.
     Photo capture/display is delegated to PhotoPanel; this component owns
     pendingPhotos state so uploadAllPending() can run at save time. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { uploadMedia }  from '$lib/utils/mediaUpload';
  import { supabase }     from '$lib/supabaseClient';
  import { deriveChecklistOutcome } from '../utils/checklistRules.js';
  import { NO_ACCESS_REASONS } from '$lib/utils/resultConstants.js';
  import WalkTextarea from '$lib/apps/inspection/components/common/WalkTextarea.svelte';
  import WalkError    from '$lib/apps/inspection/components/common/WalkError.svelte';
  import WalkButton   from '$lib/apps/inspection/components/common/WalkButton.svelte';
  import PhotoPanel   from './PhotoPanel.svelte';

  const logger   = getLogger('InspectionResultSection');
  const dispatch = createEventDispatcher();

  // Two-way bindable
  export let result           = '';
  export let notes            = '';
  /** @type {Record<string, boolean|undefined>} */
  export let checklistResults = {};   // { type_attribute_id: boolean }
  /** @type {string[]} */
  export let photoUrls        = [];   // already-uploaded URLs (array)
  /** @type {string|null} */
  export let noAccessReason   = null; // only meaningful when result==='no_access'

  // One-way from parent
  export let checklistDefs = [];   // type_attributes with checkable=true for this component's type
  export let passFailRule  = 'manual';  // definition's pass_fail_rule: 'manual' | 'all_checks_pass'
  export let saving        = false;
  export let error         = null;
  export let session       = null;
  export let component     = null;
  export let floor         = null;  // floors row — used for human-readable Drive folder names
  export let type          = null;  // component_types row — used for human-readable Drive file names
  export let saveLabel     = 'RECORD INSPECTION';

  $: canSave = !!result;

  // -- No access ---------------------------------------------------------------
  // A different KIND of outcome from the condition results: "I could not assess
  // this", not "its condition is X". Hence its own control below the result row
  // rather than a fifth condition button. Available in enforced (all_checks_pass)
  // mode too — you can always fail to get in.
  $: noAccess = result === 'no_access';
  function toggleNoAccess() {
    if (noAccess) {                 // undo — back to an unanswered result
      result = '';
      noAccessReason = null;
    } else {
      result = 'no_access';
      // Checks can't be answered for something nobody saw.
      checklistResults = {};
      inputValues = {};
    }
  }

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
  //
  // pass_fail_rule='manual': the derived result is a suggestion the inspector
  // can override with the result buttons. 'all_checks_pass': it is binding —
  // the buttons are replaced by a read-out and save waits for a determined
  // result (any fail → failed; all pass → ok).
  let autoFailNote = '';
  $: outcome  = deriveChecklistOutcome(passFailDefs, checklistResults, passFailRule);
  $: enforced = outcome.enforced;
  // `result === 'no_access'` is NOT derived from the checks and must survive
  // this block — without the guard, clearing the checklist on no-access would
  // make the enforced branch immediately reset result to '' and undo it.
  $: if (passFailDefs.length > 0 && result !== 'no_access') {
    if (outcome.result)  result = outcome.result;
    else if (enforced)   result = '';
    autoFailNote = outcome.anyFail ? 'Failed: ' + outcome.failedNames.join(', ') : '';
  }

  // -- Photo state --------------------------------------------------------------
  // PhotoPanel owns the camera/capture UI; this component owns pendingPhotos
  // so that uploadAllPending() can run as part of the save flow here.
  let pendingPhotos = [];   // { blob, preview, uploading, error }

  async function uploadAllPending() {
    // Obtain the access token once for all uploads in this batch.
    const { data: { session: authSession } } = await supabase.auth.getSession();
    const token = authSession?.access_token;
    if (!token) { logger('❌ No auth token — cannot upload photos'); return []; }

    /** @type {string[]} */
    const uploaded = [];

    // Strip characters not valid in Drive folder/file names.
    const sanitize = str => str.replace(/[/\\:*?"<>|]/g, '').trim();

    // Folder: "Inspections / 2026-06-08 Inspection Ground Floor"
    // Groups all photos from the same session into one readable Drive folder.
    const sessionDate = session?.started_at
      ? session.started_at.slice(0, 10)           // "YYYY-MM-DD"
      : new Date().toISOString().slice(0, 10);
    const sessionType = session?.session_type
      ? session.session_type.charAt(0).toUpperCase() + session.session_type.slice(1)
      : 'Inspection';
    const floorLabel  = floor?.name ?? floor?.short_name ?? null;
    const scopeLabel  = floorLabel
      ? sanitize(floorLabel)
      : (session?.session_scope === 'building' ? 'Building' : 'Unknown Floor');
    const sessionFolder = `${sessionDate} ${sessionType} ${scopeLabel}`;

    // File name: "Fire Door FD-042 - 1.jpg"
    // Falls back gracefully if type or asset_id are missing.
    const typeName  = type?.name  ?? null;
    const assetId   = component?.asset_id ?? null;
    const nameBase  = typeName && assetId
      ? sanitize(`${typeName} ${assetId}`)
      : assetId
        ? sanitize(assetId)
        : 'Photo';

    for (let i = 0; i < pendingPhotos.length; i++) {
      const p = pendingPhotos[i];
      pendingPhotos[i] = { ...p, uploading: true };
      pendingPhotos = [...pendingPhotos];
      try {
        const fileName = `${nameBase} - ${i + 1}.jpg`;
        const { url } = await uploadMedia(p.blob, {
          filename:   fileName,
          folderPath: ['Inspections', sessionFolder],
          token,
        });
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

<!-- -- Dynamic checklist — PASS / FAIL per attribute ---------------------------
     Hidden when no access was possible: you cannot answer checks on something
     nobody could see, and leaving them visible invites a fabricated record. -->
{#if passFailDefs.length > 0 && !noAccess}
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
{#if inputDefs.length > 0 && !noAccess}
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

<!-- -- Result — derived read-out (all_checks_pass) or manual buttons ------------ -->
<div class="sec">
  <div class="sec-lbl">INSPECTION RESULT</div>
  {#if noAccess}
    <!-- Condition results are meaningless here — show the outcome instead. -->
    <div class="noacc-state">
      <span class="ri">⊘</span>
      <span class="rl">NO ACCESS — component not assessed</span>
    </div>
  {:else if enforced}
    <div class="derived" class:d-pass={result === 'ok'} class:d-fail={result === 'failed'}>
      {#if result === 'ok'}
        <span class="ri">✓</span><span class="rl">PASS — all checks passed</span>
      {:else if result === 'failed'}
        <span class="ri">✗</span><span class="rl">FAIL — {outcome.failedNames.length} check{outcome.failedNames.length === 1 ? '' : 's'} failed</span>
      {:else}
        <span class="rl">Answer every check above — the result is set from the checks.</span>
      {/if}
    </div>
  {:else}
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
  {/if}

  <!-- Couldn't assess it. Deliberately outside the result row: this is not a
       condition, it is the absence of an observation. Required to evidence the
       "best endeavours" flat-entrance-door check (Fire Safety (England) Regs). -->
  <button class="noacc-btn" class:noacc-on={noAccess} on:click={toggleNoAccess}>
    {noAccess ? '↩ UNDO — I CAN ASSESS THIS' : '⊘ NO ACCESS — COULD NOT ASSESS'}
  </button>

  {#if noAccess}
    <div class="noacc-reason">
      <div class="sec-lbl">REASON</div>
      <div class="reason-row">
        {#each NO_ACCESS_REASONS as r (r.value)}
          <button class="reason-chip" class:on={noAccessReason === r.value}
            on:click={() => noAccessReason = r.value}>{r.label}</button>
        {/each}
      </div>
      <p class="noacc-note">
        Recorded as attended-but-not-assessed. It counts towards finishing the
        session, is never reported as a pass, and leaves the component's status
        unchanged.
      </p>
    </div>
  {/if}
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

  /* Result — all four on one line */
  .result-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:0.4rem; }
  .rb { display:flex; flex-direction:column; align-items:center; gap:0.3rem; padding:0.75rem 0.2rem; border-radius:10px; border:2px solid transparent; font-family:'DM Mono','Courier New',monospace; cursor:pointer; transition:all 0.15s; background:#1a1a2e; min-height:44px; }
  .ri { font-size:1.3rem; line-height:1; }
  .rl { font-size:0.58rem; font-weight:700; letter-spacing:0.03em; }
  .r-pass        { color:#4ade80; } .r-pass:hover  { border-color:#22c55e; } .r-pass.sel  { border-color:#22c55e; background:#0a1f0a; }
  .r-fail        { color:#f87171; } .r-fail:hover  { border-color:#ef4444; } .r-fail.sel  { border-color:#ef4444; background:#1f0a0a; }
  .r-repair      { color:#fb923c; } .r-repair:hover{ border-color:#ea580c; } .r-repair.sel{ border-color:#ea580c; background:#2a1000; }
  .r-na          { color:#ccc;    } .r-na:hover    { border-color:#5e5e78; } .r-na.sel    { border-color:#5e5e78; background:#181828; }

  /* No access — a distinct kind of outcome, styled apart from the results */
  .noacc-btn { width:100%; margin-top:0.5rem; padding:0.75rem; min-height:44px; background:#1a1a2e; border:2px solid #3e3e58; border-radius:10px; color:#c4b5fd; font-family:'DM Mono','Courier New',monospace; font-size:0.68rem; font-weight:700; letter-spacing:0.06em; cursor:pointer; transition:all 0.15s; }
  .noacc-btn:hover { border-color:#8b5cf6; }
  .noacc-on   { background:#1e1533; border-color:#8b5cf6; color:#ddd6fe; }
  .noacc-state { display:flex; align-items:center; gap:0.6rem; padding:1rem; border-radius:10px; border:2px solid #8b5cf6; background:#1e1533; color:#ddd6fe; }
  .noacc-state .ri { font-size:1.3rem; }
  .noacc-state .rl { font-size:0.72rem; font-weight:700; letter-spacing:0.08em; }
  .noacc-reason { display:flex; flex-direction:column; gap:0.5rem; margin-top:0.75rem; }
  .reason-row  { display:flex; flex-wrap:wrap; gap:0.4rem; }
  .reason-chip { padding:0.5rem 0.7rem; min-height:40px; background:#1a1a2e; border:2px solid #2e2e42; border-radius:8px; color:#aaa; font-family:'DM Mono','Courier New',monospace; font-size:0.68rem; cursor:pointer; transition:all 0.15s; }
  .reason-chip:hover { border-color:#8b5cf6; }
  .reason-chip.on { border-color:#8b5cf6; background:#1e1533; color:#ddd6fe; font-weight:700; }
  .noacc-note { font-size:0.7rem; color:#888; line-height:1.5; }

  /* Derived read-out (pass_fail_rule='all_checks_pass') */
  .derived { display:flex; align-items:center; gap:0.6rem; padding:1rem; border-radius:10px; border:2px solid #2e2e42; background:#1a1a2e; color:#aaa; }
  .derived .ri { font-size:1.3rem; }
  .derived .rl { font-size:0.72rem; font-weight:700; letter-spacing:0.1em; }
  .d-pass { border-color:#22c55e; background:#0a1f0a; color:#4ade80; }
  .d-fail { border-color:#ef4444; background:#1f0a0a; color:#f87171; }

</style>
