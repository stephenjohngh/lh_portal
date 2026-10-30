<!-- src/lib/apps/parking/components/RegistrationSearch.svelte -->
<!-- Registration Lookup — "whose car is this, and should it be here?", asked in
     the car park AND on the side road (2026-10-06). One search looks at both:
     vehicles on parking agreements (the basement bays) and road permits.
     Searches on Enter, not per keystroke, because every search is written to
     the audit log (parkingStore.lookupRegistration), and a log line per letter
     typed would bury the lookups that matter.
     ⭐ It works with no signal (the basement): it searches what the page has
     loaded, and the audit line waits on the phone until the signal returns
     (stores/parkingQueue.js). The result then says it was checked against the
     car park as loaded, and when.
     ⛔ If the road permits cannot be read, the result SAYS so — "no road
     permit" would otherwise read as a car with no permit.
     Scanning a plate moved to Car check (2026-10-23): the Scan button here was
     replaced by the link that opens Car check in a new tab — to bookmark or put
     on the home screen. A new tab, because in this one it would leave the portal,
     which warns and restarts the app on Back. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { normaliseReg, formatReg, STATUS_LABEL } from '../utils/agreementModel.js';
  import { fmtPermitWhen, permitNumberLabel } from '../utils/permitModel.js';
  import { checkRegistration } from '../stores/registrationCheck.js';
  import { fmtDate, fmtTime } from '#lib/utils/dates.js';
  import { online } from '#lib/stores/online.js';
  import { syncState, retryErrors } from '../stores/parkingQueue.js';
  import OfflineQueueStatus from '#lib/components/common/OfflineQueueStatus.svelte';

  /** When the page read the car park — shown when a lookup is made with no signal. */
  export let loadedAt = 0;

  const dispatch = createEventDispatcher();
  let q = '';
  let hits = null;        // car park results; null until a search is run
  let permitHits = [];
  let permitError = '';
  let searching = false;
  let searchedOffline = false;

  async function search() {
    if (normaliseReg(q).length < 2) { hits = null; return; }
    searching = true; searchedOffline = !$online;
    try {
      const r = await checkRegistration(q, { offline: searchedOffline });
      permitHits = r.permitHits; permitError = r.permitError; hits = r.hits;
    } finally { searching = false; }
  }
  function close() { hits = null; q = ''; permitHits = []; permitError = ''; }
  function openAgreement(id) { close(); dispatch('showAgreement', id); }
  function openPermit(p) { close(); dispatch('showPermit', permitNumberLabel(p.permit_number)); }
</script>

<div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
  <label for="registration-lookup" class="text-sm text-slate-300 whitespace-nowrap">Registration Lookup:</label>
  <!-- The box and the Car Check link stay together on one line, even on a phone. The box is
       sized for a registration (about 60% of what it was); the phone's keyboard
       shows a Search key, which replaces the "then Enter" the old placeholder said. -->
  <span class="inline-flex items-center gap-2 whitespace-nowrap">
    <input id="registration-lookup" bind:value={q} placeholder="Registration"
      enterkeyhint="search" autocapitalize="characters" autocomplete="off" spellcheck="false"
      title="Type a registration, then press Enter"
      on:keydown={(e) => e.key === 'Enter' && search()}
      class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-[8.5rem] font-mono uppercase" />
    <a href="/parking/check" target="_blank" rel="noopener"
      class="shrink-0 text-sm text-purple-300 hover:text-purple-200 underline">Open Car Check in new tab ↗</a>
  </span>
  {#if searching}<span class="text-xs text-slate-400">Looking…</span>{/if}
  {#if !$online}<span class="text-xs rounded-full bg-amber-900/50 px-2 py-0.5 text-amber-300">No signal</span>{/if}
  <OfflineQueueStatus state={$syncState} what={['record', 'records']} onRetry={retryErrors} />
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
          <Button variant="plain" on:click={() => h.agreement && openAgreement(h.agreement.id)} className="w-full text-left p-2 rounded hover:bg-slate-700">
<span class="font-mono text-white">{formatReg(h.vehicle.registration)}</span>
            {#if h.standing === 'authorised'}<span class="text-xs text-green-400 ml-1">authorised today</span>
            {:else if h.standing === 'pending'}<span class="text-xs text-sky-400 ml-1">not yet authorised{h.agreement?.status === 'draft'
              ? ' (agreement is a draft)' : ' — from ' + fmtDate([h.agreement?.starts_on, h.vehicle.from_date].filter(Boolean).sort().pop())}</span>
            {:else}<span class="text-xs text-amber-400 ml-1">no longer authorised{h.vehicle.to_date ? ' since ' + fmtDate(h.vehicle.to_date) : ''}</span>{/if}
            <span class="block text-xs text-slate-400">
              {h.bay?.ref ?? '—'} · {h.agreement?.reference ?? '—'} ({STATUS_LABEL[h.agreement?.status] ?? '—'})
              · {h.holder?.display_name ?? '—'}{h.holder?.phone ? ' · ' + h.holder.phone : ''}
            </span>
</Button>
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
          <Button variant="plain" on:click={() => openPermit(h.permit)} className="w-full text-left p-2 rounded hover:bg-slate-700">
<span class="font-mono text-white">{h.permit.registration}</span>
            {#if h.status === 'current'}<span class="text-xs text-green-400 ml-1">current permit, until {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</span>
            {:else if h.status === 'upcoming'}<span class="text-xs text-sky-400 ml-1">future permit, starts {fmtPermitWhen(h.permit.valid_from, h.permit.valid_from_time)}</span>
            {:else}<span class="text-xs text-amber-400 ml-1">{h.permit.ended_early_at ? 'permit ended early' : 'expired permit, ended'} {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</span>{/if}
            <span class="block text-xs text-slate-400">Permit {permitNumberLabel(h.permit.permit_number)} · {h.permit.company}</span>
</Button>
        {/each}
      {/if}
      <Button variant="tertiary" size="xs" on:click={close}>Close</Button>
    </div>
  {/if}
</div>
