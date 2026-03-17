<!-- src/lib/apps/walk/components/WalkDoorInspectionPanel.svelte -->
<!-- Enhanced door inspection with checklist and photo capture -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import { walkStore } from '../stores/walkStore.js';
  import { compressImage } from '../utils/imageCompression';
  import { uploadToSupabase } from '../utils/supabaseUpload';
  import { uploadToGoogleDrive } from '../utils/googleDriveUpload';
  
  const logger = getLogger('WalkDoorInspectionPanel');
  const dispatch = createEventDispatcher();
  
  export let element;
  export let session;
  
  // Inspection data
  let result = null;
  let notes = '';
  let checklist = {
    frame: false,
    seals: false,
    glass: false
  };
  
  // Photo state
  let photoBlob = null;
  let photoPreview = null;
  let capturing = false;
  let uploading = false;
  let uploadError = null;
  
  // Video stream for camera
  let videoElement;
  let stream = null;
  
  $: canSave = result !== null;
  $: hasPhoto = photoBlob !== null;
  
  async function startCamera() {
    capturing = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
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
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    capturing = false;
  }
  
  async function capturePhoto() {
    if (!videoElement) return;
    
    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0);
    
    // Convert to blob
    canvas.toBlob(async (blob) => {
      try {
        // Compress image
        const compressed = await compressImage(blob, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1024
        });
        
        photoBlob = compressed;
        photoPreview = URL.createObjectURL(compressed);
        stopCamera();
        logger('Photo captured and compressed:', compressed.size, 'bytes');
      } catch (err) {
        logger('Compression error:', err);
        alert('Failed to process image');
      }
    }, 'image/jpeg', 0.8);
  }
  
  function removePhoto() {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    photoBlob = null;
    photoPreview = null;
  }
  
  async function handleSave() {
    uploading = true;
    uploadError = null;
    
    try {
      let photoUrl = null;
      
      // Upload photo if exists
      if (photoBlob) {
        // Build file name from session and element
        const sessionName = session.session_name || `${session.building}_${session.floor_level}`;
        const elementName = element.asset_id || `${element.element_type}_${element.id.slice(0, 8)}`;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${elementName}_${timestamp}.jpg`;
        
        // Try Supabase first
        try {
          photoUrl = await uploadToSupabase(photoBlob, fileName, session.id);
          logger('✅ Uploaded to Supabase:', photoUrl);
        } catch (supabaseErr) {
          logger('⚠️ Supabase upload failed, trying Google Drive:', supabaseErr);
          
          // Fallback to Google Drive
          try {
            photoUrl = await uploadToGoogleDrive(
              photoBlob, 
              fileName, 
              sessionName // folder name
            );
            logger('✅ Uploaded to Google Drive:', photoUrl);
          } catch (driveErr) {
            logger('❌ Google Drive upload failed:', driveErr);
            throw new Error('Photo upload failed. Please check your connection.');
          }
        }
      }
      
      // Build notes with checklist data for v1
      let combinedNotes = notes;
      if (checklist.frame || checklist.seals || checklist.glass) {
        const checklistItems = [];
        if (checklist.frame) checklistItems.push('Frame ✓');
        if (checklist.seals) checklistItems.push('Seals ✓');
        if (checklist.glass) checklistItems.push('Glass ✓');
        
        const checklistText = `Checked: ${checklistItems.join(', ')}`;
        combinedNotes = combinedNotes 
          ? `${checklistText}\n${notes}` 
          : checklistText;
      }
      
      // Record inspection using walkStore
      await walkStore.recordInspection({
        elementId: element.id,
        result,
        notes: combinedNotes,
        photoUrl
      });
      
      // Dispatch saved event
      dispatch('saved');
      
    } catch (err) {
      logger('Save failed:', err);
      uploadError = err.message;
    } finally {
      uploading = false;
    }
  }
  
  function handleCancel() {
    stopCamera();
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    dispatch('cancel');
  }
</script>

<div class="dip">
  <div class="dip-hdr">
    <button class="back-btn" on:click={handleCancel}>← BACK</button>
    <div class="dip-title">DOOR INSPECTION</div>
  </div>
  
  <div class="dip-body">
    
    <!-- Element Info -->
    <div class="element-info">
      <div class="element-id">{element.asset_id || element.element_type}</div>
      {#if element.subtype}<div class="element-sub">{element.subtype}</div>{/if}
    </div>
    
    <!-- Checklist -->
    <div class="section">
      <div class="section-label">INSPECTION CHECKLIST</div>
      <div class="checklist">
        <label class="check-item">
          <input type="checkbox" bind:checked={checklist.frame} />
          <span class="check-box"></span>
          <span class="check-label">Frame</span>
        </label>
        <label class="check-item">
          <input type="checkbox" bind:checked={checklist.seals} />
          <span class="check-box"></span>
          <span class="check-label">Seals</span>
        </label>
        <label class="check-item">
          <input type="checkbox" bind:checked={checklist.glass} />
          <span class="check-box"></span>
          <span class="check-label">Glass</span>
        </label>
      </div>
    </div>
    
    <!-- Photo Section -->
    <div class="section">
      <div class="section-label">PHOTO</div>
      
      {#if !capturing && !hasPhoto}
        <button class="photo-btn" on:click={startCamera}>
          📷 TAKE PHOTO
        </button>
      {/if}
      
      {#if capturing}
        <div class="camera-view">
          <!-- svelte-ignore a11y-media-has-caption -->
          <video bind:this={videoElement} autoplay playsinline></video>
          <div class="camera-controls">
            <button class="capture-btn" on:click={capturePhoto}>
              CAPTURE
            </button>
            <button class="cancel-camera-btn" on:click={stopCamera}>
              CANCEL
            </button>
          </div>
        </div>
      {/if}
      
      {#if hasPhoto}
        <div class="photo-preview">
          <img src={photoPreview} alt="Door inspection" />
          <button class="remove-photo-btn" on:click={removePhoto}>
            ✕ REMOVE
          </button>
        </div>
      {/if}
    </div>
    
    <!-- Result -->
    <div class="section">
      <div class="section-label">RESULT</div>
      <div class="result-btns">
        <button 
          class="result-btn" 
          class:selected={result === 'pass'} 
          on:click={() => result = 'pass'}>
          ✓ PASS
        </button>
        <button 
          class="result-btn" 
          class:selected={result === 'fail'} 
          on:click={() => result = 'fail'}>
          ✗ FAIL
        </button>
        <button 
          class="result-btn result-btn-repair"
          class:selected={result === 'repair'} 
          on:click={() => result = 'repair'}>
          ⚙ REPAIR
        </button>
        <button 
          class="result-btn" 
          class:selected={result === 'na'} 
          on:click={() => result = 'na'}>
          — N/A
        </button>
      </div>
    </div>
    
    <!-- Notes -->
    <div class="section">
      <div class="section-label">NOTES (OPTIONAL)</div>
      <textarea 
        class="notes-input" 
        bind:value={notes}
        placeholder="Any observations…"
        rows="3"
      ></textarea>
    </div>
    
    {#if uploadError}
      <div class="error-msg">⚠ {uploadError}</div>
    {/if}
    
    <button 
      class="save-btn" 
      on:click={handleSave} 
      disabled={!canSave || uploading}>
      {uploading ? 'SAVING…' : '✓ SAVE INSPECTION'}
    </button>
    
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
  
  .dip-title {
    font-size: 0.75rem; letter-spacing: 0.2em; color: #fb923c; font-weight: 700;
  }
  
  .dip-body {
    padding: 1.25rem; display: flex; flex-direction: column; gap: 1.5rem;
  }
  
  .element-info {
    background: #111122; border: 2px solid #2e2e42; border-radius: 10px;
    padding: 1rem;
  }
  
  .element-id {
    font-size: 1.25rem; font-weight: 800; color: #fb923c;
  }
  
  .element-sub {
    font-size: 0.875rem; color: #ccc; margin-top: 0.25rem;
  }
  
  .section {
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  
  .section-label {
    font-size: 0.62rem; letter-spacing: 0.2em; color: #ccc;
  }
  
  /* Checklist */
  .checklist {
    display: flex; flex-direction: column; gap: 0.75rem;
  }
  
  .check-item {
    display: flex; align-items: center; gap: 0.75rem;
    padding: 0.875rem 1rem; background: #111122;
    border: 2px solid #2e2e42; border-radius: 8px;
    cursor: pointer; transition: border-color 0.15s;
  }
  
  .check-item:has(input:checked) {
    border-color: #22c55e;
  }
  
  .check-item input {
    display: none;
  }
  
  .check-box {
    width: 24px; height: 24px; border: 2px solid #3e3e58;
    border-radius: 4px; background: #1a1a2e;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: all 0.15s;
  }
  
  .check-item:has(input:checked) .check-box {
    background: #22c55e; border-color: #22c55e;
  }
  
  .check-item:has(input:checked) .check-box::after {
    content: '✓'; color: #0d0d14; font-size: 1rem; font-weight: 800;
  }
  
  .check-label {
    font-size: 0.95rem; color: #f0f0f0; font-weight: 600;
  }
  
  /* Photo */
  .photo-btn {
    padding: 1.25rem; background: #5b21b6; border: none;
    border-radius: 10px; color: #fff; font-family: inherit;
    font-size: 0.9rem; font-weight: 800; letter-spacing: 0.15em;
    cursor: pointer; transition: background 0.15s;
  }
  .photo-btn:hover { background: #6d28d9; }
  
  .camera-view {
    display: flex; flex-direction: column; gap: 1rem;
    background: #000; border-radius: 10px; overflow: hidden;
  }
  
  video {
    width: 100%; display: block;
  }
  
  .camera-controls {
    display: flex; gap: 0.75rem; padding: 1rem;
    background: #111122;
  }
  
  .capture-btn {
    flex: 1; padding: 1rem; background: #22c55e; border: none;
    border-radius: 8px; color: #0d0d14; font-family: inherit;
    font-size: 0.875rem; font-weight: 800; letter-spacing: 0.15em;
    cursor: pointer;
  }
  
  .cancel-camera-btn {
    padding: 1rem 1.5rem; background: none; border: 2px solid #3e3e58;
    border-radius: 8px; color: #ccc; font-family: inherit;
    font-size: 0.875rem; font-weight: 700; cursor: pointer;
  }
  
  .photo-preview {
    position: relative; border-radius: 10px; overflow: hidden;
    border: 2px solid #2e2e42;
  }
  
  .photo-preview img {
    width: 100%; display: block;
  }
  
  .remove-photo-btn {
    position: absolute; top: 0.5rem; right: 0.5rem;
    padding: 0.5rem 0.875rem; background: rgba(0, 0, 0, 0.8);
    border: 1px solid #ef4444; border-radius: 6px;
    color: #f87171; font-family: inherit; font-size: 0.75rem;
    font-weight: 700; cursor: pointer;
  }
  
  /* Result buttons */
  .result-btns {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;
  }
  
  .result-btn {
    padding: 1.25rem 0.5rem; background: #111122; border: 2px solid #2e2e42;
    border-radius: 10px; font-family: inherit; font-size: 0.875rem;
    font-weight: 800; letter-spacing: 0.1em; cursor: pointer;
    transition: all 0.15s; color: #ccc;
  }
  
  .result-btn.selected {
    border-color: #fb923c; color: #fb923c; background: #2a1800;
  }

  .result-btn-repair.selected {
    border-color: #ea580c; color: #fb923c; background: #2a1000;
  }
  
  /* Notes */
  .notes-input {
    background: #111122; border: 2px solid #2e2e42; border-radius: 8px;
    color: #f0f0f0; font-family: inherit; font-size: 0.875rem;
    padding: 0.875rem 1rem; resize: none; width: 100%; box-sizing: border-box;
  }
  .notes-input:focus { outline: none; border-color: #fb923c; }
  .notes-input::placeholder { color: #777; }
  
  .error-msg {
    font-size: 0.825rem; color: #fca5a5; padding: 0.875rem 1rem;
    background: #2a0000; border: 2px solid #ef4444; border-radius: 8px;
  }
  
  .save-btn {
    padding: 1.25rem; background: #22c55e; border: none; border-radius: 10px;
    color: #0d0d14; font-family: inherit; font-size: 0.9rem; font-weight: 800;
    letter-spacing: 0.2em; cursor: pointer; transition: background 0.15s;
  }
  .save-btn:hover:not(:disabled) { background: #16a34a; }
  .save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
