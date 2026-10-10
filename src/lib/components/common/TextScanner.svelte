<!-- src/lib/components/common/TextScanner.svelte
     Point the camera at a number — a number plate, a door number — and pick
     what it read (2026-10-10). Shared: any screen can use it.

     ⛔ Nothing leaves the phone. The picture is read on the phone by
     #lib/utils/textScan/ocrReader.js and never uploaded or kept; only the
     value the person picks is handed back.

     ⭐ It does not trust the reader on its own. What is read is matched against
     `candidates` — the values the screen already knows — allowing for letters a
     reader confuses (scanMatch.js), and the person picks. What was read is
     offered too, for a value on no list.

     Full-screen and dark whatever the app's theme: it is a camera view, and it
     sits above both the standard apps and the phone apps. Scoped styles only,
     so it works in either. The accent follows `accent`.

     Usage:
       <TextScanner profile="registration" candidates={[{ value: 'AB12 CDE' }]}
         on:pick={(e) => use(e.detail.value)} on:close={() => (open = false)} />
     The parent closes it (on pick or close). -->
<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { startReader, readText } from '#lib/utils/textScan/ocrReader.js';
  import { matchScan, readingsFrom, scanProfile } from '#lib/utils/textScan/scanMatch.js';
  import { guideCrop, readSize, greyAndStretch } from '#lib/utils/textScan/scanImage.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { cameraHelp } from '#lib/utils/textScan/cameraHelp.js';
  import { createScanTally } from '#lib/utils/textScan/scanTally.js';
  import { scanStatus, boxState } from '#lib/utils/textScan/scanFeedback.js';

  /** 'registration' | 'number', or a profile object (scanMatch.js) */
  export let profile = 'registration';
  /** @type {Array<{ value: string, label?: string, hint?: string }>} */
  export let candidates = [];
  export let title = '';
  /** Guide box shape, wide to 1 high; the profile's own when 0. */
  export let aspect = 0;
  export let accent = 'var(--lh-accent, #3c9683)';

  const dispatch = createEventDispatcher();
  const prof = scanProfile(profile);
  const boxAspect = aspect || prof.aspect;
  const BOX_FRACTION = 0.82;

  /** @type {HTMLVideoElement} */ let video;
  /** @type {MediaStream|null} */ let stream = null;
  let status = 'Starting the camera…';
  /** @type {import('#lib/utils/textScan/cameraHelp.js').CameraHelp|null} */
  let cameraError = null;
  let readerReady = false;
  let readerError = '';
  let lastRead = '';                 // the best reading of the latest read that found any
  /** @type {any[]} */ let matches = [];
  let torchAvailable = false;
  let torchOn = false;
  let stopped = false;
  let reading = false;
  /** @type {any} */ let timer = null;

  // Feedback while it works (scanFeedback.js): it must never look hung.
  let seeing = '';              // what the latest live frame read, '' for nothing
  let note = '';                // a one-off message (a photo's result, an error) over the live line
  let sinceAt = Date.now();     // when it started looking for the current answer
  let nowTick = Date.now();     // advances twice a second, so the hints move on even between slow frames
  let hadAnswer = false;
  let held = false;             // a definite answer is held (scanTally.js) — misreads no longer shown
  /** @type {any} */ let ticker = null;
  $: live = !!stream && readerReady && !cameraError;
  $: answered = matches.length > 0 || !!lastRead;
  $: if (answered) hadAnswer = true;
  $: if (!answered && hadAnswer) { hadAnswer = false; sinceAt = Date.now(); }
  $: liveStatus = scanStatus({ elapsedMs: nowTick - sinceAt, seeing, matched: matches.length > 0,
    reading: lastRead, torchAvailable, torchOn });
  $: frame = boxState({ seeing, matched: matches.length > 0, reading: lastRead });

  onMount(() => {
    startReader().then(() => { readerReady = true; loop(); })
      .catch((err) => { readerError = errMessage(err, 'The text reader could not start.'); });
    startCamera();
  });

  async function startCamera() {
    cameraError = null;
    status = 'Starting the camera…';
    try {
      // The site's own Permissions-Policy can switch the camera off; no phone
      // setting overrides it, so say so rather than send them to their settings.
      const pp = /** @type {any} */ (document).permissionsPolicy ?? /** @type {any} */ (document).featurePolicy;
      if (pp?.allowsFeature && !pp.allowsFeature('camera')) {
        throw Object.assign(new Error('blocked by the site'), { name: 'PolicyBlocked' });
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        // Only a secure (https) page may use the camera; elsewhere the API is absent.
        throw Object.assign(new Error('no camera API'), { name: window.isSecureContext ? 'NotFoundError' : 'InsecureContext' });
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (stopped) { stopStream(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      torchAvailable = !!(/** @type {any} */ (track?.getCapabilities?.() ?? {})).torch;
      status = '';
      sinceAt = Date.now();
      clearInterval(ticker);
      ticker = setInterval(() => { nowTick = Date.now(); }, 500);
      loop();
    } catch (/** @type {any} */ err) {
      cameraError = cameraHelp(err?.name, navigator.userAgent, navigator.maxTouchPoints ?? 0);
      status = '';
    }
  }

  onDestroy(() => { stopped = true; clearTimeout(timer); clearInterval(ticker); stopStream(); });

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // Read the guide box about twice a second while the camera runs.
  function loop() {
    clearTimeout(timer);
    if (stopped || !readerReady || !stream) return;
    timer = setTimeout(async () => {
      if (stopped || reading || document.hidden || !video?.videoWidth) { loop(); return; }
      reading = true;
      try { await readFrame(); }
      catch (/** @type {any} */ err) { note = errMessage(err, 'Could not read that.'); }
      finally { reading = false; loop(); }
    }, 450);
  }

  async function readFrame() {
    const rect = video.getBoundingClientRect();
    const crop = guideCrop({
      frameW: video.videoWidth, frameH: video.videoHeight,
      viewW: rect.width, viewH: rect.height, boxFraction: BOX_FRACTION, aspect: boxAspect,
    });
    const size = readSize(crop.w, crop.h);
    const canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
    ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h);
    const img = ctx.getImageData(0, 0, size.w, size.h);
    greyAndStretch(img.data);
    ctx.putImageData(img, 0, 0);
    const { text, confidence } = await readText(canvas, prof);
    takeFrame(text, confidence);
  }

  // Live frames vote (scanTally.js): one frame is a poor witness, and showing
  // each in turn made the answer jump about on a real phone.
  const tally = createScanTally();

  /** One live frame. @param {string} text @param {number} confidence */
  function takeFrame(text, confidence) {
    const now = Date.now();
    tally.add(now, {
      matches: matchScan(text, candidates, prof),
      reading: readingsFrom(text, prof)[0] ?? null,
      confidence,
    });
    const v = tally.view(now);
    matches = v.matches;
    lastRead = v.reading ?? '';
    held = v.held;
    seeing = readingsFrom(text, prof)[0] ?? '';
    if (seeing) note = '';        // live reading has moved on from any one-off message
  }

  /**
   * A photo: one deliberate picture, shown as read. One that reads nothing
   * leaves the last answer alone. @param {string} text @returns {boolean} read anything
   */
  function takePhoto(text) {
    const readings = readingsFrom(text, prof);
    if (!readings.length) return false;
    tally.reset();
    held = false;
    lastRead = readings[0];
    matches = matchScan(text, candidates, prof);
    note = matches.length ? 'Tap the one that matches' : 'Not one this screen knows — use what was read, or try again';
    return true;
  }

  /** A photo instead of the live camera: read the whole picture. */
  async function readPhoto(/** @type {Event} */ e) {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
    if (!file) return;
    note = 'Reading the photo…';
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      greyAndStretch(img.data);
      ctx.putImageData(img, 0, 0);
      const { text } = await readText(canvas, prof, { wholePicture: true });
      if (!takePhoto(text)) note = 'Nothing could be read in that photo. Try again closer, or type it.';
    } catch (/** @type {any} */ err) {
      note = errMessage(err, 'The photo could not be read.');
    }
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: !torchOn }] }));
      torchOn = !torchOn;
    } catch (/** @type {any} */ err) {
      torchAvailable = false;
      note = errMessage(err, 'The light could not be switched on.');
    }
  }

  /** @param {string} value @param {any} candidate */
  function pick(value, candidate = null) {
    stopped = true; clearTimeout(timer); clearInterval(ticker); stopStream();
    dispatch('pick', { value, candidate });
  }
  function close() { stopped = true; clearTimeout(timer); clearInterval(ticker); stopStream(); dispatch('close'); }
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && close()} />

<div class="ts" role="dialog" aria-modal="true" aria-label={title || `Scan a ${prof.label.toLowerCase()}`}
  style="--ts-accent: {accent}" data-testid="text-scanner">
  <div class="ts-head">
    <span class="ts-title">{title || `Scan a ${prof.label.toLowerCase()}`}</span>
    <button class="ts-btn" on:click={close}>Close</button>
  </div>

  <div class="ts-view">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted autoplay></video>
    {#if !cameraError}
      <div class="ts-box ts-box-{frame}" data-state={frame} style="width: {BOX_FRACTION * 100}%; aspect-ratio: {boxAspect}">
        <!-- A line sweeping through the box while it reads: it is working. -->
        {#if live && frame !== 'found'}<div class="ts-sweep" data-testid="scan-sweep"></div>{/if}
      </div>
    {/if}
    {#if cameraError}
      <div class="ts-msg" role="alert">
        <p class="ts-warn ts-help-title">{cameraError.title}</p>
        {#if cameraError.steps.length}
          <ol class="ts-steps">{#each cameraError.steps as step}<li>{step}</li>{/each}</ol>
        {/if}
        <p class="ts-help-alt">Or use <b>Take a photo</b> below — that does not need this permission.</p>
        {#if cameraError.retry}<button class="ts-btn ts-primary-plain" on:click={startCamera}>Try again</button>{/if}
      </div>
    {/if}
  </div>

  <div class="ts-panel">
    {#if readerError}
      <p class="ts-warn">{readerError}</p>
    {:else if !readerReady}
      <p class="ts-status">Getting the reader ready… (the first time can take a little while)</p>
    {:else if note || status}
      <p class="ts-status" aria-live="polite">{note || status}</p>
    {:else if live}
      <p class="ts-status" aria-live="polite" data-testid="scan-status">{liveStatus}</p>
    {/if}
    {#if live && seeing && !matches.length && !held}
      <p class="ts-seeing" data-testid="scan-seeing">Seeing: <span>{seeing}</span></p>
    {/if}

    {#if matches.length}
      <div class="ts-matches">
        {#each matches as m (m.value + "#" + (m.id ?? ""))}
          <button class="ts-match" on:click={() => pick(m.value, m)}>
            <span class="ts-value">{m.value}</span>
            {#if m.label}<span class="ts-label">{m.label}</span>{/if}
            {#if !m.exact}<span class="ts-hint">close match</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="ts-actions">
      {#if lastRead}
        <button class="ts-btn ts-primary" on:click={() => pick(lastRead)}>Use “{lastRead}”</button>
      {/if}
      {#if torchAvailable}
        <button class="ts-btn" on:click={toggleTorch} aria-pressed={torchOn}>{torchOn ? 'Light off' : 'Light on'}</button>
      {/if}
      <label class="ts-btn">
        Take a photo
        <input type="file" accept="image/*" capture="environment" on:change={readPhoto} />
      </label>
    </div>
    <p class="ts-note">Read on this device — the picture is not sent or kept.</p>
  </div>
</div>

<style>
  .ts {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; flex-direction: column;
    background: #0d0d14; color: #e2e8f0;
    font-family: inherit;
  }
  .ts-head { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; gap: 0.5rem; }
  .ts-title { font-weight: 600; }
  .ts-view { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; background: #000; }
  .ts-view video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ts-box-looking { border-color: var(--ts-accent); }
  .ts-box-seeing  { border-color: #fbbf24 !important; }
  .ts-box-found   { border-color: #4ade80 !important; }
  .ts-sweep {
    position: absolute; left: 4%; right: 4%; height: 2px; top: 0;
    background: currentColor; color: #fbbf24; opacity: 0.8;
    box-shadow: 0 0 8px 1px rgb(251 191 36 / 0.6);
    animation: ts-sweep 1.6s ease-in-out infinite alternate;
  }
  .ts-box-looking .ts-sweep { color: #e2e8f0; box-shadow: 0 0 8px 1px rgb(226 232 240 / 0.5); }
  @keyframes ts-sweep { from { top: 6%; } to { top: 92%; } }
  @media (prefers-reduced-motion: reduce) {
    .ts-sweep { animation: none; top: 50%; opacity: 0.5; }
  }
  .ts-seeing { margin: 0; font-size: 0.8rem; color: #94a3b8; }
  .ts-seeing span { font-family: ui-monospace, monospace; letter-spacing: 0.05em; color: #cbd5e1; }
  .ts-box {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    max-height: 90%;
    border: 3px solid var(--ts-accent); border-radius: 8px;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
  .ts-msg {
    position: absolute; inset: 0.75rem; overflow-y: auto;
    display: flex; flex-direction: column; justify-content: center; gap: 0.5rem;
    padding: 1rem; border-radius: 8px; background: rgb(13 13 20 / 0.92);
  }
  .ts-help-title { font-weight: 600; font-size: 1rem; }
  .ts-steps { margin: 0; padding-left: 1.4rem; list-style: decimal; font-size: 0.9rem; color: #e2e8f0; }
  .ts-steps li + li { margin-top: 0.4rem; }
  .ts-help-alt { margin: 0; font-size: 0.85rem; color: #94a3b8; }
  .ts-btn.ts-primary-plain { align-self: flex-start; background: var(--ts-accent); border-color: var(--ts-accent); color: #fff; }
  .ts-panel { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; max-height: 50vh; overflow-y: auto; }
  .ts-status { margin: 0; font-size: 0.9rem; color: #cbd5e1; }
  .ts-warn { margin: 0; font-size: 0.9rem; color: #fbbf24; }
  .ts-matches { display: flex; flex-direction: column; gap: 0.4rem; }
  .ts-match {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.6rem;
    min-height: 44px; padding: 0.5rem 0.75rem; text-align: left;
    background: #1e293b; color: #fff; border: 2px solid var(--ts-accent); border-radius: 8px; cursor: pointer;
  }
  .ts-value { font-family: ui-monospace, monospace; font-size: 1.15rem; letter-spacing: 0.05em; }
  .ts-label { font-size: 0.8rem; color: #94a3b8; }
  .ts-hint { font-size: 0.75rem; color: #fbbf24; }
  .ts-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .ts-btn {
    position: relative; display: inline-flex; align-items: center; justify-content: center;
    min-height: 44px; padding: 0 0.9rem; border-radius: 8px; cursor: pointer;
    background: #334155; color: #e2e8f0; border: 1px solid #475569; font-size: 0.9rem;
  }
  .ts-primary { background: var(--ts-accent); border-color: var(--ts-accent); color: #fff; font-family: ui-monospace, monospace; }
  .ts-btn input[type='file'] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .ts-note { margin: 0; font-size: 0.75rem; color: #64748b; }
</style>
