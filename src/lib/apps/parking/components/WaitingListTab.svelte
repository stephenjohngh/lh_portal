<!-- src/lib/apps/parking/components/WaitingListTab.svelte -->
<!-- The waiting list, first come, first served (decision D5): each place with
     its position, any offer and when it expires, who it is with and its
     deadline. Since migration 262 a place is an item of the shared workflow
     manager ("Waiting list place", Admin → Workflows): its moves, history and
     record are the shared controls'. What is Parking's own stays here —
     offering a bay (the bay and dates) and accepting (the agreement form) are
     made through Parking's forms, which move the place. An offer that runs
     past its expiry goes back to the queue by itself the day after. -->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { parkingStore } from '../stores/parkingStore.js';
  import { waitingListStore } from '../stores/waitingListStore.js';
  import { requestStore } from '../stores/requestStore.js';
  import {
    queue, positionOf, validateApplication, validateOffer, bayOfferProblem, offerLapsed, nextFor, agreementForOffer,
    defaultExpiry, ANY_SIZE, APPLICATION_STATUS_LABEL, OPEN,
  } from '../utils/waitingListModel.js';
  import { validateHolder, HOLDER_TYPE_LABEL, todayISO } from '../utils/agreementModel.js';
  import { PARKING_BAY_TYPES } from '#lib/apps/building_assets/utils/spaceTypeOptions.js';
  import { isFinished } from '#lib/workflow/workflowModel.js';
  import { deadlineBand, deadlineWords } from '#lib/workflow/workflowDeadlines.js';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { permissions } from '#lib/stores/permissions.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { auth } from '#lib/stores/auth.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import Button         from '#lib/components/common/Button.svelte';
  import FormSelect     from '#lib/components/common/FormSelect.svelte';
  import FormInput      from '#lib/components/common/FormInput.svelte';
  import ErrorDisplay   from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import HolderFields   from './HolderFields.svelte';

  export let canEdit = false;
  /** A place to open when the tab opens (from an application's link). @type {string|null} */
  export let focusId = null;

  const dispatch = createEventDispatcher();
  const today = todayISO();
  const sizeOptions = [{ value: ANY_SIZE, label: 'Any size' }, ...PARKING_BAY_TYPES.map(t => ({ value: t, label: t }))];

  let ready = false;
  /** @type {Array<{ id: string, full_name: string|null }>} */
  let assignees = [];
  onMount(async () => {
    try {
      await waitingListStore.load();
      if (!$waitingListStore.workflow && $permissions.isAdmin) await waitingListStore.setUpWorkflow();
      const [list] = await Promise.all([waitingListStore.assignees(), profilesStore.load()]);
      assignees = list;
      if (focusId) { selectedId = focusId; show = 'all'; }
      // The online application each place came from, if any — read alone, so a
      // failure costs only the link, never the list.
      requestStore.load().catch((/** @type {any} */ err) => { requestReadError = errMessage(err, 'Could not read which online application each place came from.'); });
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not set up the waiting list’s workflow.'); }
    finally { ready = true; }
  });

  $: s = $parkingStore;
  $: w = $waitingListStore;
  $: me = $auth.user?.id ?? null;
  $: nameById = Object.fromEntries(/** @type {Array<{ id: string, full_name: string|null }>} */ ($profiles.list)
    .map((p) => [p.id, p.full_name || 'A user with no name set']));
  $: withName = (/** @type {string|null|undefined} */ uid) => (uid ? nameById[uid] || 'A user no longer listed' : '');

  let show = 'open';            // 'open' | 'mine' | 'all'
  let error = '';
  let busy = false;
  /** @type {string|null} */
  let selectedId = null;
  let requestReadError = '';

  $: holderName = (id) => {
    const h = s.holders.find(x => x.id === id);
    return h ? (h.company_name ? `${h.company_name} — ${h.display_name}` : h.display_name) : '—';
  };
  $: holderKind = (id) => HOLDER_TYPE_LABEL[s.holders.find(x => x.id === id)?.holder_type ?? ''] ?? '';
  $: bayOf = (bayId) => s.bays.find(b => b.bay_id === bayId) ?? null;
  $: itemFor = (/** @type {string} */ id) => w.items.find((i) => i.subject_id === id) ?? null;
  $: dueOf = (/** @type {string} */ id) => {
    const item = itemFor(id);
    const step = w.steps.find((st) => st.key === item?.step_key);
    return item?.due_on && !isFinished(step?.kind ?? '') ? item.due_on : null;
  };

  // Open places in queue order (offers first, then the queue itself); closed
  // ones after, newest first.
  $: rows = (() => {
    const offered = s.applications.filter(a => a.status === 'offered')
      .sort((a, b) => a.joined_on.localeCompare(b.joined_on));
    const open = [...offered, ...queue(s.applications)];
    if (show === 'open') return open;
    if (show === 'mine') return open.filter(a => !!me && itemFor(a.id)?.assigned_to === me);
    const closed = s.applications.filter(a => !OPEN.has(a.status))
      .sort((a, b) => b.updated_at?.localeCompare?.(a.updated_at ?? '') ?? 0);
    return [...open, ...closed];
  })();
  $: selected = s.applications.find(a => a.id === selectedId) ?? null;

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

  // ── Offering a bay: Parking's own form, which moves the place ──
  /** @type {string|null} */
  let offering = null;          // the application id the offer form is open for
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
  // First come, first served: if someone is ahead of this applicant for the
  // chosen bay, say so. A warning, not a refusal — there can be a reason, and
  // the history records the offer either way.
  $: aheadOf = (app) => {
    const bay = s.bays.find(b => b.space_id === offer.space_id);
    const next = bay ? nextFor(bay, s.applications) : null;
    return next && next.id !== app.id ? next : null;
  };
  async function saveOffer(app) {
    const bay = s.bays.find(b => b.space_id === offer.space_id);
    const p = validateOffer(app, bay, s.agreements, s.applications, offer);
    if (p) { error = p; return; }
    const id = app.id; const o = offer;
    busy = true; error = '';
    try { await parkingStore.makeOffer(id, o.space_id, o); offering = null; }
    catch (/** @type {any} */ err) { error = errMessage(err); }
    finally { busy = false; }
  }

  function accept(app) {
    const made = agreementForOffer(app, s.agreements);
    // The agreement exists but recording the acceptance failed: finish that,
    // rather than drawing up a second agreement.
    if (made) {
      const a = app.id; const g = made.id;
      busy = true; error = '';
      parkingStore.markAllocated(a, g).catch((/** @type {any} */ err) => { error = errMessage(err); }).finally(() => { busy = false; });
      return;
    }
    const bay = bayOf(app.offered_bay_id);
    if (bay) dispatch('accept', { applicationId: app.id, spaceId: bay.space_id, holderId: app.holder_id });
  }

  // ── The shared controls: what is Parking's own ──
  const handOff = (/** @type {any} */ m) => {
    if (!selected) return false;
    if (m.from_key === 'waiting' && m.to_key === 'offered') { startOffer(selected); return true; }
    if (m.to_key === 'allocated') { accept(selected); return true; }
    return false;
  };
  const extraRefusal = (/** @type {any} */ m) =>
    (m.from_key === 'allocated' && m.to_key === 'offered'
      ? 'Delete the draft agreement to reopen the offer — the person keeps the bay until then.' : null);
  const confirmMove = (/** @type {any} */ m) => {
    if (!selected || m.to_key !== 'waiting') return null;
    const lapsed = offerLapsed(selected, today);
    return {
      title: 'Back to the queue',
      message: lapsed
        ? `The offer expired on ${fmtDate(selected.offer_expires_on)}, so it is recorded as lapsed. They keep their place in the queue.`
        : `The offer is open until ${fmtDate(selected.offer_expires_on)}, so it is recorded as declined. They keep their place in the queue.`,
    };
  };
  const onMove = async (/** @type {any} */ m, /** @type {string} */ note) => {
    const id = selected?.id;                         // captured before the await
    if (!id) return null;
    if (m.to_key === 'waiting') return parkingStore.returnToQueue(id, note);
    if (m.to_key === 'withdrawn') return parkingStore.withdrawApplication(id, note);
    throw new Error('Make this through its own form.');
  };
  const onAssign = (/** @type {string|null} */ userId) => (selected ? waitingListStore.assign(selected.id, userId) : Promise.resolve(null));
  $: audit = selected ? { appId: 'parking', entityType: 'parking_application', entityId: selected.id } : null;
  // The online application a place came from (parking_requests.application_id):
  // the two workflows stay separate and are linked both ways.
  $: requestOf = (/** @type {string} */ id) => $requestStore.requests.find((r) => r.application_id === id) ?? null;
  $: record = selected ? {
    filenameStem: `waiting-list-place_${today}`,
    subject: () => ({
      title: itemFor(selected.id)?.label ?? 'Waiting list place',
      facts: [
        ['Applicant', holderName(selected.holder_id)],
        ['Kind', holderKind(selected.holder_id)],
        ['Wants', selected.wanted_size === ANY_SIZE ? 'Any size' : selected.wanted_size],
        ['Joined the list', fmtDate(selected.joined_on)],
        ['Status', APPLICATION_STATUS_LABEL[selected.status]],
        ['Offers declined', String(selected.offers_declined ?? 0)],
        ['Notes', selected.notes],
        ['From online application', requestOf(selected.id)?.reference ?? ''],
      ],
      sections: [],
    }),
  } : null;

  // The car park's own timeline for a place, written by its triggers since
  // migration 224 — what happened before the workflow, and each offer's bay.
  /** @type {any[]} */
  let timeline = [];
  let timelineFor = '';
  let showTimeline = false;
  $: if (showTimeline && selected && timelineFor !== selected.id) { timelineFor = selected.id; readTimeline(selected.id); }
  async function readTimeline(/** @type {string} */ id) {
    timeline = [];
    try {
      const events = await parkingStore.loadApplicationEvents(id);
      if (timelineFor === id) timeline = events;
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the car park timeline.'); }
  }
  const TIMELINE_LABEL = {
    application_joined: 'Joined the list', offer_made: 'Offered a bay', offer_declined: 'Offer declined',
    offer_lapsed: 'Offer lapsed', offer_accepted: 'Offer accepted', application_withdrawn: 'Withdrawn',
    offer_returned: 'Returned to the queue', offer_reopened: 'Offer reopened (its draft was deleted)',
  };
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-400' };
</script>

{#if !ready}
  <LoadingSpinner text="Loading the waiting list…" />
{:else}
<div class="flex flex-wrap items-center gap-2 mb-3">
  <select bind:value={show} aria-label="Which places" class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
    <option value="open">Open (waiting and offered)</option>
    <option value="mine">Open — with me</option>
    <option value="all">All, including closed</option>
  </select>
  {#if canEdit && !adding}<Button size="small" variant="primary" on:click={startAdd}>Add to the waiting list</Button>{/if}
  <span class="text-xs text-slate-500">First come, first served. An offer goes back to the queue by itself the day after it expires; the person keeps their place.</span>
</div>

<ErrorDisplay message={error || w.error || ''} onDismiss={() => (error = '')} />
{#if !w.workflow}
  <p class="text-sm text-amber-300 mb-3">The waiting list’s workflow is not set up yet: an administrator opening this tab sets it up.</p>
{/if}

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

<div class="grid gap-4 {selected ? 'lg:grid-cols-[1fr_26rem]' : ''}">
  <div class="min-w-0 overflow-x-auto">
    {#if rows.length === 0}
      <p class="text-sm text-slate-500 italic py-4">{show === 'mine' ? 'None is with you.' : 'Nobody is waiting.'}</p>
    {:else}
      <table class="w-full text-sm" data-testid="waiting-list">
        <thead>
          <tr class="border-b border-slate-700 text-left text-xs text-slate-400">
            <th class="py-2 pr-3 font-medium">Place</th>
            <th class="py-2 pr-3 font-medium">Applicant</th>
            <th class="py-2 pr-3 font-medium">Wants</th>
            <th class="py-2 pr-3 font-medium">Joined</th>
            <th class="py-2 pr-3 font-medium">Status</th>
            <th class="py-2 pr-3 font-medium">With</th>
            <th class="py-2 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as app (app.id)}
            {@const offeredBay = bayOf(app.offered_bay_id)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <tr class="border-b border-slate-800 align-top cursor-pointer hover:bg-slate-800/60 {app.id === selectedId ? 'bg-slate-800' : ''} {OPEN.has(app.status) ? '' : 'opacity-60'}"
              on:click={() => { selectedId = app.id; showTimeline = false; }}>
              <td class="py-2 pr-3 text-slate-300">{positionOf(app, s.applications) ?? '—'}</td>
              <td class="py-2 pr-3 text-slate-200">{holderName(app.holder_id)}
                <span class="block text-xs text-slate-500">{holderKind(app.holder_id)}{app.offers_declined ? ` · declined ${app.offers_declined}` : ''}</span></td>
              <td class="py-2 pr-3 text-slate-300">{app.wanted_size === ANY_SIZE ? 'Any size' : app.wanted_size}</td>
              <td class="py-2 pr-3 text-xs text-slate-400">{fmtDate(app.joined_on)}</td>
              <td class="py-2 pr-3 text-xs">
                <span class="text-slate-200">{APPLICATION_STATUS_LABEL[app.status]}</span>
                {#if app.status === 'offered'}
                  <span class="block text-slate-400"><span class="font-mono">{offeredBay?.ref ?? '—'}</span> · expires {fmtDate(app.offer_expires_on)}</span>
                  {#if offerLapsed(app, today)}<span class="block text-amber-300">The offer has lapsed; it goes back to the queue overnight.</span>{/if}
                {/if}
              </td>
              <td class="py-2 pr-3 text-xs text-slate-300" data-testid="waiting-with">{OPEN.has(app.status) ? withName(itemFor(app.id)?.assigned_to) : ''}</td>
              <td class="py-2 text-xs whitespace-nowrap {BAND_CLS[deadlineBand(dueOf(app.id)) ?? 'ok']}" data-testid="waiting-due">
                {dueOf(app.id) ? deadlineWords(dueOf(app.id)) : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  {#if selected}
    {@const offeredBay = bayOf(selected.offered_bay_id)}
    <aside class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3 text-sm" data-testid="waiting-panel">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-white">{holderName(selected.holder_id)}</p>
          <p class="text-xs text-slate-400">{itemFor(selected.id)?.label ?? 'Waiting list place'}</p>
        </div>
        <Button variant="tertiary" size="xs" on:click={() => (selectedId = null)}>Close</Button>
      </div>
      {#if w.workflow}
        <WorkflowItemControls item={itemFor(selected.id)} workflow={w.workflow} steps={w.steps} moves={w.moves} fields={w.fields}
          reference={itemFor(selected.id)?.label ?? 'Waiting list place'} isAdmin={$permissions.isAdmin} {canEdit} {me} {assignees} {nameById}
          {onMove} {onAssign} onFieldsSaved={() => waitingListStore.load()} {extraRefusal} {confirmMove} {handOff} {audit} {record}>
          <dl class="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
            <dt class="text-slate-400">Kind</dt><dd class="text-slate-100">{holderKind(selected.holder_id)}</dd>
            <dt class="text-slate-400">Wants</dt><dd class="text-slate-100">{selected.wanted_size === ANY_SIZE ? 'Any size' : selected.wanted_size}</dd>
            <dt class="text-slate-400">Joined</dt><dd class="text-slate-100">{fmtDate(selected.joined_on)} · place {positionOf(selected, s.applications) ?? '—'}</dd>
            {#if selected.status === 'offered'}
              <dt class="text-slate-400">Offered</dt>
              <dd class="text-slate-100"><span class="font-mono">{offeredBay?.ref ?? '—'}</span> on {fmtDate(selected.offer_made_on)}, open until {fmtDate(selected.offer_expires_on)}</dd>
            {/if}
            {#if selected.offers_declined}<dt class="text-slate-400">Declined</dt><dd class="text-slate-100">{selected.offers_declined} offer{selected.offers_declined === 1 ? '' : 's'}</dd>{/if}
            {#if selected.notes}<dt class="text-slate-400">Notes</dt><dd class="text-slate-100 whitespace-pre-line">{selected.notes}</dd>{/if}
            {#if requestOf(selected.id)}
              <dt class="text-slate-400">Application</dt>
              <dd class="text-slate-100" data-testid="linked-application"><span class="font-mono">{requestOf(selected.id)?.reference}</span>
                <Button variant="tertiary" size="xs" on:click={() => dispatch('showApplication', requestOf(selected.id)?.id)}>Open it →</Button></dd>
            {/if}
          </dl>
          {#if requestReadError}<p class="text-xs text-amber-300">{requestReadError}</p>{/if}

          {#if offering === selected.id}
            <div class="rounded-lg border border-slate-600 p-3 space-y-2" data-testid="offer-form">
              <p class="text-sm font-semibold text-slate-200">Offer a bay</p>
              {#if offerBays(selected).length === 0}
                <p class="text-sm text-slate-400">No free {selected.wanted_size === ANY_SIZE ? '' : selected.wanted_size.toLowerCase() + ' '}bay to offer.</p>
              {:else}
                <FormSelect label="Bay" bind:value={offer.space_id} placeholder="-- Choose --"
                  options={offerBays(selected).map(b => ({ value: b.space_id, label: `${b.ref}${b.size ? ' · ' + b.size : ''}` }))} />
                <div class="grid grid-cols-2 gap-3">
                  <FormInput label="Offered on" type="date" bind:value={offer.made_on} />
                  <FormInput label="Expires" type="date" bind:value={offer.expires_on}
                    helpText="The day after, it goes back to the queue by itself." />
                </div>
                {#if aheadOf(selected)}
                  <p class="text-xs text-amber-300">
                    ⚠ {holderName(aheadOf(selected).holder_id)} joined earlier ({fmtDate(aheadOf(selected).joined_on)}) and is
                    ahead of them for this bay. First come, first served would offer it to them first.
                  </p>
                {/if}
              {/if}
              <div class="flex gap-2">
                {#if offerBays(selected).length}<Button size="small" variant="primary" disabled={busy} on:click={() => saveOffer(selected)}>Make the offer</Button>{/if}
                <Button size="small" variant="secondary" on:click={() => (offering = null)}>Cancel</Button>
              </div>
            </div>
          {/if}

          <details class="text-xs text-slate-400" bind:open={showTimeline}>
            <summary class="cursor-pointer">Car park timeline</summary>
            {#each timeline as e (e.id)}
              <p class="mt-1">
                <span class="text-slate-500">{fmtDate(e.created_at)}</span>
                <span class="text-slate-200 ml-1">{TIMELINE_LABEL[e.event_type] ?? e.event_type}</span>
                {#if e.event_type === 'offer_made'}
                  · <span class="font-mono">{s.bays.find(b => b.bay_id === e.bay_id)?.ref ?? '—'}</span>,
                  expiring {fmtDate(e.detail?.expires_on)}
                {/if}
              </p>
            {:else}
              <p class="mt-1 italic">Nothing recorded yet.</p>
            {/each}
          </details>
        </WorkflowItemControls>
      {/if}
    </aside>
  {/if}
</div>
{/if}
