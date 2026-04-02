<!-- src/lib/apps/v2walk/components/V2WalkResultSection.svelte -->
<!-- Result selection, dynamic checklist, multi-photo capture, notes, save.
     Supports up to 4 photos per inspection. photo_urls is an array. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger }    from '$lib/utils/logger';
  import { compressImage } from '$lib/apps/walk/utils/imageCompression';
  import { uploadToSupabase } from '$lib/apps/walk/utils/supabaseUpload';
  import { uploadToGoogleDrive } from '$lib/apps/walk/utils/googleDriveUpload';
  import WalkTextarea from '$lib/apps/walk/components/common/WalkTextarea.svelte';
  import WalkError    from '$lib/apps/walk/components/common/WalkError.svelte';
  import WalkButton   from '$lib/apps/walk/components/common/WalkButton.svelte';

  const MAX_PHOTOS = 4;

  const logger   = getLogger('V2WalkResultSection');
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

  // ── Photo state ──────────────────────────────────────────────────────────────
  // Each pending photo: { blob, preview, uploading, error }
  let pendingPhotos = [];
  let capturing     = false;
  let videoElement;
  let stream        = null;

  $: totalPhotos    = photoUrls.length + pendingPhotos.length;
  $: canAddPhoto    = totalPhotos < MAX_PHOTOS;

  async function startCamera() {
    if (!canAddPhoto) return;
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
        const preview    = URL.createObjectURL(compressed);
        pendingPhotos    = [...pendingPhotos, { blob: compressed, preview, uploading: false, error: null }];
        stopCamera();
      } catch (err) {
        alert('Failed to process image');
      }
    }, 'image/jpeg', 0.8);
  }

  function removePending(i) {
    const p = pendingPhotos[i];
    if (p.preview) URL.revokeObjectURL(p.preview);
    pendingPhotos = pendingPhotos.filter((_, idx) => idx !== i);
  }

  function removeUploaded(i) {
    photoUrls = photoUrls.filter((_, idx) => idx !== i);
  }

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
    const newUrls = await uploadAllPending();
    photoUrls     = [...photoUrls, ...newUrls];
    // Clear pending (successful ones now in photoUrls)
    pendingPhotos = pendingPhotos.filter(p => p.error !== null);
    dispatch('save');
  }

  $: uploading = pendingPhotos.some(p => p.uploading);
</script>

<!-- ── Dynamic checklist ──────────────────────────────────────────────────────── -->
{#if checklistDefs.length > 0}
  <div class="sec">
    <div class="sec-lbl">CHECKLIST</div>
    <div class="checklist">
      {#each checklistDefs as def (def.id)}
        <label class="cl-row">
          <input
            type="checkbox"
            checked={checklistResults[def.id] ?? false}
            on:change={e => checklistResults = { ...checklistResults, [def.id]: e.target.checked }}
          />
          <span class="cl-label">{def.name}</span>
        </label>
      {/each}
    </div>
  </div>
{/if}

<!-- ── Result buttons ─────────────────────────────────────────────────────────── -->
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

<!-- ── Photos ─────────────────────────────────────────────────────────────────── -->
<div class="sec">
  <div class="sec-lbl">PHOTOS ({totalPhotos}/{MAX_PHOTOS})</div>

  <!-- Uploaded photo thumbnails -->
  {#if photoUrls.length > 0}
    <div class="photo-grid">
      {#each photoUrls as url, i (url)}
        <div class="thumb">
          <img src={url} alt="Inspection {i+1}" />
          <button class="thumb-remove" on:click={() => removeUploaded(i)}>✕</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Pending (captured, not yet uploaded) thumbnails -->
  {#if pendingPhotos.length > 0}
    <div class="photo-grid">
      {#each pendingPhotos as p, i (i)}
        <div class="thumb thumb-pending">
          <img src={p.preview} alt="Pending {i+1}" />
          {#if p.uploading}
            <div class="thumb-overlay">⟳</div>
          {:else if p.error}
            <div class="thumb-overlay thumb-err">✗</div>
          {:else}
            <button class="thumb-remove" on:click={() => removePending(i)}>✕</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Camera view -->
  {#if capturing}
    <div class="camera-view">
      <!-- svelte-ignore a11y-media-has-caption -->
      <video bind:this={videoElement} autoplay playsinline></video>
      <div class="camera-controls">
        <button class="capture-btn" on:click={capturePhoto}>CAPTURE</button>
        <button class="cancel-camera-btn" on:click={stopCamera}>CANCEL</button>
      </div>
    </div>
  {:else if canAddPhoto}
    <button class="photo-btn" on:click={startCamera}>📷 ADD PHOTO</button>
  {/if}
</div>

<!-- ── Notes ──────────────────────────────────────────────────────────────────── -->
<div class="sec">
  <div class="sec-lbl">NOTES</div>
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

  /* Checklist */
  .checklist { display:flex; flex-direction:column; gap:0.5rem; }
  .cl-row    { display:flex; align-items:center; gap:0.625rem; cursor:pointer; }
  .cl-row input { width:1.1rem; height:1.1rem; accent-color:#fb923c; }
  .cl-label  { font-size:0.82rem; color:#f0f0f0; }

  /* Result grid */
  .result-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; }
  .rb { display:flex; flex-direction:column; align-items:center; gap:0.4rem; padding:1.25rem 0.5rem; border-radius:10px; border:2px solid transparent; font-family:'DM Mono','Courier New',monospace; cursor:pointer; transition:all 0.15s; background:#1a1a2e; }
  .ri { font-size:1.6rem; }
  .rl { font-size:0.7rem; font-weight:700; letter-spacing:0.12em; }
  .r-pass        { color:#4ade80; } .r-pass:hover  { border-color:#22c55e; } .r-pass.sel  { border-color:#22c55e; background:#0a1f0a; }
  .r-fail        { color:#f87171; } .r-fail:hover  { border-color:#ef4444; } .r-fail.sel  { border-color:#ef4444; background:#1f0a0a; }
  .r-repair      { color:#fb923c; } .r-repair:hover{ border-color:#ea580c; } .r-repair.sel{ border-color:#ea580c; background:#2a1000; }
  .r-na          { color:#ccc;    } .r-na:hover    { border-color:#5e5e78; } .r-na.sel    { border-color:#5e5e78; background:#181828; }

  /* Photos */
  .photo-btn { padding:1.25rem; background:#5b21b6; border:none; border-radius:10px; color:#fff; font-family:'DM Mono','Courier New',monospace; font-size:0.9rem; font-weight:800; letter-spacing:0.15em; cursor:pointer; transition:background 0.15s; }
  .photo-btn:hover { background:#6d28d9; }
  .photo-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0.4rem; }
  .thumb { position:relative; border-radius:6px; overflow:hidden; border:2px solid #2e2e42; aspect-ratio:1; }
  .thumb-pending { border-color:#5b21b6; }
  .thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .thumb-remove { position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.75); border:none; border-radius:3px; color:#f87171; font-size:0.65rem; font-weight:700; cursor:pointer; padding:1px 4px; line-height:1.4; }
  .thumb-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); color:#fb923c; font-size:1.2rem; }
  .thumb-err { color:#f87171; }
  .camera-view { display:flex; flex-direction:column; gap:1rem; background:#000; border-radius:10px; overflow:hidden; }
  video { width:100%; display:block; }
  .camera-controls { display:flex; gap:0.75rem; padding:1rem; background:#111122; }
  .capture-btn { flex:1; padding:1rem; background:#22c55e; border:none; border-radius:8px; color:#0d0d14; font-family:inherit; font-size:0.875rem; font-weight:800; letter-spacing:0.15em; cursor:pointer; }
  .cancel-camera-btn { padding:1rem 1.5rem; background:none; border:2px solid #3e3e58; border-radius:8px; color:#ccc; font-family:inherit; font-size:0.875rem; font-weight:700; cursor:pointer; }
</style>
