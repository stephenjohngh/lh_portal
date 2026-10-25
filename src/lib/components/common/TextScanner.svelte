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
  import { guideCrop, readSize, greyAndStretch, blackAndWhite, clearEdgesAndSpecks, closeGaps, withMargin, preparePlate } from '#lib/utils/textScan/scanImage.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { getPref, setPref } from '#lib/utils/prefs.js';
  import { findPlate, plateCrop } from '#lib/utils/textScan/plateFinder.js';
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
  /** VERDICT MODE (2026-10-25, Car check): give a function that answers for a
   *  plate and the scanner shows the answer itself instead of offering matches:
   *  top row Back / New scan / Debug, the best guess so far with its confidence,
   *  and once the read is definite the plate with the answer's headline
   *  (Permit Found / No Permit); tapping it opens the details with a Create
   *  report button (event `report`). The function returns
   *  { plate, tone: 'ok'|'pending'|'ended'|'none', headline, title,
   *    lines: [{ text, href? }], notes } for a value.
   *  @type {null | ((value: string) => Promise<any>)} */
  export let checker = null;
  /** The Take a photo button (2026-10-25: Car check turns it off — a photo did not read better than the live camera). */
  export let allowPhoto = true;
  /** Whether the person may make a report (shows Create report). */
  export let canReport = false;

  const dispatch = createEventDispatcher();
  const prof = scanProfile(profile);
  const boxAspect = aspect || prof.aspect;
  // FIND-FIRST (2026-10-23, for trying out; the header button switches it): the
  // guide box becomes a wide search area, the plate is found inside it
  // (plateFinder.js) and only the plate is read. Off, the box is the plate-
  // shaped one it always was. Number plates only.
  const CAN_FIND = profile === 'registration';
  const SEARCH_FRACTION = 0.94, SEARCH_ASPECT = 2.4, FIND_WIDTH = 320;
  let findFirst = CAN_FIND && getPref('scan.findFirst', '1') !== '0';
  const PLAIN_FRACTION = prof.boxFraction ?? 0.82;
  $: BOX_FRACTION = findFirst ? SEARCH_FRACTION : PLAIN_FRACTION;
  $: BOX_ASPECT = findFirst ? SEARCH_ASPECT : boxAspect;
  /** Where the latest frame found the plate, as percentages of the box, or null. */
  let plateRect = /** @type {{ l: number, t: number, w: number, h: number } | null} */ (null);
  function toggleFind() {
    findFirst = !findFirst;
    setPref('scan.findFirst', findFirst ? '1' : '0');
    plateRect = null; matches = []; lastRead = ''; seeing = ''; held = false;
    tally.reset?.();
  }

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
  // A photo pauses live scanning (2026-10-12: a photo's result was replaced
  // half a second later by the next live frame, so it looked as if the photo
  // went straight back to scanning). Its result stays until "Scan live again".
  let photoMode = false;
  let photoUrl = '';            // the photo, shown where the live picture was

  // -- Diagnostics (2026-10-12): "What the reader sees" shows the picture the
  // reader was last given -- the camera crop as taken and as prepared -- with
  // what it read and how sure it was, and can save both. For finding out why a
  // plate will not read; nothing is kept or sent unless Save is pressed, and
  // then only to this phone.
  let diagOn = false;
  /** @type {null | { raw: string, prepared: string, text: string, confidence: number, info: string }} */
  let diag = null;
  /** @type {{ raw: HTMLCanvasElement, out: HTMLCanvasElement } | null} */
  let diagCanvases = null;
  let focusInfo = '';
  $: live = !!stream && readerReady && !cameraError && !photoMode;

  // -- Verdict mode: the best guess so far, and the answer once it is decided.
  let guess = '';
  let guessConf = 0;
  /** @type {Map<string, number>} reading to the best confidence it was read with */
  let readConf = new Map();
  /** @type {any} */ let verdict = null;
  let verdictFor = '';
  let verdictBusy = false;
  let verdictError = '';
  let showDetails = false;
  const flatKey = (/** @type {string} */ v) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Decided: a definite answer is held (or a photo was read). A known plate's
  // own spelling wins over the raw reading.
  $: decidedValue = checker && (held || photoMode) ? (matches[0]?.value ?? lastRead) : '';
  $: if (checker && decidedValue !== verdictFor) runChecker(decidedValue);

  /** @param {string} value */
  async function runChecker(value) {
    verdictFor = value; verdict = null; verdictError = ''; showDetails = false;
    if (!value || !checker) return;
    verdictBusy = true;
    try {
      const r = await checker(value);
      if (verdictFor === value) verdict = r;
    } catch (/** @type {any} */ err) {
      if (verdictFor === value) verdictError = errMessage(err, 'That plate could not be checked.');
    } finally { if (verdictFor === value) verdictBusy = false; }
  }

  function newScan() {
    readConf = new Map(); guess = ''; guessConf = 0;
    verdict = null; verdictFor = ''; verdictError = ''; showDetails = false;
    if (photoMode) { scanLiveAgain(); return; }
    tally.reset();
    matches = []; lastRead = ''; held = false; note = ''; seeing = '';
    sinceAt = Date.now();
  }

  function createReport() {
    const value = decidedValue, notes = verdict?.notes ?? '';
    stopped = true; clearTimeout(timer); clearInterval(ticker); stopStream();
    dispatch('report', { value, notes, verdict });
  }
  $: answered = matches.length > 0 || !!lastRead;
  $: if (answered) hadAnswer = true;
  $: if (!answered && hadAnswer) { hadAnswer = false; sinceAt = Date.now(); }
  $: liveStatus = scanStatus({ elapsedMs: nowTick - sinceAt, seeing, matched: !checker && matches.length > 0,
    reading: checker ? '' : lastRead, torchAvailable, torchOn });
  $: frame = boxState({ seeing, matched: matches.length > 0 || !!decidedValue, reading: lastRead });

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
      const caps = /** @type {any} */ (track?.getCapabilities?.() ?? {});
      torchAvailable = !!caps.torch;
      // Keep refocusing (2026-10-12): a frame from the live feed is often softer
      // than a photo. Only where the camera says it can.
      focusInfo = 'focus: not adjustable';
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        try {
          await track.applyConstraints(/** @type {any} */ ({ advanced: [{ focusMode: 'continuous' }] }));
          focusInfo = 'focus: continuous';
        } catch (/** @type {any} */ err) { focusInfo = `focus: could not set (${errMessage(err, 'refused')})`; }
      } else if (Array.isArray(caps.focusMode)) {
        focusInfo = `focus: ${caps.focusMode.join('/') || 'fixed'}`;
      }
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

  onDestroy(() => { stopped = true; clearTimeout(timer); clearInterval(ticker); stopStream(); dropPhoto(); });

  function dropPhoto() { if (photoUrl) URL.revokeObjectURL?.(photoUrl); photoUrl = ''; }

  /** Stop live scanning for a photo — and free the camera for the phone's camera app. */
  function pauseForPhoto() {
    photoMode = true;
    clearTimeout(timer);
    stopStream();
    seeing = '';
  }

  /** Back to the live camera, starting afresh. */
  function scanLiveAgain() {
    photoMode = false;
    dropPhoto();
    tally.reset();
    matches = []; lastRead = ''; held = false; note = ''; seeing = '';
    sinceAt = Date.now();
    startCamera();
  }

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // Read the guide box about twice a second while the camera runs.
  function loop() {
    clearTimeout(timer);
    if (stopped || photoMode || !readerReady || !stream) return;
    timer = setTimeout(async () => {
      if (photoMode) return;
      if (stopped || reading || document.hidden || !video?.videoWidth) { loop(); return; }
      reading = true;
      try { await readFrame(); }
      catch (/** @type {any} */ err) { note = errMessage(err, 'Could not read that.'); }
      finally { reading = false; if (!photoMode) loop(); }
    }, 450);
  }

  /**
   * Draw the picture, then make it what the reader reads best (2026-10-12/13,
   * tuned on the user's car-park pictures): grey with the contrast stretched,
   * black and white (which way round judged from the middle), dark areas
   * touching the edge and specks cleared, small gaps in letters closed, and a
   * white margin so the letters do not touch the edge. Returns the canvas for the reader, and
   * the drawn one for the diagnostics.
   * `way` 'plate' is the second preparation for a number plate (2026-10-17,
   * scanImage.js preparePlate): it reads a plate under a light or half in
   * shadow that the usual one cannot, and misses some the usual one reads.
   * @param {(ctx: CanvasRenderingContext2D) => void} draw
   * @param {number} w @param {number} h
   * @param {'usual'|'plate'} [way]
   */
  function prepare(draw, w, h, way = 'usual') {
    const raw = document.createElement('canvas');
    raw.width = w; raw.height = h;
    const rctx = /** @type {CanvasRenderingContext2D} */ (raw.getContext('2d', { willReadFrequently: true }));
    draw(rctx);
    const img = rctx.getImageData(0, 0, w, h);
    const work = new Uint8ClampedArray(img.data);
    let bw = { inverted: false };
    if (way === 'plate') preparePlate(work, w, h);
    else {
      greyAndStretch(work);
      // Black and white by comparing each spot with its neighbourhood, so a plate
      // under a light keeps its pale letters; which way round is judged from the
      // middle, where the dark bodywork round a plate cannot fool it.
      bw = blackAndWhite(work, w, h);
      // The bodywork, bumper and plate border touch the crop's edge and were
      // read as letters; a nick in a letter's stroke read a D as "II".
      clearEdgesAndSpecks(work, w, h);
      closeGaps(work, w, h, 1);
    }
    const padded = withMargin(work, w, h, Math.max(4, Math.round(h * 0.15)));
    const out = document.createElement('canvas');
    out.width = padded.w; out.height = padded.h;
    const octx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
    const outImg = octx.createImageData(padded.w, padded.h);
    outImg.data.set(padded.data);
    octx.putImageData(outImg, 0, 0);
    return { raw, out, bw };
  }

  /**
   * Keep the latest picture and reading for the diagnostics, when they are on.
   * @param {HTMLCanvasElement} raw @param {HTMLCanvasElement} out
   * @param {string} text @param {number} confidence @param {string} info
   */
  function noteDiag(raw, out, text, confidence, info) {
    if (!diagOn) return;
    diagCanvases = { raw, out };
    try {
      diag = { raw: raw.toDataURL('image/png'), prepared: out.toDataURL('image/png'), text, confidence, info };
    } catch (/** @type {any} */ err) {
      diag = { raw: '', prepared: '', text, confidence, info: `${info} · picture could not be shown: ${errMessage(err, 'error')}` };
    }
  }

  async function saveDiag() {
    if (!diagCanvases) return;
    // Loaded only when Save is pressed: download.js brings the sign-in client
    // with it, which a camera screen otherwise has no need of.
    const { downloadBlob } = await import('#lib/utils/download.js');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    /** @type {[string, HTMLCanvasElement][]} */
    const pics = [['camera', diagCanvases.raw], ['prepared', diagCanvases.out]];
    for (const [name, c] of pics) {
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      if (blob) downloadBlob(/** @type {Blob} */ (blob), `scan_${stamp}_${name}.png`);
    }
  }

  let frameTurn = 0;
  async function readFrame() {
    const rect = video.getBoundingClientRect();
    const view = { frameW: video.videoWidth, frameH: video.videoHeight, viewW: rect.width, viewH: rect.height };
    const finding = CAN_FIND && findFirst;
    let crop = guideCrop({ ...view, boxFraction: BOX_FRACTION, aspect: BOX_ASPECT });
    let foundNote = '';
    if (finding) {
      // Look for the plate in the whole search area, on a small copy, then read
      // only the plate, cut from the full-size frame. Nothing found: read the
      // plate-shaped middle, as with find-first off.
      const sw = FIND_WIDTH, sh = Math.max(8, Math.round(sw * crop.h / crop.w));
      const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
      const sctx = /** @type {CanvasRenderingContext2D} */ (sc.getContext('2d', { willReadFrequently: true }));
      sctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, sw, sh);
      const t0 = performance.now();
      const f = findPlate(sctx.getImageData(0, 0, sw, sh).data, sw, sh);
      const ms = Math.round(performance.now() - t0);
      if (f) {
        const c = plateCrop(f, sw, sh);
        plateRect = { l: (c.x / sw) * 100, t: (c.y / sh) * 100, w: (c.w / sw) * 100, h: (c.h / sh) * 100 };
        foundNote = `plate found (${ms} ms) · `;
        crop = { x: Math.round(crop.x + (c.x / sw) * crop.w), y: Math.round(crop.y + (c.y / sh) * crop.h),
                 w: Math.max(1, Math.round((c.w / sw) * crop.w)), h: Math.max(1, Math.round((c.h / sh) * crop.h)) };
      } else {
        plateRect = null;
        foundNote = `no plate found (${ms} ms), read the middle · `;
        crop = guideCrop({ ...view, boxFraction: PLAIN_FRACTION, aspect: boxAspect });
      }
    }
    const size = readSize(crop.w, crop.h);
    // A number plate is read the two ways in turn, and the frames vote: each
    // way reads plates the other cannot (2026-10-17, the user's pictures 7–9).
    const way = profile === 'registration' && (frameTurn++ % 2 === 1) ? 'plate' : 'usual';
    const { raw, out, bw } = prepare(
      (ctx) => ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h), size.w, size.h, way);
    const { text, confidence } = await readText(out, prof);
    noteDiag(raw, out, text, confidence,
      `camera ${video.videoWidth}×${video.videoHeight} · box ${crop.w}×${crop.h} px · read at ${size.w}×${size.h} · `
      + `${foundNote}${way === 'plate' ? 'plate way · ' : ''}${bw.inverted ? 'light on dark, turned round · ' : ''}${focusInfo}`);
    if (photoMode) return;            // a photo was taken while this frame was read
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
    if (seeing) readConf.set(flatKey(seeing), Math.max(readConf.get(flatKey(seeing)) ?? 0, confidence));
    guess = matches[0]?.value || lastRead || seeing;
    guessConf = Math.round(readConf.get(flatKey(guess)) ?? (flatKey(guess) === flatKey(seeing) ? confidence : 0));
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
    if (!file) {                      // the camera app was cancelled
      if (photoMode && !photoUrl) scanLiveAgain();
      return;
    }
    pauseForPhoto();
    dropPhoto();
    photoUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
    note = 'Reading the photo…';
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const { raw, out, bw } = prepare((ctx) => ctx.drawImage(bmp, 0, 0, w, h), w, h);
      const { text, confidence } = await readText(out, prof, { wholePicture: true });
      noteDiag(raw, out, text, confidence,
        `photo ${bmp.width}×${bmp.height} · read at ${w}×${h}${bw.inverted ? ' · light on dark, turned round' : ''}`);
      if (!takePhoto(text)) note = 'Nothing could be read in that photo. Try again closer, or type it.';
      /** @type {HTMLInputElement} */ (e.target).value = '';
    } catch (/** @type {any} */ err) {
      note = errMessage(err, 'The photo could not be read.');
    }
  }

  function toggleDiag() {
    diagOn = !diagOn;
    if (!diagOn) { diag = null; diagCanvases = null; }
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

<svelte:window on:keydown={(e) => e.key === 'Escape' && (showDetails ? (showDetails = false) : close())} />

<div class="ts" role="dialog" aria-modal="true" aria-label={title || `Scan a ${prof.label.toLowerCase()}`}
  style="--ts-accent: {accent}" data-testid="text-scanner">
  <div class="ts-head">
    {#if !checker}<span class="ts-title">{title || `Scan a ${prof.label.toLowerCase()}`}</span>{/if}
    <span class="ts-head-actions" class:ts-head-wide={!!checker}>
      {#if checker}
        <button class="ts-btn" on:click={close} data-testid="scan-back">Back</button>
        <button class="ts-btn" on:click={newScan} data-testid="scan-new">New scan</button>
        <button class="ts-btn" on:click={toggleDiag} aria-pressed={diagOn} data-testid="scan-debug">{diagOn ? 'Debug: on' : 'Debug: off'}</button>
      {:else}
      <!-- In the header so it is always on screen (2026-10-13: at the foot of the
           panel it could be scrolled out of sight on a phone). -->
      {#if CAN_FIND}
        <button class="ts-btn" on:click={toggleFind} aria-pressed={findFirst} data-testid="scan-find-toggle">{findFirst ? 'Find plate: on' : 'Find plate: off'}</button>
      {/if}
      <button class="ts-btn" on:click={toggleDiag} aria-pressed={diagOn}>{diagOn ? 'Hide what the reader sees' : 'What the reader sees'}</button>
      {#if diagOn && diag}
        <button class="ts-btn ts-save" on:click={saveDiag} data-testid="scan-save-diag">Save pictures</button>
      {/if}
      <button class="ts-btn" on:click={close}>Close</button>
      {/if}
    </span>
  </div>

  <div class="ts-view">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted autoplay></video>
    {#if photoUrl}
      <img class="ts-photo" src={photoUrl} alt="" data-testid="scan-photo" />
    {/if}
    {#if !cameraError && !photoMode}
      <div class="ts-box ts-box-{frame}" data-state={frame} style="width: {BOX_FRACTION * 100}%; aspect-ratio: {BOX_ASPECT}">
        {#if findFirst && plateRect}
          <div class="ts-found" style="left: {plateRect.l}%; top: {plateRect.t}%; width: {plateRect.w}%; height: {plateRect.h}%" data-testid="scan-found"></div>
        {/if}
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
        {#if allowPhoto}<p class="ts-help-alt">Or use <b>Take a photo</b> below — that does not need this permission.</p>{/if}
        {#if cameraError.retry}<button class="ts-btn ts-primary-plain" on:click={startCamera}>Try again</button>{/if}
      </div>
    {/if}
  </div>

  <div class="ts-panel">
    <!-- First in the panel (2026-10-16): at the foot, under the matches and
         buttons, it had to be scrolled to and was not found on a phone. -->
    {#if diagOn}
      <div class="ts-diag" data-testid="scan-diagnostics">
        {#if checker}
          <div class="ts-actions">
            {#if CAN_FIND}
              <button class="ts-btn" on:click={toggleFind} aria-pressed={findFirst} data-testid="scan-find-toggle">{findFirst ? 'Find plate: on' : 'Find plate: off'}</button>
            {/if}
            {#if diag}<button class="ts-btn ts-save" on:click={saveDiag} data-testid="scan-save-diag">Save pictures</button>{/if}
          </div>
        {/if}
        {#if diag}
          <p class="ts-diag-label">Camera crop</p>
          {#if diag.raw}<img src={diag.raw} alt="" />{/if}
          <p class="ts-diag-label">Given to the reader</p>
          {#if diag.prepared}<img src={diag.prepared} alt="" />{/if}
          <p class="ts-diag-text">Read: <span>{diag.text.trim() || '(nothing)'}</span> · {Math.round(diag.confidence)}% sure</p>
          <p class="ts-diag-info">{diag.info}</p>
        {:else}
          <p class="ts-diag-info">Waiting for the next read…</p>
        {/if}
      </div>
    {/if}
    {#if readerError}
      <p class="ts-warn">{readerError}</p>
    {:else if !readerReady}
      <p class="ts-status">Getting the reader ready… (the first time can take a little while)</p>
    {:else if checker && decidedValue}
      <p class="ts-status" aria-live="polite">Read: tap the result for details, or New scan.</p>
    {:else if note || status}
      <p class="ts-status" aria-live="polite">{note || status}</p>
    {:else if live}
      <p class="ts-status" aria-live="polite" data-testid="scan-status">{liveStatus}</p>
    {/if}
    <!-- Always shown while the camera is live (2026-10-13): when it came and went
         the panel changed height, and the camera view and guide box above it
         jumped about. Empty is a dash, not a missing line. -->
    {#if checker}
      <p class="ts-guess" data-testid="scan-guess">Best guess so far: <span>{guess || '—'}</span>{#if guess && guessConf} · {guessConf}% sure{/if}</p>
      {#if decidedValue}
        <button class="ts-verdict ts-verdict-{verdict?.tone ?? 'wait'}" on:click={() => (showDetails = true)}
          disabled={!verdict} data-testid="scan-verdict">
          <span class="ts-vplate">Read plate: {verdict?.plate ?? decidedValue}</span>
          <span class="ts-vresult">{verdictError ? 'Could not check' : verdict ? verdict.headline : 'Checking…'}</span>
          <span class="ts-vhint">{verdictError || (verdict ? 'Tap for details' : '')}</span>
        </button>
      {/if}
    {:else if live}
      <p class="ts-seeing" data-testid="scan-seeing">Seeing: <span>{seeing && !matches.length && !held ? seeing : '—'}</span></p>
    {/if}

    {#if matches.length && !checker}
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
      {#if lastRead && !checker}
        <button class="ts-btn ts-primary" on:click={() => pick(lastRead)}>Use “{lastRead}”</button>
      {/if}
      {#if torchAvailable}
        <button class="ts-btn" on:click={toggleTorch} aria-pressed={torchOn}>{torchOn ? 'Light off' : 'Light on'}</button>
      {/if}
      {#if allowPhoto}
        <label class="ts-btn">
        {photoMode ? 'Take another photo' : 'Take a photo'}
        <input type="file" accept="image/*" capture="environment" on:click={pauseForPhoto} on:change={readPhoto} />
      </label>
      {/if}
      {#if photoMode && !cameraError && allowPhoto}
        <button class="ts-btn" on:click={scanLiveAgain}>Scan live again</button>
      {/if}
    </div>
    <p class="ts-note">Read on this device — the picture is not sent or kept.</p>
  </div>

  {#if showDetails && verdict}
    <div class="ts-modal" role="dialog" aria-modal="true" aria-label="Plate details" data-testid="scan-details">
      <div class="ts-modal-card">
        <p class="ts-vplate ts-big">{verdict.plate ?? decidedValue}</p>
        <p class="ts-vresult ts-vtone-{verdict.tone}">{verdict.headline}</p>
        <p class="ts-vtitle">{verdict.title}</p>
        {#each verdict.lines ?? [] as l}
          <p class="ts-vline">{#if l.href}<a href={l.href}>{l.text}</a>{:else}{l.text}{/if}</p>
        {/each}
        <div class="ts-actions">
          {#if canReport}<button class="ts-btn ts-primary" on:click={createReport} data-testid="scan-create-report">Create report</button>{/if}
          <button class="ts-btn" on:click={() => (showDetails = false)}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .ts {
    position: fixed; inset: 0; z-index: 1000;
    display: flex; flex-direction: column;
    background: #0d0d14; color: #e2e8f0;
    font-family: inherit;
  }
  .ts-head { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 0.75rem; gap: 0.5rem; }
  .ts-title { font-weight: 600; }
  /* A fixed share of the screen (2026-10-23: the view took so much that the
     buttons for a recognised plate fell off the foot). The panel under it
     takes the rest and scrolls if it must. */
  .ts-view { position: relative; flex: 0 0 auto; height: 38vh; height: 38dvh; min-height: 0; overflow: hidden; background: #000; }
  .ts-view video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .ts-head-actions { display: inline-flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
  .ts-link { background: none; border: 0; padding: 0; margin-left: 0.4rem; color: var(--ts-accent); text-decoration: underline; cursor: pointer; font: inherit; }
  .ts-diag { border: 1px solid #334155; border-radius: 8px; padding: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem; }
  .ts-diag img { max-width: 100%; image-rendering: pixelated; background: #fff; border: 1px solid #475569; }
  .ts-diag-label { font-size: 0.75rem; color: #94a3b8; margin: 0.25rem 0 0; }
  .ts-diag-text { font-size: 0.85rem; margin: 0.25rem 0 0; }
  .ts-diag-text span { font-family: 'DM Mono', monospace; color: #fff; }
  .ts-diag-info { font-size: 0.7rem; color: #94a3b8; margin: 0; word-break: break-word; }
  .ts-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
  .ts-found { position: absolute; border: 2px solid #4ade80; border-radius: 4px; box-sizing: border-box; pointer-events: none; }
  .ts-head-wide { width: 100%; }
  .ts-head-wide .ts-btn { flex: 1 1 0; }
  .ts-guess { margin: 0; font-size: 0.95rem; color: #cbd5e1; }
  .ts-guess span { font-family: ui-monospace, monospace; letter-spacing: 0.05em; color: #fff; }
  .ts-verdict {
    display: flex; flex-direction: column; gap: 0.15rem; text-align: left; width: 100%;
    min-height: 64px; padding: 0.6rem 0.8rem; border-radius: 10px; cursor: pointer;
    background: #1e293b; color: #fff; border: 2px solid #64748b;
  }
  .ts-verdict-ok { border-color: #4ade80; background: rgb(20 83 45 / 0.5); }
  .ts-verdict-pending { border-color: #38bdf8; background: rgb(12 74 110 / 0.5); }
  .ts-verdict-ended { border-color: #fbbf24; background: rgb(120 53 15 / 0.5); }
  .ts-verdict-none { border-color: #f87171; background: rgb(127 29 29 / 0.5); }
  .ts-vplate { font-family: ui-monospace, monospace; font-size: 1.15rem; letter-spacing: 0.05em; }
  .ts-vplate.ts-big { font-size: 1.8rem; margin: 0; }
  .ts-vresult { font-size: 1.25rem; font-weight: 700; }
  .ts-vhint { font-size: 0.75rem; color: #cbd5e1; }
  .ts-vtone-ok { color: #86efac; }
  .ts-vtone-pending { color: #7dd3fc; }
  .ts-vtone-ended { color: #fcd34d; }
  .ts-vtone-none { color: #fca5a5; }
  .ts-vtitle { margin: 0; color: #e2e8f0; }
  .ts-vline { margin: 0; font-size: 0.9rem; color: #cbd5e1; }
  .ts-vline a { color: #fff; text-decoration: underline; }
  .ts-modal {
    position: absolute; inset: 0; z-index: 10; background: rgb(0 0 0 / 0.75);
    display: flex; align-items: flex-end; justify-content: center; padding: 0.75rem;
  }
  .ts-modal-card {
    width: 100%; max-width: 28rem; max-height: 90%; overflow-y: auto;
    background: #0d0d14; border: 1px solid #475569; border-radius: 12px;
    padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem;
  }
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
  .ts-panel { flex: 1 1 auto; min-height: 0; padding: 1rem 0.75rem calc(2rem + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 0.6rem; overflow-y: auto; }
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
  .ts-save { background: var(--ts-accent); border-color: var(--ts-accent); color: #fff; }
  .ts-note { margin: 0; font-size: 0.75rem; color: #64748b; }
</style>
