<!-- src/lib/apps/parking/components/PlateCheck.svelte -->
<!-- Car check (2026-10-17, user: "for the caretaker looking at a car, its still
     quite a long process starting the portal and choosing the parking app").
     A page of its own at /parking/check, to bookmark or put on the home screen:
     it opens on a big Scan button (not the camera itself — user, same day), and
     answers in one line — allowed, not
     yet, no longer, or not found — with the detail underneath.
     ⭐ The same lookup as the Parking app's Registration Lookup
     (stores/registrationCheck.js), so the two cannot answer differently; the
     same audit line, queued with no signal (parkingQueue.js).
     ⚠ It reads the car park when it opens, so open it where there is a signal;
     after that it works in the basement, as the Parking app does. Nothing of
     the car park is kept on the phone.
     ⭐ WHERE THE CAR IS is chosen first (user, same day): in the car park only a
     car park licence counts, on the side road only a road permit — a car with
     only a car park licence is not "allowed" on the road. The other one, if the
     car has it, is said under the answer and put in a sighting's note.
     Unauthorised parking (migration 245, user, same day): an answer that is not
     "Allowed" offers Record this car — where, a photo, a note — and every answer
     shows the car's earlier sightings. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { onMount, tick } from 'svelte';
  import AppGate from '#lib/components/common/AppGate.svelte';
  import TextScanner from '#lib/components/common/TextScanner.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { warmReader } from '#lib/utils/textScan/ocrReader.js';
  import { online } from '#lib/stores/online.js';
  import { parkingStore } from '../stores/parkingStore.js';
  import { permitStore } from '../stores/permitStore.js';
  import { syncState, startSync, stopSync, retryErrors } from '../stores/parkingQueue.js';
  import OfflineQueueStatus from '#lib/components/common/OfflineQueueStatus.svelte';
  import { checkRegistration } from '../stores/registrationCheck.js';
  import { sightingStore } from '../stores/sightingStore.js';
  import { sightingsOf, SIGHTING_PLACES } from '../utils/sightingModel.js';
  import { getPref, setPref } from '#lib/utils/prefs.js';
  import { permissions } from '#lib/stores/permissions.js';
  import RecordSighting from './RecordSighting.svelte';
  import SightingHistory from './SightingHistory.svelte';
  import { scanCandidatesFrom, lookupVerdict, splitExact } from '../utils/registrationLookup.js';
  import { normaliseReg, formatReg, STATUS_LABEL } from '../utils/agreementModel.js';
  import { fmtPermitWhen, permitNumberLabel } from '../utils/permitModel.js';
  import { fmtDate, fmtTime } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';

  let ready = false;
  let loadedAt = 0;
  let scanning = false;
  let q = '';
  let checking = false;
  let error = '';
  // hits / permitHits are the WHOLE registration only; other* contain it (splitExact).
  /** @type {null | { q: string, hits: any[], permitHits: any[], otherHits: any[], otherPermitHits: any[], permitError: string, offline: boolean }} */
  let result = null;
  // Where the car is — remembered on this phone, since the caretaker is
  // usually checking one place at a time.
  const PLACE_PREF = 'parking.carCheck.place';
  let place = (() => { const p = getPref(PLACE_PREF, ''); return Object.hasOwn(SIGHTING_PLACES, p) ? p : ''; })();
  function choosePlace(/** @type {string} */ p) { place = p; setPref(PLACE_PREF, p); recording = false; }
  let recording = false;
  let recordedNote = '';
  /** The notes a scanner report starts with. */
  let reportNotes = '';

  const load = () => {
    permitStore.ensureLoaded().catch(() => { /* the answer says road permits were not checked */ });
    sightingStore.ensureLoaded().catch(() => { /* shown under the answer */ });
    return parkingStore.load().then(() => { loadedAt = Date.now(); });
  };

  $: scanCandidates = scanCandidatesFrom($parkingStore.vehicles, $permitStore.permits);
  $: verdict = result && place ? lookupVerdict(result.hits, result.permitHits, result.permitError, /** @type {any} */ (place)) : null;
  // Sightings still on the phone show at once, marked as not sent; a sent one
  // replaces its waiting copy (same id).
  $: waitingSightings = ($syncState.items ?? []).filter((i) => i.sighting)
    .map((i) => ({ ...i.sighting, photos: [], waiting: true, failed: i.status === 'error', hasPhoto: i.hasPhoto }));
  $: earlier = result ? sightingsOf(result.q, [
    ...waitingSightings.filter((w) => !$sightingStore.sightings.some((s) => s.id === w.id)),
    ...$sightingStore.sightings,
  ]) : [];
  $: canRecord = $permissions.isAdmin || $permissions.canModify;

  onMount(() => {
    startSync();
    // Fetch the reader's files while there is a signal (once fetched they stay).
    if ($online) void warmReader();
    return () => stopSync();
  });

  /** The answer for a registration, as the page shows it. */
  async function lookup(/** @type {string} */ value) {
    const offline = !$online;
    const r = await checkRegistration(value, { offline });
    return { q: value, ...splitExact(value, r.hits, r.permitHits), permitError: r.permitError, offline };
  }

  async function check(/** @type {string} */ value) {
    if (normaliseReg(value).length < 2 || !place) return;
    checking = true; error = ''; recording = false; recordedNote = ''; reportNotes = '';
    try {
      result = await lookup(value);
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'That registration could not be checked.');
    } finally { checking = false; }
  }

  /** @param {CustomEvent<{ value: string }>} e */
  async function scanned(e) {
    scanning = false;
    q = e.detail.value;
    await tick();
    await check(q);
  }

  /**
   * What the scanner shows once it has read a plate (2026-10-25, user: the
   * scanner itself says Permit Found / No Permit, tap for details, and can start
   * a report). Same lookup, same answer as the page. The notes it hands to a
   * report name references and standing, never the holder's name or phone.
   * @param {string} value
   */
  async function scannerChecker(value) {
    if (!place) throw new Error('Choose where the car is first.');
    const r = await lookup(value);
    const v = lookupVerdict(r.hits, r.permitHits, r.permitError, /** @type {any} */ (place));
    const plate = formatReg(normaliseReg(value));
    /** @type {{ text: string, href?: string }[]} */
    const lines = [{ text: `Checked for the ${SIGHTING_PLACES[place].toLowerCase()}.` }];
    /** @type {string[]} */
    const known = [];
    if (v.elsewhere) { lines.push({ text: v.elsewhere }); known.push(v.elsewhere); }
    for (const h of r.hits) {
      const standing = h.standing === 'authorised' ? 'authorised today'
        : h.standing === 'pending' ? 'not yet authorised' : 'no longer authorised';
      const what = `Car park licence ${h.agreement?.reference ?? ''} · bay ${h.bay?.ref ?? '—'} · ${standing}`.replace(/\s+/g, ' ');
      lines.push({ text: `${formatReg(h.vehicle.registration)} · ${what}` });
      if (h.holder?.display_name) lines.push({ text: h.holder.display_name });
      if (h.holder?.phone) lines.push({ text: h.holder.phone, href: `tel:${h.holder.phone}` });
      known.push(what);
    }
    for (const h of r.permitHits) {
      const when = h.status === 'current' ? `current, until ${fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}`
        : h.status === 'upcoming' ? `starts ${fmtPermitWhen(h.permit.valid_from, h.permit.valid_from_time)}`
        : `${h.permit.ended_early_at ? 'ended early' : 'expired'} ${fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}`;
      const what = `Road permit ${permitNumberLabel(h.permit.permit_number)} · ${h.permit.company} · ${when}`;
      lines.push({ text: `${h.permit.registration} · ${what}` });
      known.push(what);
    }
    if (r.permitError) { lines.push({ text: `Road permits were NOT checked: ${r.permitError}` }); known.push('Road permits were not checked.'); }
    if (r.otherHits.length || r.otherPermitHits.length) {
      const others = [...r.otherHits.map((h) => formatReg(h.vehicle.registration)), ...r.otherPermitHits.map((h) => h.permit.registration)];
      lines.push({ text: `Other cars containing “${normaliseReg(value)}” — not this one: ${others.join(', ')}` });
    }
    if (r.offline) lines.push({ text: `Checked with no signal, against the car park as read at ${fmtTime(new Date(loadedAt).toISOString())}.` });
    const earlierHere = sightingsOf(value, $sightingStore.sightings);
    if (earlierHere.length) lines.push({ text: `Seen before: ${earlierHere.length} earlier sighting${earlierHere.length === 1 ? '' : 's'} recorded.` });
    const headline = v.tone === 'ok' ? 'Permit Found' : 'No Permit';
    const notes = [`Plate read: ${plate} — ${headline} (${v.title}).`, ...known].join('\n');
    return { plate, tone: v.tone, headline, title: v.title, lines, notes };
  }

  /** Create report from the scanner: show the answer on the page, with the report form open and the known details in its notes. */
  async function reportFromScan(/** @type {CustomEvent<{ value: string, notes: string }>} */ e) {
    scanning = false;
    q = e.detail.value;
    await check(q);
    reportNotes = e.detail.notes;
    recording = true;
  }

  function scanAgain() { result = null; q = ''; recording = false; recordedNote = ''; reportNotes = ''; scanning = true; }

  /** @param {CustomEvent<{ sighting: any, queued: boolean, photoError: string }>} e */
  function recorded(e) {
    recording = false;
    recordedNote = `Recorded at ${fmtTime(e.detail.sighting.seen_at)}.`
      + (e.detail.queued && !$online ? ' Saved on the phone — it is sent when there is a signal.' : '')
      + (e.detail.photoError ? ` The photo was NOT saved: ${e.detail.photoError}` : '');
  }

  const TONE = {
    ok:      'bg-green-900/50 border-green-500 text-green-200',
    pending: 'bg-sky-900/50 border-sky-500 text-sky-200',
    ended:   'bg-amber-900/50 border-amber-500 text-amber-200',
    none:    'bg-red-900/50 border-red-500 text-red-200',
  };
</script>

<div class="min-h-screen bg-slate-900 text-slate-200 px-4 py-4">
  <div class="max-w-md mx-auto space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Car check</h1>
      <a href="/" class="text-sm text-slate-400 hover:text-white">Portal</a>
    </div>

    <AppGate appId="parking" name="Parking" {load} requireGrant bind:ready loadingText="Reading the car park…">
      {#if $parkingStore.error}<ErrorDisplay message={$parkingStore.error} />{/if}
      <ErrorDisplay message={error} onDismiss={() => (error = '')} />

      {#if !$online}
        <p class="rounded bg-amber-900/40 px-3 py-2 text-sm text-amber-300">
          No signal — checking against the car park as read at {fmtTime(new Date(loadedAt).toISOString())}.</p>
      {/if}
      <!-- Checks (audit lines) and recorded cars both wait here with no signal. -->
      <OfflineQueueStatus state={$syncState} what={['record', 'records']} onRetry={retryErrors} />

      <fieldset class="space-y-1" data-testid="car-check-place">
        <legend class="text-sm text-slate-300">Where is the car?</legend>
        <div class="flex gap-2">
          {#each Object.entries(SIGHTING_PLACES) as [value, label]}
            <button type="button" on:click={() => choosePlace(value)} aria-pressed={place === value}
              class="flex-1 min-h-[48px] rounded-lg border text-base
                {place === value ? 'border-purple-400 bg-purple-900/50 text-white font-semibold' : 'border-slate-600 text-slate-300'}">{label}</button>
          {/each}
        </div>
      </fieldset>

      <Button variant="primary" size="large" disabled={!place} on:click={scanAgain}>📷 {result ? 'Scan another' : 'Scan a number plate'}</Button>

      <form class="flex gap-2" on:submit|preventDefault={() => check(q)}>
        <label for="car-check-reg" class="sr-only">Registration</label>
        <input id="car-check-reg" bind:value={q} placeholder="Or type it"
          enterkeyhint="search" autocapitalize="characters" autocomplete="off" spellcheck="false"
          class="flex-1 min-w-0 min-h-[48px] px-3 text-lg bg-slate-800 border border-slate-600 rounded-lg font-mono uppercase" />
        <Button variant="tertiary" size="xs" disabled={checking || !place || normaliseReg(q).length < 2} type="submit">Check</Button>
      </form>

      {#if checking}<p class="text-sm text-slate-400">Checking…</p>{/if}

      {#if result && verdict}
        <div class="rounded-xl border-2 p-4 space-y-3 {TONE[verdict.tone]}" data-testid="car-check-result" data-tone={verdict.tone}>
          <p class="font-mono text-2xl text-white">{formatReg(normaliseReg(result.q))}</p>
          <p class="text-xl font-semibold">{verdict.title}</p>
          <p class="text-xs text-slate-300">Checked for the {SIGHTING_PLACES[place].toLowerCase()}.</p>
          {#if verdict.elsewhere}<p class="text-sm text-white" data-testid="car-check-elsewhere">{verdict.elsewhere}</p>{/if}

          {#if result.offline}
            <p class="text-xs text-amber-300">Checked with no signal, against the car park as read at {fmtTime(new Date(loadedAt).toISOString())}.</p>
          {/if}

          {#each result.hits as h (h.vehicle.id)}
            <div class="text-sm border-t border-white/10 pt-2">
              <p class="text-white"><span class="font-mono">{formatReg(h.vehicle.registration)}</span> · Car park · {h.bay?.ref ?? '—'} · {h.agreement?.reference ?? '—'} ({STATUS_LABEL[h.agreement?.status] ?? '—'})</p>
              <p>{h.holder?.display_name ?? '—'}{#if h.holder?.phone} · <a class="underline" href="tel:{h.holder.phone}">{h.holder.phone}</a>{/if}</p>
              {#if h.standing === 'authorised'}<p class="text-xs text-green-300">Authorised today</p>
              {:else if h.standing === 'pending'}<p class="text-xs text-sky-300">Not yet authorised{h.agreement?.status === 'draft'
                ? ' (agreement is a draft)' : ' — from ' + fmtDate([h.agreement?.starts_on, h.vehicle.from_date].filter(Boolean).sort().pop())}</p>
              {:else}<p class="text-xs text-amber-300">No longer authorised{h.vehicle.to_date ? ' since ' + fmtDate(h.vehicle.to_date) : ''}</p>{/if}
            </div>
          {/each}

          {#each result.permitHits as h (h.permit.id)}
            <div class="text-sm border-t border-white/10 pt-2">
              <p class="text-white"><span class="font-mono">{h.permit.registration}</span> · Road permit {permitNumberLabel(h.permit.permit_number)} · {h.permit.company}</p>
              {#if h.status === 'current'}<p class="text-xs text-green-300">Current, until {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</p>
              {:else if h.status === 'upcoming'}<p class="text-xs text-sky-300">Starts {fmtPermitWhen(h.permit.valid_from, h.permit.valid_from_time)}</p>
              {:else}<p class="text-xs text-amber-300">{h.permit.ended_early_at ? 'Ended early' : 'Expired'} {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</p>{/if}
            </div>
          {/each}

          {#if result.permitError}
            <p class="text-sm text-amber-300 border-t border-white/10 pt-2">Road permits were NOT checked: {result.permitError}</p>
          {/if}
          {#if result.otherHits.length || result.otherPermitHits.length}
            <div class="text-sm border-t border-white/10 pt-2" data-testid="car-check-others">
              <p class="text-slate-300">Other cars containing “{normaliseReg(result.q)}” — not this one:</p>
              <ul class="mt-1 space-y-0.5 font-mono text-slate-200">
                {#each result.otherHits as h (h.vehicle.id)}<li>{formatReg(h.vehicle.registration)} <span class="font-sans text-xs text-slate-400">car park</span></li>{/each}
                {#each result.otherPermitHits as h (h.permit.id)}<li>{h.permit.registration} <span class="font-sans text-xs text-slate-400">road permit</span></li>{/each}
              </ul>
            </div>
          {/if}
          {#if $sightingStore.error}
            <p class="text-xs text-amber-300 border-t border-white/10 pt-2">Earlier sightings could not be read: {$sightingStore.error}</p>
          {/if}
          <SightingHistory sightings={earlier} />
          {#if recordedNote}<p class="text-sm text-white border-t border-white/10 pt-2" role="status">✓ {recordedNote}</p>{/if}
        </div>

        {#if canRecord}
          {#if recording}
            <RecordSighting registration={result.q} {place} prefillNotes={reportNotes || verdict.elsewhere}
              on:recorded={recorded} on:cancel={() => (recording = false)} />
          {:else if verdict.tone !== 'ok'}
            <Button variant="secondary" size="large" on:click={() => (recording = true)}>Record this car</Button>
          {/if}
        {/if}
      {/if}
    </AppGate>
  </div>
</div>

{#if scanning}
  <TextScanner profile="registration" title="Scan a number plate" candidates={scanCandidates}
    checker={scannerChecker} canReport={canRecord} allowPhoto={false}
    on:pick={scanned} on:report={reportFromScan} on:close={() => (scanning = false)} />
{/if}
