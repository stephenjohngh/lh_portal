<!-- src/lib/apps/walk/components/WalkResultSection.svelte -->
<!-- Shared result-selection, photo capture/upload, notes, error and save button.
     Used by both WalkInspectionPanel and WalkDoorInspectionPanel.
     Caller binds result/notes/photoUrl, passes session/element/saving/error,
     listens for on:save which fires after any photo upload completes. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { compressImage } from '../utils/imageCompression';
  import { uploadToSupabase } from '../utils/supabaseUpload';
  import { uploadToGoogleDrive } from '../utils/googleDriveUpload';

  const logger   = getLogger('WalkResultSection');
  const dispatch = createEventDispatcher();

  // Two-way bindable — parent reads these after on:save fires
  export let result   = '';
  export let notes    = '';
  export let photoUrl = null;

  // One-way from parent
  export let saving      = false;   // parent's own save-in-progress flag
  export let error       = null;    // error from parent's recordInspecton call
  export let session     = null;    // needed to build upload filename
  export let element     = null;    // needed to build upload filename
  export let notesLabel  = 'NOTES';
  export let notesRows   = 4;
  export let placeholder = 'Observations, issues found, actions required…';
  export let saveLabel   = 'RECORD INSPECTION';

  $: canSave = !!result;

  // ── Photo state ─────────────────────────────────────────────────────────
  let photoBlob    = null;
  let photoPreview = null;
  let capturing    = false;
  let uploading    = false;
  let photoError   = null;

  let videoElement;
  let stream = null;

  $: hasPhoto = photoBlob !== null;

  async function startCamera() {
    capturing = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoElement.srcObject = stream;
      videoElement.play();
    } catch (err) {
      logger('Camera error:', err);
      alert('Could not access camera: ' + err.message);
      capturing = false;
    }
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    capturing = false;
  }

  async function capturePhoto() {
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    canvas.width  = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    canvas.getContext('2d').drawImage(videoElement, 0, 0);
    canvas.toBlob(async (blob) => {
      try {
        const compressed = await compressImage(blob, { maxSizeMB: 0.5, maxWidthOrHeight: 1024 });
        photoBlob    = compressed;
        photoPreview = URL.createObjectURL(compressed);
        stopCamera();
        logger('Photo captured:', compressed.size, 'bytes');
      } catch (err) {
        logger('Compression error:', err);
        alert('Failed to process image');
      }
    }, 'image/jpeg', 0.8);
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    photoBlob    = null;
    photoPreview = null;
    photoUrl     = null;
    photoError   = null;
  }

  async function uploadPhoto() {
    uploading = true; photoError = null;
    try {
      const sessionName = session?.session_name || `${session?.building}_${session?.floor_level}`;
      const elementName = element?.asset_id || `${element?.element_type}_${element?.id?.slice(0, 8)}`;
      const fileName    = `${elementName}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
      try {
        const url = await uploadToSupabase(photoBlob, fileName, session?.id);
        logger('✅ Uploaded to Supabase:', url);
        return url;
      } catch (supabaseErr) {
        logger('⚠️ Supabase failed, trying Google Drive:', supabaseErr);
        const url = await uploadToGoogleDrive(photoBlob, fileName, sessionName);
        logger('✅ Uploaded to Google Drive:', url);
        return url;
      }
    } catch (err) {
      logger('❌ Photo upload failed:', err);
      photoError = 'Photo upload failed — saving without photo.';
      return null;
    } finally {
      uploading = false;
    }
  }

  // Upload photo first (if present and not yet uploaded), then tell parent to save
  async function handleSaveClick() {
    if (photoBlob && !photoUrl) {
      photoUrl = await uploadPhoto();
    }
    dispatch('save');
  }
</script>

<!-- Result buttons -->
<div class="sec">
  <div class="sec-lbl">INSPECTION RESULT</div>
  <div class="result-grid">
    <button class="rb r-pass"   class:sel={result === 'OK'}   on:click={() => result = 'OK'}>
      <span class="ri">✓</span><span class="rl">PASS</span>
    </button>
    <button class="rb r-fail"   class:sel={result === 'failed'}   on:click={() => result = 'failed'}>
      <span class="ri">✗</span><span class="rl">FAIL</span>
    </button>
    <button class="rb r-problem" class:sel={result === 'problem'} on:click={() => result = 'problem'}>
      <span class="ri">⚙</span><span class="rl">PROBLEM</span>
    </button>
    <button class="rb r-na"     class:sel={result === 'inactive'}     on:click={() => result = 'inactive'}>
      <span class="ri">—</span><span class="rl">INACTIVE</span>
    </button>
  </div>
</div>

<!-- Photo -->
<div class="sec">
  <div class="sec-lbl">PHOTO (OPTIONAL)</div>

  {#if !capturing && !hasPhoto}
    <button class="photo-btn" on:click={startCamera}>📷 TAKE PHOTO</button>
  {/if}

  {#if capturing}
    <div class="camera-view">
      <!-- svelte-ignore a11y-media-has-caption -->
      <video bind:this={videoElement} autoplay playsinline></video>
      <div class="camera-controls">
        <button class="capture-btn" on:click={capturePhoto}>CAPTURE</button>
        <button class="cancel-camera-btn" on:click={stopCamera}>CANCEL</button>
      </div>
    </div>
  {/if}

  {#if hasPhoto}
    <div class="photo-preview">
      <img src={photoPreview} alt="Inspection photo" />
      <button class="remove-photo-btn" on:click={removePhoto}>✕ REMOVE</button>
    </div>
    {#if uploading}<div class="photo-status">Uploading…</div>{/if}
    {#if photoError}<div class="photo-status photo-err">{photoError}</div>{/if}
  {/if}
</div>

<!-- Notes -->
<div class="sec">
  <div class="sec-lbl">{notesLabel}</div>
  <textarea class="notes-ta" bind:value={notes}
    {placeholder} rows={notesRows}></textarea>
</div>

<!-- Error from parent -->
{#if error}
  <div class="err-box">⚠ {error}</div>
{/if}

<!-- Save -->
<button class="save-btn" on:click={handleSaveClick}
        disabled={saving || uploading || !canSave}>
  {saving || uploading ? 'SAVING…' : saveLabel}
</button>

<style>
  .sec     { display: flex; flex-direction: column; gap: 0.75rem; }
  .sec-lbl { font-size: 0.62rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700; }

  /* ── Result grid ──────────────────────────────────────────────────────────*/
  .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .rb {
    display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
    padding: 1.25rem 0.5rem; border-radius: 10px; border: 2px solid transparent;
    font-family: 'DM Mono', 'Courier New', monospace; cursor: pointer;
    transition: all 0.15s; background: #1a1a2e;
  }
  .ri { font-size: 1.6rem; }
  .rl { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; }

  .r-pass        { color: #4ade80; }
  .r-pass:hover  { border-color: #22c55e; }
  .r-pass.sel    { border-color: #22c55e; background: #0a1f0a; }
  .r-fail        { color: #f87171; }
  .r-fail:hover  { border-color: #ef4444; }
  .r-fail.sel    { border-color: #ef4444; background: #1f0a0a; }
  .r-problem        { color: #fb923c; }
  .r-problem:hover  { border-color: #ea580c; }
  .r-problem.sel    { border-color: #ea580c; background: #2a1000; }
  .r-na          { color: #ccc; }
  .r-na:hover    { border-color: #5e5e78; }
  .r-na.sel      { border-color: #5e5e78; background: #181828; }

  /* ── Photo ────────────────────────────────────────────────────────────────*/
  .photo-btn {
    padding: 1.25rem; background: #5b21b6; border: none;
    border-radius: 10px; color: #fff;
    font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.9rem; font-weight: 800; letter-spacing: 0.15em;
    cursor: pointer; transition: background 0.15s;
  }
  .photo-btn:hover { background: #6d28d9; }

  .camera-view {
    display: flex; flex-direction: column; gap: 1rem;
    background: #000; border-radius: 10px; overflow: hidden;
  }
  video { width: 100%; display: block; }

  .camera-controls { display: flex; gap: 0.75rem; padding: 1rem; background: #111122; }
  .capture-btn {
    flex: 1; padding: 1rem; background: #22c55e; border: none;
    border-radius: 8px; color: #0d0d14; font-family: inherit;
    font-size: 0.875rem; font-weight: 800; letter-spacing: 0.15em; cursor: pointer;
  }
  .cancel-camera-btn {
    padding: 1rem 1.5rem; background: none; border: 2px solid #3e3e58;
    border-radius: 8px; color: #ccc; font-family: inherit;
    font-size: 0.875rem; font-weight: 700; cursor: pointer;
  }

  .photo-preview { position: relative; border-radius: 10px; overflow: hidden; border: 2px solid #2e2e42; }
  .photo-preview img { width: 100%; display: block; }
  .remove-photo-btn {
    position: absolute; top: 0.5rem; right: 0.5rem;
    padding: 0.5rem 0.875rem; background: rgba(0,0,0,0.8);
    border: 1px solid #ef4444; border-radius: 6px;
    color: #f87171; font-family: inherit; font-size: 0.75rem; font-weight: 700; cursor: pointer;
  }
  .photo-status { font-size: 0.75rem; color: #ccc; padding: 0.25rem 0; }
  .photo-err    { color: #fca5a5; }

  /* ── Notes ────────────────────────────────────────────────────────────────*/
  .notes-ta {
    background: #1a1a2e; border: 2px solid #2e2e48; border-radius: 8px;
    color: #f0f0f0; font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.875rem; padding: 0.875rem 1rem;
    width: 100%; box-sizing: border-box; resize: none;
  }
  .notes-ta:focus        { outline: none; border-color: #fb923c; }
  .notes-ta::placeholder { color: #777; }

  /* ── Error ────────────────────────────────────────────────────────────────*/
  .err-box {
    font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem;
    background: #2a0000; border: 2px solid #ef4444; border-radius: 8px;
  }

  /* ── Save ─────────────────────────────────────────────────────────────────*/
  .save-btn {
    padding: 1.25rem; background: #22c55e; border: none; border-radius: 10px;
    color: #0a0a0f; font-family: 'DM Mono', 'Courier New', monospace;
    font-size: 0.9rem; font-weight: 800; letter-spacing: 0.2em;
    cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #16a34a; }
  .save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
</style>
