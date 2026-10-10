<!-- src/lib/apps/parkingmobile/ParkingMobileApp.svelte -->
<!-- Parking (M) — "whose car is this, and should it be here?" on a phone in
     the basement, with or without a signal (2026-10-10). Read-only: the
     Registration Lookup against a copy kept on the phone, for the car park
     and the road. Everything else in Parking is office work and stays in the
     Parking app. Store: stores/parkingMobileStore.js (why a copy, what it holds,
     and that logout deletes it). -->
<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { auth } from '#lib/stores/auth.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { online } from '#lib/stores/online.js';
  import { hasAppAccess } from '#lib/utils/appAccess.js';
  import { getPref, setPref } from '#lib/utils/prefs.js';
  import { fmtDate, fmtDateTime, DAY_MS } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { getLogger } from '#lib/utils/logger.js';
  import { STATUS_LABEL } from '#lib/apps/parking/utils/agreementModel.js';
  import { fmtPermitWhen, permitNumberLabel } from '#lib/apps/parking/utils/permitModel.js';
  import { parkingMobileStore, syncState, startSync, stopSync, retryErrors } from './stores/parkingMobileStore.js';

  const dispatch = createEventDispatcher();
  const logger = getLogger('ParkingMobileApp');

  let ready = false;
  let noAccess = false;
  let openError = '';
  let q = '';
  /** @type {ReturnType<typeof parkingMobileStore.lookup>} */
  let result = null;
  let searched = '';

  onMount(async () => {
    startSync();
    try {
      const userId = $auth.user?.id;
      if (!userId) return;
      if (get(online)) {
        // With a signal, ask: an account no longer granted Parking loses its copy.
        await permissions.init(userId, 'parking');
        const allowed = hasAppAccess(get(permissions), 'parking');
        setPref('parkingmobile_access', allowed ? '1' : '0');
        if (!allowed) { noAccess = true; await parkingMobileStore.forget(); return; }
      } else if (getPref('parkingmobile_access') === '0') {
        noAccess = true; return;
      }
      await parkingMobileStore.open(userId, get(online));
    } catch (/** @type {any} */ err) {
      logger('❌ open failed:', err);
      openError = errMessage(err, 'Parking (M) could not start.');
    } finally {
      ready = true;
    }
  });
  onDestroy(() => stopSync());

  function search() {
    result = parkingMobileStore.lookup(q);
    searched = q;
  }
  async function refreshCopy() {
    // A failure is shown from the store (s.refreshError) beside the copy's date.
    await parkingMobileStore.refresh($auth.user?.id).catch(() => {});
  }

  $: s = $parkingMobileStore;
  $: copyAt = s.snapshot ? fmtDateTime(new Date(s.snapshot.readAt).toISOString()) : '';
  $: copyOld = s.snapshot && Date.now() - s.snapshot.readAt > DAY_MS;
</script>

<div class="pm">
  <header>
    <button class="back" on:click={() => dispatch('navigate')} aria-label="Back to the portal">‹</button>
    <h1>Parking (M)</h1>
    <span class="net" class:off={!$online}>{$online ? 'ONLINE' : 'OFFLINE'}</span>
  </header>

  {#if !ready}
    <p class="muted center">Loading …</p>
  {:else if openError}
    <p class="warn">{openError}</p>
  {:else if noAccess}
    <p class="warn">You do not have access to Parking. Ask an administrator to grant it.</p>
  {:else}
    <div class="copy" class:stale={copyOld}>
      {#if s.snapshot}
        Checking against the car park as at <strong>{copyAt}</strong>{#if copyOld} — over a day old{/if}.
        {#if $online}<button class="link" on:click={refreshCopy} disabled={s.refreshing}>{s.refreshing ? 'Refreshing…' : 'Refresh'}</button>{/if}
      {/if}
      {#if s.refreshError && s.snapshot}<span class="err">Could not refresh: {s.refreshError}</span>{/if}
    </div>
    {#if $syncState.pending + $syncState.error > 0}
      <p class="sync">{$syncState.pending + $syncState.error} lookup{$syncState.pending + $syncState.error === 1 ? '' : 's'} not yet recorded
        {#if $syncState.error}<button class="link" on:click={retryErrors}>Retry</button>{/if}</p>
    {/if}

    {#if s.error}
      <p class="warn">{s.error}</p>
    {:else}
      <form on:submit|preventDefault={search}>
        <label for="pm-reg">Registration</label>
        <div class="row">
          <input id="pm-reg" bind:value={q} autocomplete="off" autocapitalize="characters" placeholder="e.g. AB12 CDE" />
          <button type="submit" class="go">Look up</button>
        </div>
      </form>

      {#if result}
        <section>
          <h2>Car park</h2>
          {#if result.carPark.length === 0}
            <p class="muted">Not on a parking agreement here.
              <span class="small">Bays that belong to flats may not have their holders recorded, and visitors are not recorded at all.</span></p>
          {:else}
            {#each result.carPark as h (h.vehicle.id)}
              <div class="hit">
                <span class="reg">{h.vehicle.registration}</span>
                {#if h.standing === 'authorised'}<span class="ok">authorised today</span>
                {:else if h.standing === 'pending'}<span class="info">not yet authorised{h.agreement?.status === 'draft'
                  ? ' (agreement is a draft)' : ' — from ' + fmtDate([h.agreement?.starts_on, h.vehicle.from_date].filter(Boolean).sort().pop())}</span>
                {:else}<span class="amber">no longer authorised{h.vehicle.to_date ? ' since ' + fmtDate(h.vehicle.to_date) : ''}</span>{/if}
                <span class="detail">{h.bay?.ref ?? '—'} · {h.agreement?.reference ?? '—'} ({STATUS_LABEL[h.agreement?.status] ?? '—'})</span>
                <span class="detail">{h.holder?.display_name ?? '—'}{#if h.holder?.phone} · <a href="tel:{h.holder.phone}">{h.holder.phone}</a>{/if}</span>
              </div>
            {/each}
          {/if}

          <h2>Road permits</h2>
          {#if result.permits.length === 0}
            <p class="muted">No road permit for this registration.</p>
          {:else}
            {#each result.permits as h (h.permit.id)}
              <div class="hit">
                <span class="reg">{h.permit.registration}</span>
                {#if h.status === 'current'}<span class="ok">current permit, until {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</span>
                {:else if h.status === 'upcoming'}<span class="info">future permit, starts {fmtPermitWhen(h.permit.valid_from, h.permit.valid_from_time)}</span>
                {:else}<span class="amber">expired permit, ended {fmtPermitWhen(h.permit.valid_to, h.permit.valid_to_time)}</span>{/if}
                <span class="detail">Permit {permitNumberLabel(h.permit.permit_number)} · {h.permit.company}</span>
              </div>
            {/each}
          {/if}
          <p class="small muted">Looked up {searched.toUpperCase()} against the copy as at {copyAt}.</p>
        </section>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .pm { min-height: 100vh; background: #0d0d14; color: #e5e7eb; font-family: 'DM Mono', ui-monospace, monospace; padding: 0 16px 32px; box-sizing: border-box; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #262636; margin-bottom: 12px; }
  h1 { font-size: 18px; margin: 0; flex: 1; color: #fff; }
  h2 { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; margin: 18px 0 6px; }
  .back { min-width: 44px; min-height: 44px; font-size: 26px; background: none; border: none; color: #e5e7eb; }
  .net { font-size: 11px; padding: 4px 8px; border-radius: 999px; background: #134e4a; color: #5eead4; }
  .net.off { background: #451a03; color: #fdba74; }
  .copy { font-size: 13px; color: #9ca3af; margin-bottom: 8px; }
  .copy.stale strong { color: #fbbf24; }
  .copy strong { color: #e5e7eb; font-weight: 600; }
  .sync { font-size: 12px; color: #fbbf24; }
  .err { display: block; color: #f87171; font-size: 12px; }
  .warn { color: #fbbf24; background: #1f1a0d; border: 1px solid #3f3412; border-radius: 8px; padding: 12px; }
  .muted { color: #9ca3af; }
  .small { display: block; font-size: 11px; color: #6b7280; margin-top: 4px; }
  .center { text-align: center; padding: 40px 0; }
  label { display: block; font-size: 12px; color: #9ca3af; margin-bottom: 4px; }
  .row { display: flex; gap: 8px; }
  input { flex: 1; min-width: 0; min-height: 48px; font: inherit; font-size: 20px; text-transform: uppercase; background: #16161f; color: #fff;
          border: 1px solid #3a3a4a; border-radius: 8px; padding: 0 12px; }
  .go { min-height: 48px; padding: 0 16px; font: inherit; font-weight: 600; background: #3c9683; color: #fff; border: none; border-radius: 8px; }
  .link { min-height: 32px; background: none; border: none; color: #5eead4; font: inherit; text-decoration: underline; padding: 0 4px; }
  .hit { padding: 10px 0; border-bottom: 1px solid #1f1f2b; display: flex; flex-direction: column; gap: 2px; }
  .reg { font-size: 18px; color: #fff; }
  .ok { color: #4ade80; font-size: 13px; }
  .info { color: #38bdf8; font-size: 13px; }
  .amber { color: #fbbf24; font-size: 13px; }
  .detail { color: #9ca3af; font-size: 13px; }
  a { color: #5eead4; }
</style>
