<!-- src/routes/mor/report/+page.svelte -->
<!-- Public resident MOR intake form. No authentication required.
     Language is deliberately resident-friendly — residents report
     "a safety concern", not an "MOR". -->
<script>
  import lhLogo from '$lib/assets/LH_services_logo.png';

  // ── Form state ─────────────────────────────────────────────────────────
  let description     = '';
  let location_text   = '';
  let urgency         = false;
  let is_anonymous    = false;
  let reporter_name   = '';
  let reporter_contact = '';

  // ── Photo state ─────────────────────────────────────────────────────────
  // Each photo: { id, file, blob, preview, status, url, error }
  // status: 'uploading' | 'done' | 'error'
  let photos = [];
  const MAX_PHOTOS = 5;
  const TEMP_REF = typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString();

  // ── Submission state ────────────────────────────────────────────────────
  let submitting = false;
  let submitted  = false;
  let caseRef    = '';
  let submitError = '';

  // ── Validation errors ───────────────────────────────────────────────────
  let descError = '';

  // ── Photo upload ────────────────────────────────────────────────────────
  async function handleFileSelect(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = ''; // allow re-selecting same file

    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = files.slice(0, remaining);

    for (const file of toAdd) {
      const id      = crypto.randomUUID();
      const preview = URL.createObjectURL(file);
      photos = [...photos, { id, file, preview, status: 'uploading', url: null, error: null }];
      uploadPhoto(id, file);
    }
  }

  async function uploadPhoto(id, file) {
    try {
      const formData = new FormData();
      formData.append('file',        file, file.name || 'photo.jpg');
      formData.append('filename',    `${TEMP_REF}_${id.slice(0, 8)}.jpg`);
      formData.append('folder_path', JSON.stringify(['mor-public-intake', TEMP_REF]));

      const r = await fetch('/api/mor/intake/upload', {
        method: 'POST',
        body:   formData,
      });

      const data = await r.json();

      if (!r.ok) {
        setPhotoState(id, 'error', null, data.error ?? 'Upload failed');
      } else {
        setPhotoState(id, 'done', data.url, null);
      }
    } catch {
      setPhotoState(id, 'error', null, 'Upload failed — please try again');
    }
  }

  function setPhotoState(id, status, url, error) {
    photos = photos.map(p => p.id === id ? { ...p, status, url, error } : p);
  }

  function removePhoto(id) {
    const p = photos.find(ph => ph.id === id);
    if (p?.preview) URL.revokeObjectURL(p.preview);
    photos = photos.filter(ph => ph.id !== id);
  }

  $: uploadingCount = photos.filter(p => p.status === 'uploading').length;
  $: uploadedUrls   = photos.filter(p => p.status === 'done').map(p => p.url);

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    descError   = '';
    submitError = '';

    if (!description.trim()) { descError = 'Please describe what you have seen.'; return; }
    if (description.trim().length < 20) { descError = 'Please provide a bit more detail (at least 20 characters).'; return; }
    if (uploadingCount > 0) { submitError = 'Please wait for all photos to finish uploading.'; return; }

    submitting = true;
    try {
      const r = await fetch('/api/mor/intake/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          description:     description.trim(),
          location_text:   location_text.trim() || null,
          urgency,
          is_anonymous,
          reporter_name:   is_anonymous ? null : reporter_name.trim() || null,
          reporter_contact: is_anonymous ? null : reporter_contact.trim() || null,
          photo_urls:      uploadedUrls,
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        submitError = data.error ?? 'Submission failed. Please try again.';
      } else {
        caseRef   = data.reference;
        submitted = true;
        // Revoke preview object URLs
        photos.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
      }
    } catch {
      submitError = 'Submission failed. Please check your connection and try again.';
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Report a Safety Concern</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="shell">

  <!-- ── Header ──────────────────────────────────────────────────────── -->
  <header class="hdr">
    <img src={lhLogo} alt="LH Services" class="logo" />
  </header>

  <main class="main">

    {#if submitted}
    <!-- ── Confirmation ──────────────────────────────────────────────── -->
    <div class="confirm-box">
      <div class="confirm-tick">✓</div>
      <h1 class="confirm-title">We've received your report</h1>
      <p class="confirm-ref">Your reference number</p>
      <p class="confirm-refnum">{caseRef}</p>
      <p class="confirm-note">
        Please keep this reference number. You can quote it if you need to follow up.
      </p>
      <div class="confirm-steps">
        <h2>What happens next</h2>
        <ol>
          <li>Your report will be reviewed by our building safety team, usually within one working day.</li>
          <li>If the concern may pose a risk to a significant number of people, we are required by law to notify the Building Safety Regulator within 10 days.</li>
          <li>We will keep you informed of any actions taken, if you provided contact details.</li>
        </ol>
      </div>
      <p class="confirm-emergency">
        If you believe there is immediate danger, call <strong>999</strong> now.
      </p>
    </div>

    {:else}
    <!-- ── Emergency callout ─────────────────────────────────────────── -->
    <div class="emergency-box">
      <strong>🚨 Is there an immediate danger?</strong>
      Call <a href="tel:999" class="emergency-link">999</a> first.
      This form is for concerns that are not an active emergency.
    </div>

    <!-- ── Page title ────────────────────────────────────────────────── -->
    <h1 class="page-title">Report a safety concern</h1>
    <p class="page-subtitle">
      Use this form to report a fire safety or structural concern in the building.
      You don't need an account and you can report anonymously.
    </p>

    <!-- ── Form ─────────────────────────────────────────────────────── -->
    <form on:submit|preventDefault={handleSubmit} class="form" novalidate>

      <!-- Description -->
      <div class="field">
        <label for="description" class="label">
          What have you seen? <span class="req">*</span>
        </label>
        <p class="hint">
          Describe what you noticed — what it looks like, where it is, and when you first saw it.
        </p>
        <textarea
          id="description"
          bind:value={description}
          rows="5"
          class="textarea {descError ? 'error-border' : ''}"
          placeholder="e.g. There is a crack in the wall in the corridor on level 4, near the fire door. It appeared about two weeks ago and seems to be getting wider."
        ></textarea>
        {#if descError}<p class="field-error">{descError}</p>{/if}
      </div>

      <!-- Location -->
      <div class="field">
        <label for="location" class="label">Where exactly? <span class="opt">(optional)</span></label>
        <input
          id="location"
          type="text"
          bind:value={location_text}
          class="input"
          placeholder="e.g. Level 4 corridor, near east staircase"
        />
      </div>

      <!-- Urgency -->
      <div class="field">
        <label class="checkbox-label {urgency ? 'urgent-active' : ''}">
          <input type="checkbox" bind:checked={urgency} class="checkbox" />
          <div>
            <span class="checkbox-text {urgency ? 'urgent-text' : ''}">
              ⚠ This is an immediate risk to life
            </span>
            <p class="checkbox-hint">Tick this only if you believe people are in danger right now — and call 999 first.</p>
          </div>
        </label>
      </div>

      <!-- Photos -->
      <div class="field">
        <p class="label">Photos <span class="opt">(optional, up to {MAX_PHOTOS})</span></p>
        <p class="hint">Photos help us understand the concern faster. JPEG, PNG, or HEIC, up to 10 MB each.</p>

        <!-- Uploaded photos -->
        {#if photos.length > 0}
          <div class="photo-grid">
            {#each photos as photo (photo.id)}
              <div class="photo-item">
                <img src={photo.preview} alt="Preview" class="photo-thumb" />
                <div class="photo-status">
                  {#if photo.status === 'uploading'}
                    <span class="status-uploading">Uploading…</span>
                  {:else if photo.status === 'done'}
                    <span class="status-done">✓ Uploaded</span>
                  {:else if photo.status === 'error'}
                    <span class="status-error">{photo.error}</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="photo-remove"
                  on:click={() => removePhoto(photo.id)}
                  aria-label="Remove photo"
                >✕</button>
              </div>
            {/each}
          </div>
        {/if}

        {#if photos.length < MAX_PHOTOS}
          <label class="photo-add-btn">
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/webp"
              multiple
              class="visually-hidden"
              on:change={handleFileSelect}
            />
            + Add photo
          </label>
        {/if}
      </div>

      <!-- Contact details -->
      <div class="field">
        <p class="label">Your contact details <span class="opt">(optional)</span></p>
        <p class="hint">
          We can keep you updated on what we find and what actions we take.
          Leave blank to report anonymously.
        </p>

        {#if !is_anonymous}
          <div class="contact-grid">
            <div>
              <label for="rep-name" class="sub-label">Name</label>
              <input id="rep-name" type="text" bind:value={reporter_name}
                class="input" placeholder="Your name" />
            </div>
            <div>
              <label for="rep-contact" class="sub-label">Email or phone</label>
              <input id="rep-contact" type="text" bind:value={reporter_contact}
                class="input" placeholder="email@example.com or 07700 000000" />
            </div>
          </div>
        {:else}
          <p class="anon-note">Your report will be submitted without any identifying information.</p>
        {/if}

        <label class="checkbox-label mt-2">
          <input type="checkbox" bind:checked={is_anonymous} class="checkbox" />
          <span class="checkbox-text">Report anonymously</span>
        </label>
      </div>

      <!-- Privacy notice -->
      <p class="privacy">
        Your information is held securely and used only to investigate this safety concern.
        If you provide contact details, we will only use them to keep you informed about this report.
        We may share relevant details with the Building Safety Regulator if required by law.
      </p>

      <!-- Submit error -->
      {#if submitError}
        <div class="submit-error">{submitError}</div>
      {/if}

      <!-- Submit button -->
      <button type="submit" class="submit-btn" disabled={submitting}>
        {#if submitting}
          Sending…
        {:else}
          Send report
        {/if}
      </button>

    </form>
    {/if}

  </main>
</div>

<style>
  :global(body) { background: #f8fafc; margin: 0; }

  .shell {
    min-height: 100vh;
    background: #f8fafc;
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    color: #1e293b;
  }

  /* ── Header ── */
  .hdr {
    background: #0f172a;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid #1e293b;
  }
  .logo { height: 38px; width: auto; display: block; }

  /* ── Main ── */
  .main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }

  /* ── Emergency callout ── */
  .emergency-box {
    background: #fef2f2;
    border: 1.5px solid #fca5a5;
    border-radius: 0.5rem;
    padding: 0.875rem 1rem;
    font-size: 0.9375rem;
    color: #991b1b;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }
  .emergency-link {
    color: #991b1b;
    font-weight: 700;
    font-size: 1.125rem;
  }

  /* ── Page title ── */
  .page-title {
    font-size: 1.625rem;
    font-weight: 700;
    margin: 0 0 0.5rem;
    color: #0f172a;
    line-height: 1.25;
  }
  .page-subtitle {
    color: #475569;
    font-size: 0.9375rem;
    margin: 0 0 1.75rem;
    line-height: 1.6;
  }

  /* ── Form ── */
  .form { display: flex; flex-direction: column; gap: 1.5rem; }

  .field { display: flex; flex-direction: column; gap: 0.4rem; }

  .label {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #1e293b;
  }
  .req { color: #dc2626; }
  .opt { color: #94a3b8; font-weight: 400; font-size: 0.8125rem; }
  .hint { font-size: 0.8125rem; color: #64748b; margin: 0; line-height: 1.5; }

  .input, .textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1.5px solid #cbd5e1;
    border-radius: 0.5rem;
    font-size: 1rem;
    color: #1e293b;
    background: #fff;
    box-sizing: border-box;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  .input:focus, .textarea:focus {
    outline: none;
    border-color: #3c9683;
    box-shadow: 0 0 0 3px rgba(60, 150, 131, 0.15);
  }
  .textarea { resize: vertical; line-height: 1.6; }
  .error-border { border-color: #dc2626; }
  .field-error { font-size: 0.8125rem; color: #dc2626; margin: 0; }

  /* ── Urgency checkbox ── */
  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    cursor: pointer;
    padding: 0.75rem;
    border: 1.5px solid #e2e8f0;
    border-radius: 0.5rem;
    background: #fff;
    transition: border-color 0.15s, background 0.15s;
  }
  .checkbox-label:hover { border-color: #94a3b8; }
  .urgent-active { border-color: #fca5a5; background: #fef2f2; }
  .mt-2 { margin-top: 0.5rem; }

  .checkbox {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: #3c9683;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  .checkbox-text { font-size: 0.9375rem; font-weight: 500; color: #1e293b; }
  .urgent-text   { color: #b91c1c; }
  .checkbox-hint { font-size: 0.8125rem; color: #64748b; margin: 0.2rem 0 0; line-height: 1.4; }

  /* ── Photos ── */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .photo-item {
    position: relative;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1.5px solid #e2e8f0;
    background: #f1f5f9;
  }
  .photo-thumb {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
  }
  .photo-status {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0.2rem 0.25rem;
    font-size: 0.65rem;
    text-align: center;
    line-height: 1.2;
  }
  .status-uploading { color: #f8fafc; background: rgba(0,0,0,0.5); display: block; }
  .status-done      { color: #f8fafc; background: rgba(22,163,74,0.8); display: block; }
  .status-error     { color: #fef2f2; background: rgba(220,38,38,0.85); display: block; }

  .photo-remove {
    position: absolute;
    top: 0.2rem;
    right: 0.2rem;
    width: 1.25rem;
    height: 1.25rem;
    background: rgba(0,0,0,0.55);
    border: none;
    border-radius: 50%;
    color: #fff;
    font-size: 0.625rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .photo-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    border: 1.5px dashed #94a3b8;
    border-radius: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    background: #fff;
    transition: border-color 0.15s, color 0.15s;
  }
  .photo-add-btn:hover { border-color: #3c9683; color: #3c9683; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

  /* ── Contact ── */
  .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .sub-label { display: block; font-size: 0.8125rem; font-weight: 500; color: #475569; margin-bottom: 0.25rem; }
  .anon-note { font-size: 0.875rem; color: #64748b; font-style: italic; }

  /* ── Privacy ── */
  .privacy {
    font-size: 0.75rem;
    color: #94a3b8;
    line-height: 1.6;
    margin: 0;
  }

  /* ── Submit ── */
  .submit-error {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    color: #991b1b;
  }

  .submit-btn {
    width: 100%;
    padding: 0.875rem;
    background: #1e293b;
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    font-family: inherit;
    min-height: 44px; /* touch target */
  }
  .submit-btn:hover:not(:disabled) { background: #0f172a; }
  .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ── Confirmation ── */
  .confirm-box {
    background: #fff;
    border: 1.5px solid #bbf7d0;
    border-radius: 0.75rem;
    padding: 2rem 1.5rem;
    text-align: center;
  }
  .confirm-tick {
    width: 3rem;
    height: 3rem;
    background: #dcfce7;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    color: #16a34a;
    margin: 0 auto 1rem;
  }
  .confirm-title {
    font-size: 1.375rem;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 1.25rem;
  }
  .confirm-ref    { font-size: 0.8125rem; color: #64748b; margin: 0 0 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .confirm-refnum { font-size: 1.5rem; font-weight: 700; font-family: monospace; color: #0f172a; margin: 0 0 0.75rem; }
  .confirm-note   { font-size: 0.875rem; color: #475569; margin: 0 0 1.5rem; line-height: 1.6; }
  .confirm-steps  { text-align: left; background: #f8fafc; border-radius: 0.5rem; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }
  .confirm-steps h2 { font-size: 0.9375rem; font-weight: 600; color: #1e293b; margin: 0 0 0.625rem; }
  .confirm-steps ol { margin: 0; padding-left: 1.25rem; }
  .confirm-steps li { font-size: 0.875rem; color: #475569; margin-bottom: 0.4rem; line-height: 1.5; }
  .confirm-emergency { font-size: 0.875rem; color: #dc2626; font-weight: 500; margin: 0; }

  /* ── Responsive ── */
  @media (max-width: 480px) {
    .contact-grid { grid-template-columns: 1fr; }
    .confirm-box  { padding: 1.5rem 1rem; }
  }
</style>
