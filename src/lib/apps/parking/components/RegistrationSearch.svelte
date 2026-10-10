<!-- src/lib/apps/parking/components/RegistrationSearch.svelte -->
<!-- Registration Lookup — "whose car is this, and should it be here?", asked in
     the car park AND on the side road (2026-10-06). One search looks at both:
     vehicles on parking agreements (the basement bays) and road permits.
     Searches on Enter, not per keystroke, because every search is written to
     the audit log (parkingStore.lookupRegistration), and a log line per letter
     typed would bury the lookups that matter.
     ⭐ It works with no signal (the basement): it searches what the page has
     loaded, and the audit line waits on the phone until the signal returns
     (stores/lookupAudit.js). The result then says it was checked against the
     car park as loaded, and when.
     ⛔ If the road permits cannot be read, the result SAYS so — "no road
     permit" would otherwise read as a car with no permit.
     📷 Scan (2026-10-10): the shared TextScanner reads the plate ON the phone
     and offers the registrations this page knows — car park and road permits —
     that it could be. Picking one searches it, exactly as if it were typed. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import TextScanner from '#lib/components/common/TextScanner.svelte';
  import { warmReader } from '#lib/utils/textScan/ocrReader.js';
  import { parkingStore } from '../stores/parkingStore.js';
  import { permitStore } from '../stores/permitStore.js';
  import { normaliseReg, STATUS_LABEL } from '../utils/agreementModel.js';
  import { findPermitsByRegistration, fmtPermitWhen, permitNumberLabel } from '../utils/permitModel.js';
  import { fmtDate, today, fmtTime } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { online } from '#lib/stores/online.js';
  import { syncState } from '../stores/lookupAudit.js';

  /** When the page read the car park — shown when a lookup is made with no signal. */
  export let loadedAt = 0;

  const dispatch = createEventDispatcher();
  let q = '';
  let hits = null;        // car park results; null until a search is run
  let permitHits = [];
  let permitError = '';
  let searching = false;
  let searchedOffline = false;
  let scanning = false;

  // Every registration this page knows, for the scanner to match a plate to.
  $: scanCandidates = scanCandidatesFrom($parkingStore.vehicles, $permitStore.permits);
  /** @param {any[]} vehicles @param {any[]} permits */
  function scanCandidatesFrom(vehicles = [], permits = []) {
    const seen = new Map();
    for (const v of vehicles) if (v.registration && !seen.has(normaliseReg(v.registration)))
      seen.set(normaliseReg(v.registration), { value: v.registration, label: 'car park' });
    for (const p of permits) {
      const key = normaliseReg(p.registration);
      if (!key) continue;
      const prior = seen.get(key);
      if (prior) prior.label = 'car park · road permit';
      else seen.set(key, { value: p.registration, label: 'road permit' });
    }
    return [...seen.values()];
  }

  function openScanner() {
    scanning = true;
    permitStore.ensureLoaded().catch(() => {});   // its own failure shows on the search
  }
  /** @param {CustomEvent<{ value: string }>} e */
  function scanned(e) {
    scanning = false;
    q = e.detail.value;
    search();
  }

  // On a phone, fetch the reader's files while there is a signal, so a scan
  // works in the basement later. Once fetched they stay; this costs nothing then.
  onMount(() => {
    if (!$online || !window.matchMedia?.('(pointer: coarse)').matches) return;
    const t = setTimeout(() => { void warmReader(); }, 4000);
    return () => clearTimeout(t);
  });

  async function search() {
    if (normaliseReg(q).length < 2) { hits = null; return; }
    searching = true; permitError = ''; searchedOffline = !$online;
    try {
      try {
        await permitStore.ensureLoaded();
        permitHits = findPermitsByRegistration(q, $permitStore.permits, today(), fmtTime(new Date().toISOString()));
      } catch (/** @type {any} */ err) {
        permitHits = [];
        permitError = errMessage(err, 'The road permits could not be read.');
      }
      hits = parkingStore.lookupRegistration(q, permitHits.length, { offline: searchedOffline });
    } finally { searching = false; }
  }
  function close() { hits = null; q = ''; permitHits = []; permitError = ''; }
  function openAgreement(id) { close(); dispatch('showAgreement', id); }
  function openPermit(p) { close(); dispatch('showPermit', permitNumberLabel(p.permit_number)); }
</script>

<div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
  <label for="registration-lookup" class="text-sm text-slate-300 whitespace-nowrap">Registration Lookup:</label>
  <input id="registration-lookup" bind:value={q} placeholder="Registration, then Enter"
    on:keydown={(e) => e.key === 'Enter' && search()}
    class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-56 max-w-full font-mono uppercase" />
  <button type="button" on:click={openScanner} title="Read a number plate with the camera"
    class="px-3 py-1.5 text-sm rounded border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700">📷 Scan</button>
  {#if searching}<span class="text-xs text-slate-400">Looking…</span>{/if}
  {#if !$online}<span class="text-xs rounded-full bg-amber-900/50 px-2 py-0.5 text-amber-300">No signal</span>{/if}
  {#if $syncState.pending + $syncState.error > 0}
    <span class="text-xs text-amber-300">{$syncState.pending + $syncState.error} lookup{$syncState.pending + $syncState.error === 1 ? '' : 's'} not yet recorded</span>
  {/if}
  {#if hits}
    <div class="absolute left-0 top-full z-20 mt-1 w-[26rem] max-w-[calc(100vw-2rem)] bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 text-sm"
      data-testid="registration-results">
      {#if searchedOffline}
        <p class="mx-2 mb-1 rounded bg-amber-900/40 px-2 py-1 text-xs text-amber-300">
          No signal — checked against the car park as loaded at {fmtTime(new Date(loadedAt).toISOString())}.
          This lookup will be recorded when the signal returns.</p>
      {/if}
      <!-- Car park -->
      <p class="px-2 pt-1 text-xs uppercase tracking-wide text-slate-500">Car park</p>
      {#if hits.length === 0}
        <!-- Only what the app knows: holders of bays that belong to flats may
             not be recorded, and visitors never are. -->
        <p class="text-slate-400 p-2">Not on a parking agreement here.
          <span class="block text-xs text-slate-500 mt-1">Bays that belong to flats may not have their holders
            recorded, and visitors are not recorded at all.</span></p>
      {:else}
        {#each hits as h (h.vehicle.id)}
          <button class="w-full text-left p-2 rounded hover:bg-slate-700" on:click={() => h.agreement && openAgreement(h.agreement.id)}>
            <span class="font-mono text-white">{h.vehicle.registration}</span>
            {#if h.standing === 'authorised'}<span class="text-xs text-green-400 ml-1">authorised today</span>
            {:else if h.standing === 'pending'}<span class="text-xs text-sky-400 ml-1">not yet authorised{h.agreement?.status === 'draft'
              ? ' (agreement is a draft)' : ' — from ' + fmtDate([h.agreement?.starts_on, h.vehicle.from_date].filter(Boolean).sort().pop())}</span>
            {:else}<span class="text-xs text-amber-400 ml-1">no longer authorised{h.vehicle.to_date ? ' since ' + fmtDate(h.vehicle.to_date) : ''}</span>{/if}
            <span class="block text-xs text-slate-400">
              {h.bay?.ref ?? '—'} · {h.agreement?.reference ?? '—'} ({STATUS_LABEL[h.agreement?.status] ?? '—'})
              · {h.holder?.display_name ?? '—'}{h.holder?.phone ? ' · ' + h.holder.phone : ''}
            </span>
          </button>
        {/each}
      {/if}

      <!-- Road permits -->
      <p class="px-2 pt-2 mt-1 border-t border-slate-700 text-xs uppercase tracking-wide text-slate-500">Road permits</p>
      {#if permitError}
        <p class="text-amber-400 p-2">Road permits were NOT checked: {permitError}</p>
      {:else if permitHits.length === 0}
        <p class="text-slate-400 p-2">No road permit for this registration.</p>
      {:else}
        {#each permitHits as h (h.permit.id)}
          <button class="w-full text-left p-2 rounded hover:bg-slate-700" on:click={() => openPermit(h.permit)}>
            <span class="font-mono text-white">{h.permit.registration}</span>
            {#if h.status === 'current'}<span class="text-xs text-green-400 ml-1">current permit, until {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</span>
            {:else if h.status === 'upcoming'}<span class="text-xs text-sky-400 ml-1">future permit, starts {fmtPermitWhen(h.permit.valid_from, h.permit.valid_from_time)}</span>
            {:else}<span class="text-xs text-amber-400 ml-1">expired permit, ended {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</span>{/if}
            <span class="block text-xs text-slate-400">Permit {permitNumberLabel(h.permit.permit_number)} · {h.permit.company}</span>
          </button>
        {/each}
      {/if}
      <button class="w-full text-right text-xs text-slate-500 hover:text-white mt-1" on:click={close}>Close</button>
    </div>
  {/if}
</div>

{#if scanning}
  <TextScanner profile="registration" title="Scan a number plate" candidates={scanCandidates}
    on:pick={scanned} on:close={() => (scanning = false)} />
{/if}
