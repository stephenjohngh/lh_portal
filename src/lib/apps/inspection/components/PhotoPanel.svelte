<!-- inspection/components/PhotoPanel.svelte -->
<!-- Manages photo capture, pending queue, and display of uploaded photos.
     Uses the inspection scoped-style theme (no Tailwind).
     Parent owns pendingPhotos and photoUrls via bind: so it can run
     uploadAllPending() as part of its own save flow. -->
<script>
  import { onDestroy, tick } from 'svelte';
  import { getLogger }      from '$lib/utils/logger';
  import { compressImage }  from '$lib/apps/inspection/utils/imageCompression';
  import WalkError          from '$lib/apps/inspection/components/common/WalkError.svelte';

  const logger = getLogger('PhotoPanel');

  const MAX_PHOTOS = 8;

  // -- Bound by parent — parent owns these arrays --------------------
  export let photoUrls     = [];   // already-uploaded URLs
  export let pendingPhotos = [];   // { blob, preview, uploading, error }

  // -- Camera state — local to this component ------------------------
  let capturing       = false;
  let videoElement    = null;
  let cameraControls  = null;   // bound to .camera-controls — used for scroll-into-view
  let stream          = null;
  let captureError    = '';
  let destroyed       = false;

  // -- Derived -------------------------------------------------------
  $: totalPhotos = photoUrls.length + pendingPhotos.length;
  $: canAddPhoto = totalPhotos < MAX_PHOTOS;

  // -- Camera --------------------------------------------------------
  async function startCamera() {
    if (!canAddPhoto) return;
    capturing    = true;
    captureError = '';
    // Wait for the {#if capturing} block to render, then scroll so the
    // CAPTURE button sits at the bottom of the visible viewport with the
    // camera preview filling the space above it.
    // Use window.scrollTo rather than scrollIntoView — scrollIntoView can
    // target the wrong ancestor on iOS Safari when all containers use
    // min-height (no explicit scroll boundary).
    await tick();
    if (cameraControls) {
      const rect   = cameraControls.getBoundingClientRect();
      const target = window.scrollY + rect.bottom - window.innerHeight;
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoElement.srcObject = stream;
      videoElement.play();
    } catch (err) {
      logger('Camera error:', err);
      captureError = 'Could not access camera: ' + err.message;
      capturing = false;
    }
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    capturing = false;
  }

  // Wrap canvas.toBlob in a Promise so the await chain is linear and we can
  // bail if the component is unmounted mid-capture.
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob returned null')), type, quality);
    });
  }

  async function capturePhoto() {
    if (!videoElement) return;
    const canvas  = document.createElement('canvas');
    canvas.width  = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    canvas.getContext('2d').drawImage(videoElement, 0, 0);

    try {
      const blob       = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      if (destroyed) return;
      const compressed = await compressImage(blob, { maxSizeMB: 2, maxWidthOrHeight: 1920 });
      if (destroyed) { URL.revokeObjectURL(URL.createObjectURL(compressed)); return; }
      const preview    = URL.createObjectURL(compressed);
      pendingPhotos    = [...pendingPhotos, { blob: compressed, preview, uploading: false, error: null }];
      stopCamera();
    } catch (err) {
      logger('Capture error:', err);
      if (!destroyed) captureError = 'Failed to process image';
    }
  }

  onDestroy(() => {
    destroyed = true;
    if (stream) stream.getTracks().forEach(t => t.stop());
  });

  // -- Remove --------------------------------------------------------
  function removePending(i) {
    const p = pendingPhotos[i];
    if (p.preview) URL.revokeObjectURL(p.preview);
    pendingPhotos = pendingPhotos.filter((_, idx) => idx !== i);
  }

  function removeUploaded(i) {
    photoUrls = photoUrls.filter((_, idx) => idx !== i);
  }
</script>

<div class="sec">
  <div class="sec-lbl">PHOTOS ({totalPhotos}/{MAX_PHOTOS})</div>

  {#if captureError}
    <WalkError message={captureError} onDismiss={() => captureError = ''} />
  {/if}

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
            <div class="thumb-overlay thumb-err" title={p.error}>✗</div>
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
      <div class="camera-controls" bind:this={cameraControls}>
        <button class="capture-btn" on:click={capturePhoto}>CAPTURE</button>
        <button class="cancel-camera-btn" on:click={stopCamera}>CANCEL</button>
      </div>
    </div>
  {:else if canAddPhoto}
    <button class="photo-btn" on:click={startCamera}>📷 ADD PHOTO</button>
  {/if}
</div>

<style>
  .sec     { display:flex; flex-direction:column; gap:0.75rem; }
  .sec-lbl { font-size:0.62rem; letter-spacing:0.2em; color:#fb923c; font-weight:700; }

  .photo-btn       { padding:1.25rem; background:var(--lh-accent); border:none; border-radius:10px; color:#fff; font-family:'DM Mono','Courier New',monospace; font-size:0.9rem; font-weight:800; letter-spacing:0.15em; cursor:pointer; transition:background 0.15s; }
  .photo-btn:hover { background:var(--lh-accent-dark); }
  .photo-grid      { display:grid; grid-template-columns:repeat(auto-fill, minmax(4rem, 1fr)); gap:0.4rem; }
  .thumb           { position:relative; border-radius:6px; overflow:hidden; border:2px solid #2e2e42; aspect-ratio:1; }
  .thumb-pending   { border-color:var(--lh-accent); }
  .thumb img       { width:100%; height:100%; object-fit:cover; display:block; }
  .thumb-remove    { position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.75); border:none; border-radius:3px; color:#f87171; font-size:0.65rem; font-weight:700; cursor:pointer; padding:1px 4px; line-height:1.4; }
  .thumb-overlay   { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); color:#fb923c; font-size:1.2rem; }
  .thumb-err       { color:#f87171; }

  .camera-view          { display:flex; flex-direction:column; gap:1rem; background:#000; border-radius:10px; overflow:hidden; }
  video                 { width:100%; display:block; }
  .camera-controls      { display:flex; gap:0.75rem; padding:1rem; background:#111122; }
  .capture-btn          { flex:1; padding:1rem; background:#22c55e; border:none; border-radius:8px; color:#0d0d14; font-family:inherit; font-size:0.875rem; font-weight:800; letter-spacing:0.15em; cursor:pointer; }
  .cancel-camera-btn    { padding:1rem 1.5rem; background:none; border:2px solid #3e3e58; border-radius:8px; color:#ccc; font-family:inherit; font-size:0.875rem; font-weight:700; cursor:pointer; }
</style>
