<!-- src/lib/apps/parking/components/WaitingListTab.svelte -->
<!-- The waiting list, first come, first served (decision D5): each open
     application with its place, offers made and when they expire, and the
     actions that move an application along. Accepting an offer opens the
     agreement form for that bay and person; the application is marked
     allocated once the agreement is saved. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import {
    queue, positionOf, validateApplication, validateOffer, bayOfferProblem, offerLapsed, nextFor, agreementForOffer,
    defaultExpiry, ANY_SIZE, APPLICATION_STATUS_LABEL, OPEN,
  } from '../utils/waitingListModel.js';
  import { validateHolder, HOLDER_TYPE_LABEL, todayISO } from '../utils/agreementModel.js';
  import { PARKING_BAY_TYPES } from '#lib/apps/building_assets/utils/spaceTypeOptions.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import Button       from '#lib/components/common/Button.svelte';
  import FormSelect   from '#lib/components/common/FormSelect.svelte';
  import FormInput    from '#lib/components/common/FormInput.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import HolderFields from './HolderFields.svelte';

  export let canEdit = false;

  const dispatch = createEventDispatcher();
  const today = todayISO();
  const sizeOptions = [{ value: ANY_SIZE, label: 'Any size' }, ...PARKING_BAY_TYPES.map(t => ({ value: t, label: t }))];

  $: s = $parkingStore;
  let show = 'open';            // 'open' | 'all'
  let error = '';
  let busy = false;

  $: holderName = (id) => {
    const h = s.holders.find(x => x.id === id);
    return h ? (h.company_name ? `${h.company_name} — ${h.display_name}` : h.display_name) : '—';
  };
  $: holderKind = (id) => HOLDER_TYPE_LABEL[s.holders.find(x => x.id === id)?.holder_type ?? ''] ?? '';
  $: bayOf = (bayId) => s.bays.find(b => b.bay_id === bayId) ?? null;

  // Open applications in queue order (offers first, then the queue itself);
  // closed ones after, newest first.
  $: rows = (() => {
    const offered = s.applications.filter(a => a.status === 'offered')
      .sort((a, b) => a.joined_on.localeCompare(b.joined_on));
    const open = [...offered, ...queue(s.applications)];
    if (show === 'open') return open;
    const closed = s.applications.filter(a => !OPEN.has(a.status))
      .sort((a, b) => b.updated_at?.localeCompare?.(a.updated_at ?? '') ?? 0);
    return [...open, ...closed];
  })();

  // ── Adding an application ──
  let adding = false;
  let holderMode = 'existing';
  let form = {};
  let newHolder = {};
  function startAdd() {
    holderMode = s.holders.length ? 'existing' : 'new';
    form = { holder_id: '', wanted_size: 'Car', joined_on: today, notes: '' };
    newHolder = { holder_type: '' };
    adding = true; error = '';
  }
  async function saveAdd() {
    // Check the application BEFORE creating a new person, so a refused one
    // does not leave a stray holder behind.
    if (holderMode === 'new') {
      const hp = validateHolder(newHolder) ?? validateApplication({ ...form, holder_id: 'new' }, []);
      if (hp) { error = hp; return; }
    } else {
      const p = validateApplication(form, s.applications);
      if (p) { error = p; return; }
    }
    busy = true; error = '';
    try {
      const hid = holderMode === 'new' ? (await parkingStore.saveHolder(null, newHolder)).id : form.holder_id;
      await parkingStore.addApplication(hid, form);
      adding = false;
    } catch (/** @type {any} */ err) { error = err.message; }
    finally { busy = false; }
  }

  // ── Offering a bay ──
  let offering = null;          // the application id an offer form is open for
  let offer = {};
  function startOffer(app) {
    offering = app.id;
    offer = { space_id: '', made_on: today, expires_on: defaultExpiry(today) };
    error = '';
  }
  // Bays that could be offered to this application: free, and the right size.
  $: offerBays = (app) => s.bays.filter(b =>
    (app.wanted_size === ANY_SIZE || b.size === app.wanted_size)
    && !bayOfferProblem(b, s.agreements, s.applications, today));

  async function run(fn) {
    busy = true; error = '';
    try { await fn(); }
    catch (/** @type {any} */ err) { error = err.message; }
    finally { busy = false; }
  }
  // First come, first served: if someone is ahead of this applicant for the
  // chosen bay, say so. A warning, not a refusal — there can be a reason, and
  // the timeline records the offer either way.
  $: aheadOf = (app) => {
    const bay = s.bays.find(b => b.space_id === offer.space_id);
    const next = bay ? nextFor(bay, s.applications) : null;
    return next && next.id !== app.id ? next : null;
  };
  const saveOffer = (app) => {
    const bay = s.bays.find(b => b.space_id === offer.space_id);
    const p = validateOffer(app, bay, s.agreements, s.applications, offer);
    if (p) { error = p; return; }
    const id = app.id; const o = offer;
    return run(async () => { await parkingStore.makeOffer(id, o.space_id, o); offering = null; });
  };
  const back = (app, outcome) => { const id = app.id; return run(() => parkingStore.returnToQueue(id, outcome)); };
  const withdraw = (app) => { const id = app.id; return run(() => parkingStore.withdrawApplication(id)); };
  // Each application's history, written by the database: when it joined,
  // every offer made, and how each ended.
  let historyFor = null;
  let history = [];
  const HISTORY_LABEL = {
    application_joined: 'Joined the list', offer_made: 'Offered a bay', offer_declined: 'Offer declined',
    offer_lapsed: 'Offer lapsed', offer_accepted: 'Offer accepted', application_withdrawn: 'Withdrawn',
    offer_returned: 'Returned to the queue', offer_reopened: 'Offer reopened (its draft was deleted)',
  };
  async function toggleHistory(app) {
    if (historyFor === app.id) { historyFor = null; return; }
    const id = app.id;
    historyFor = id; history = [];
    try {
      const events = await parkingStore.loadApplicationEvents(id);
      if (historyFor === id) history = events;
    } catch { /* the list still works without it */ }
  }

  function accept(app) {
    const bay = bayOf(app.offered_bay_id);
    if (bay) dispatch('accept', { applicationId: app.id, spaceId: bay.space_id, holderId: app.holder_id });
  }
</script>

<div class="flex flex-wrap items-center gap-2 mb-3">
  <select bind:value={show} class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
    <option value="open">Open (waiting and offered)</option>
    <option value="all">All, including closed</option>
  </select>
  {#if canEdit && !adding}<Button size="small" variant="primary" on:click={startAdd}>Add to the waiting list</Button>{/if}
  <span class="text-xs text-slate-500">First come, first served. Declining or letting an offer lapse keeps the person's place.</span>
</div>

{#if error}<div class="mb-3"><ErrorDisplay message={error} /></div>{/if}

{#if adding}
  <div class="rounded-xl border border-slate-600 bg-slate-800 p-4 mb-4 space-y-3">
    <p class="text-sm font-semibold text-slate-200">Add to the waiting list</p>
    <div class="flex gap-4 text-sm text-slate-300">
      <label class="inline-flex items-center gap-2"><input type="radio" bind:group={holderMode} value="existing" disabled={!s.holders.length} /> Existing person</label>
      <label class="inline-flex items-center gap-2"><input type="radio" bind:group={holderMode} value="new" /> New person</label>
    </div>
    {#if holderMode === 'existing'}
      <FormSelect label="Applicant" bind:value={form.holder_id} placeholder="-- Choose --"
        options={s.holders.map(h => ({ value: h.id, label: `${holderName(h.id)} (${HOLDER_TYPE_LABEL[h.holder_type]})` }))} />
    {:else}
      <HolderFields bind:holder={newHolder} />
    {/if}
    <div class="grid grid-cols-2 gap-3">
      <FormSelect label="Wants" bind:value={form.wanted_size} options={sizeOptions} placeholder="" />
      <FormInput label="Joined the list on" type="date" bind:value={form.joined_on}
        helpText="Their place in the queue. Use the date they first asked, if earlier than today." />
    </div>
    <FormInput label="Notes" bind:value={form.notes} />
    <div class="flex gap-2">
      <Button size="small" variant="primary" disabled={busy} on:click={saveAdd}>Add</Button>
      <Button size="small" variant="secondary" on:click={() => adding = false}>Cancel</Button>
    </div>
  </div>
{/if}

{#if rows.length === 0}
  <p class="text-sm text-slate-500 italic py-4">Nobody is waiting.</p>
{:else}
  <table class="w-full text-sm" data-testid="waiting-list">
    <thead>
      <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
        <th class="py-2 pr-3 font-medium">Place</th>
        <th class="py-2 pr-3 font-medium">Applicant</th>
        <th class="py-2 pr-3 font-medium">Wants</th>
        <th class="py-2 pr-3 font-medium">Joined</th>
        <th class="py-2 pr-3 font-medium">Status</th>
        <th class="py-2"></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as app (app.id)}
        {@const offeredBay = bayOf(app.offered_bay_id)}
        <tr class="border-b border-slate-800 align-top {OPEN.has(app.status) ? '' : 'opacity-60'}">
          <td class="py-2 pr-3 text-slate-300">{positionOf(app, s.applications) ?? '—'}</td>
          <td class="py-2 pr-3 text-slate-200">{holderName(app.holder_id)}
            <span class="block text-xs text-slate-500">{holderKind(app.holder_id)}{app.offers_declined ? ` · declined ${app.offers_declined}` : ''}</span></td>
          <td class="py-2 pr-3 text-slate-300">{app.wanted_size === ANY_SIZE ? 'Any size' : app.wanted_size}</td>
          <td class="py-2 pr-3 text-xs text-slate-400">{fmtDate(app.joined_on)}</td>
          <td class="py-2 pr-3 text-xs">
            <span class="text-slate-200">{APPLICATION_STATUS_LABEL[app.status]}</span>
            {#if app.status === 'offered'}
              <span class="block text-slate-400"><span class="font-mono">{offeredBay?.ref ?? '—'}</span> · expires {fmtDate(app.offer_expires_on)}</span>
              {#if offerLapsed(app, today)}<span class="block text-amber-300">The offer has lapsed.</span>{/if}
            {/if}
          </td>
          <td class="py-2 text-right whitespace-nowrap space-x-2">
            {#if canEdit && app.status === 'waiting'}
              <button class="text-xs text-purple-400 hover:text-purple-300" on:click={() => startOffer(app)}>Offer a bay</button>
            {/if}
            {#if canEdit && app.status === 'offered' && agreementForOffer(app, s.agreements)}
              {@const made = agreementForOffer(app, s.agreements)}
              <!-- The agreement exists but marking the offer accepted failed:
                   finish that, rather than drawing up a second agreement. -->
              <button class="text-xs text-green-400 hover:text-green-300" disabled={busy}
                on:click={() => { const a = app.id; const g = made.id; run(() => parkingStore.markAllocated(a, g)); }}>
                Mark accepted ({made.reference})</button>
            {:else if canEdit && app.status === 'offered'}
              <button class="text-xs text-green-400 hover:text-green-300" disabled={busy} on:click={() => accept(app)}>Accepted</button>
              <button class="text-xs text-slate-400 hover:text-white" disabled={busy} on:click={() => back(app, 'declined')}>Declined</button>
              <button class="text-xs text-slate-400 hover:text-white" disabled={busy} on:click={() => back(app, 'lapsed')}>Lapsed</button>
            {/if}
            {#if canEdit && OPEN.has(app.status)}
              <button class="text-xs text-slate-500 hover:text-red-400" disabled={busy} on:click={() => withdraw(app)}>Withdraw</button>
            {/if}
            <button class="text-xs text-slate-500 hover:text-white" on:click={() => toggleHistory(app)}>History</button>
          </td>
        </tr>
        {#if historyFor === app.id}
          <tr class="border-b border-slate-800">
            <td colspan="6" class="py-2 pl-8">
              {#each history as e (e.id)}
                <p class="text-xs text-slate-400">
                  <span class="text-slate-500">{fmtDate(e.created_at)}</span>
                  <span class="text-slate-200 ml-1">{HISTORY_LABEL[e.event_type] ?? e.event_type}</span>
                  {#if e.event_type === 'offer_made'}
                    · <span class="font-mono">{s.bays.find(b => b.bay_id === e.bay_id)?.ref ?? '—'}</span>,
                    expiring {fmtDate(e.detail?.expires_on)}
                  {/if}
                </p>
              {:else}
                <p class="text-xs text-slate-500 italic">Nothing recorded yet.</p>
              {/each}
            </td>
          </tr>
        {/if}
        {#if offering === app.id}
          <tr class="border-b border-slate-800">
            <td colspan="6" class="py-3">
              <div class="rounded-lg border border-slate-600 p-3 space-y-2">
                {#if offerBays(app).length === 0}
                  <p class="text-sm text-slate-400">No free {app.wanted_size === ANY_SIZE ? '' : app.wanted_size.toLowerCase() + ' '}bay to offer.</p>
                {:else}
                  <div class="grid grid-cols-3 gap-3">
                    <FormSelect label="Bay" bind:value={offer.space_id} placeholder="-- Choose --"
                      options={offerBays(app).map(b => ({ value: b.space_id, label: `${b.ref}${b.size ? ' · ' + b.size : ''}` }))} />
                    <FormInput label="Offered on" type="date" bind:value={offer.made_on} />
                    <FormInput label="Expires" type="date" bind:value={offer.expires_on} />
                  </div>
                  {#if aheadOf(app)}
                    <p class="text-xs text-amber-300">
                      ⚠ {holderName(aheadOf(app).holder_id)} joined earlier ({fmtDate(aheadOf(app).joined_on)}) and is
                      ahead of them for this bay. First come, first served would offer it to them first.
                    </p>
                  {/if}
                {/if}
                <div class="flex gap-2">
                  {#if offerBays(app).length}<Button size="small" variant="primary" disabled={busy} on:click={() => saveOffer(app)}>Make the offer</Button>{/if}
                  <Button size="small" variant="secondary" on:click={() => offering = null}>Cancel</Button>
                </div>
              </div>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/if}
