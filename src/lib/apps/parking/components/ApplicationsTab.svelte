<!-- src/lib/apps/parking/components/ApplicationsTab.svelte -->
<!-- Parking → Applications (migration 247, 2026-10-17): applications for a bay
     made on the public form (/parking/apply), moved through their workflow —
     the shared workflow manager (#lib/workflow/), edited in Admin → Workflows.
     The moves offered are the ones defined from the application's step; the
     database makes the same checks. Accepting runs the workflow's action: the
     holder is made (or found by email) and put on the waiting list, dated the
     day the application was received, and a bay is offered from there as now.
     ⛔ Personal data, behind the Parking grant like every Parking table. -->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { requestStore } from '../stores/requestStore.js';
  import { parkingStore } from '../stores/parkingStore.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { isFinished } from '#lib/workflow/workflowModel.js';
  import { deadlineBand, deadlineWords } from '#lib/workflow/workflowDeadlines.js';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { workflowStats } from '#lib/workflow/workflowStats.js';
  import { listEvents } from '#lib/workflow/workflowApi.js';
  import WorkflowDiagram from '#lib/workflow/WorkflowDiagram.svelte';
  import { today } from '#lib/utils/dates.js';
  import { HOLDER_TYPE_LABEL } from '../utils/agreementModel.js';
  import { ANY_SIZE, placeStanding, positionOf } from '../utils/waitingListModel.js';
  import { waitingListStore } from '../stores/waitingListStore.js';
  import { fmtDateTime, fmtDate } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { auth } from '#lib/stores/auth.js';

  export let canEdit = false;
  /** An application to open when the tab opens (from a waiting-list place's link). @type {string|null} */
  export let focusId = null;
  const dispatch = createEventDispatcher();

  let ready = false;
  let error = '';
  let show = 'open';           // 'open' | 'finished' | ''
  let q = '';
  /** @type {string|null} */
  let selectedId = null;

  // Who an application is with (migration 250): the people it may be given to,
  // and everyone's names for showing who it is with (a person may since have
  // lost the grant and still be named on an application).
  /** @type {Array<{ id: string, full_name: string|null }>} */
  let assignees = [];

  onMount(async () => {
    try {
      await requestStore.load();
      if (!$requestStore.workflow && $permissions.isAdmin) await requestStore.setUpWorkflow();
      const [list] = await Promise.all([requestStore.assignees(), profilesStore.load(), waitingListStore.load()]);
      assignees = list;
      if (focusId) { selectedId = focusId; show = ''; }
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the applications.'); }
    finally { ready = true; }
  });

  $: nameById = Object.fromEntries(/** @type {Array<{ id: string, full_name: string|null }>} */ ($profiles.list)
    .map((p) => [p.id, p.full_name || 'A user with no name set']));
  $: withName = (/** @type {string|null|undefined} */ uid) => (uid ? nameById[uid] || 'A user no longer listed' : '');
  $: me = $auth.user?.id ?? null;

  $: s = $requestStore;
  $: stepByKey = new Map(s.steps.map((st) => [st.key, st]));
  $: itemFor = (/** @type {string} */ id) => s.items.find((i) => i.subject_id === id) ?? null;
  $: stepOf = (/** @type {string} */ id) => stepByKey.get(itemFor(id)?.step_key ?? '') ?? null;
  $: rows = s.requests
    .filter((r) => {
      const k = stepOf(r.id)?.kind ?? '';
      if (show === 'mine') return !isFinished(k) && !!me && itemFor(r.id)?.assigned_to === me;
      return show === '' || (show === 'open' ? !isFinished(k) : isFinished(k));
    })
    .filter((r) => matchesSearch([r.reference, r.display_name, r.company_name, r.email, r.wanted_size], q));
  $: selected = s.requests.find((r) => r.id === selectedId) ?? null;
  // An open item's deadline in its step (migration 248); a finished one has none.
  $: dueOf = (/** @type {string} */ id) => {
    const item = itemFor(id);
    return item?.due_on && !isFinished(stepOf(id)?.kind ?? '') ? item.due_on : null;
  };
  // The process drawn, with how many are where — read when opened.
  let showProcess = false;
  /** @type {any[]} */
  let processEvents = [];
  let eventsFor = '';
  $: if (showProcess && s.workflow && eventsFor !== s.workflow.id) { eventsFor = s.workflow.id; readEvents(s.workflow.id); }
  async function readEvents(/** @type {string} */ id) {
    try { processEvents = (await listEvents(id)).events; }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the process figures.'); }
  }
  $: processStats = showProcess && s.workflow
    ? workflowStats({ steps: s.steps, moves: s.moves, items: s.items, events: processEvents, today: today() }) : null;
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-400' };

  // The item's controls make the change through the store; accepting runs the
  // workflow's action, which changes the waiting list.
  const onMove = async (/** @type {any} */ m, /** @type {string} */ note) => {
    const request = selected;                         // captured before the await
    if (!request) return null;
    const result = await requestStore.move(request, m.to_key, note);
    if (result?.action) await parkingStore.load();
    return result;
  };
  const onAssign = (/** @type {string|null} */ userId) => (selected ? requestStore.assign(selected, userId) : Promise.resolve(null));

  const sizeLabel = (/** @type {string} */ v) => (v === ANY_SIZE ? 'Any size' : v);

  // ── The place an accepted application became (the two workflows stay
  // separate and are linked: parking_requests.application_id). ──
  $: placeOf = (/** @type {string|null} */ id) => (id ? $parkingStore.applications.find((a) => a.id === id) ?? null : null);
  $: standingOf = (/** @type {string} */ id) => {
    const place = placeOf(id);
    const item = place ? $waitingListStore.items.find((i) => i.subject_id === place.id) : null;
    const stepName = item ? $waitingListStore.steps.find((st) => st.key === item.step_key)?.name ?? null : null;
    const bayRef = place?.offered_bay_id ? $parkingStore.bays.find((b) => b.bay_id === place.offered_bay_id)?.ref ?? null : null;
    return placeStanding(place, { stepName, position: place ? positionOf(place, $parkingStore.applications) : null, bayRef, fmtDate });
  };

  // The record of one application — what it is, where it stands, every move
  // and who made it — as a Word file (the shared controls build it).
  $: audit = selected ? { appId: 'parking', entityType: 'parking_request', entityId: selected.id } : null;
  const onFieldsSaved = () => requestStore.load();
  $: record = selected ? {
    filenameStem: `${selected.reference}_${today()}`,
    subject: () => ({
      title: `Parking application ${selected.reference}`,
      facts: [
        ['Reference', selected.reference],
        ['Received', fmtDateTime(selected.received_at)],
        ['Name', selected.display_name],
        ['Company', selected.company_name],
        ['Kind', HOLDER_TYPE_LABEL[selected.holder_type] ?? selected.holder_type],
        ['Email', selected.email],
        ['Phone', selected.phone],
        ['Address for letters', selected.correspondence_address],
        ['Size wanted', sizeLabel(selected.wanted_size)],
        ['Their notes', selected.notes],
        ['On the waiting list', selected.application_id ? standingOf(selected.application_id) : ''],
      ],
      sections: [{ heading: 'Privacy notice they agreed to', text: selected.privacy_notice_text }],
    }),
  } : null;
</script>

{#if !ready}
  <LoadingSpinner text="Loading applications…" />
{:else if !s.workflow}
  <p class="text-sm text-slate-400">Online applications are not set up yet. An administrator opening this tab sets them up.</p>
{:else}
  <div class="space-y-3">
    <p class="text-sm text-slate-400">
      Applications for a bay made on the public form —
      <a href="/parking/apply" target="_blank" rel="noopener" class="underline">/parking/apply ↗</a>.
      Its steps are set in Admin → Workflows.
    </p>
    <ErrorDisplay message={error || s.error || ''} onDismiss={() => (error = '')} />

    <details class="text-sm" bind:open={showProcess}>
      <summary class="cursor-pointer text-slate-300">Show the process</summary>
      <div class="mt-2"><WorkflowDiagram steps={s.steps} moves={s.moves} stats={processStats} title="Parking application — the process" /></div>
    </details>

    <div class="flex flex-wrap gap-2 items-center">
      <input bind:value={q} placeholder="Search reference, name, email…" aria-label="Search applications"
        class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-64" />
      <select bind:value={show} aria-label="Which applications" class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
        <option value="open">Open</option>
        <option value="mine">Open — with me</option>
        <option value="finished">Finished</option>
        <option value="">All</option>
      </select>
      <span class="text-xs text-slate-500">{rows.length} of {s.requests.length}</span>
    </div>

    <div class="grid gap-4 {selected ? 'lg:grid-cols-[1fr_26rem]' : ''}">
      <div class="min-w-0 overflow-x-auto">
        {#if rows.length === 0}
          <p class="text-sm text-slate-500 italic py-4">{s.requests.length ? 'No applications match.' : 'No applications yet.'}</p>
        {:else}
          <table class="w-full text-sm" data-testid="application-list">
            <thead><tr class="border-b border-slate-700 text-left text-xs text-slate-400">
              <th class="py-2 pr-3 font-medium">Received</th><th class="py-2 pr-3 font-medium">Reference</th>
              <th class="py-2 pr-3 font-medium">Applicant</th><th class="py-2 pr-3 font-medium">Wants</th>
              <th class="py-2 pr-3 font-medium">Step</th><th class="py-2 pr-3 font-medium">With</th><th class="py-2 font-medium">Due</th></tr></thead>
            <tbody>
              {#each rows as r (r.id)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <tr class="border-b border-slate-800 cursor-pointer hover:bg-slate-800/60 {r.id === selectedId ? 'bg-slate-800' : ''}"
                  on:click={() => (selectedId = r.id)}>
                  <td class="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(r.received_at)}</td>
                  <td class="py-2 pr-3 font-mono text-slate-200">{r.reference}</td>
                  <td class="py-2 pr-3 text-slate-200">{r.display_name}{#if r.company_name}<span class="block text-xs text-slate-500">{r.company_name}</span>{/if}</td>
                  <td class="py-2 pr-3 text-slate-300">{sizeLabel(r.wanted_size)}</td>
                  <td class="py-2 pr-3 text-xs text-slate-300">{stepOf(r.id)?.name ?? '—'}</td>
                  <td class="py-2 pr-3 text-xs text-slate-300" data-testid="application-with">{isFinished(stepOf(r.id)?.kind ?? '') ? '' : withName(itemFor(r.id)?.assigned_to)}</td>
                  <td class="py-2 text-xs whitespace-nowrap {BAND_CLS[deadlineBand(dueOf(r.id)) ?? 'ok']}" data-testid="application-due">
                    {dueOf(r.id) ? deadlineWords(dueOf(r.id)) : ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </div>

      {#if selected}
        <aside class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3 text-sm" data-testid="application-panel">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-mono text-white">{selected.reference}</p>
              <p class="text-xs text-slate-400">Received {fmtDateTime(selected.received_at)}</p>
            </div>
            <Button variant="tertiary" size="xs" on:click={() => (selectedId = null)}>Close</Button>
          </div>
          <WorkflowItemControls item={itemFor(selected.id)} workflow={s.workflow} steps={s.steps} moves={s.moves} fields={s.fields}
            reference={selected.reference} isAdmin={$permissions.isAdmin} {canEdit} {me} {assignees} {nameById}
            {onMove} {onAssign} {onFieldsSaved} {audit} {record}>
            <dl class="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
              <dt class="text-slate-400">Name</dt><dd class="text-slate-100">{selected.display_name}</dd>
              {#if selected.company_name}<dt class="text-slate-400">Company</dt><dd class="text-slate-100">{selected.company_name}</dd>{/if}
              <dt class="text-slate-400">Kind</dt><dd class="text-slate-100">{HOLDER_TYPE_LABEL[selected.holder_type] ?? selected.holder_type}</dd>
              <dt class="text-slate-400">Email</dt><dd class="text-slate-100 break-all">{selected.email}</dd>
              {#if selected.phone}<dt class="text-slate-400">Phone</dt><dd class="text-slate-100">{selected.phone}</dd>{/if}
              {#if selected.correspondence_address}<dt class="text-slate-400">Address</dt><dd class="text-slate-100 whitespace-pre-line">{selected.correspondence_address}</dd>{/if}
              <dt class="text-slate-400">Wants</dt><dd class="text-slate-100">{sizeLabel(selected.wanted_size)}</dd>
              {#if selected.notes}<dt class="text-slate-400">Notes</dt><dd class="text-slate-100 whitespace-pre-line">{selected.notes}</dd>{/if}
            </dl>
            <details class="text-xs text-slate-400">
              <summary class="cursor-pointer">Privacy notice they agreed to</summary>
              <p class="mt-1 whitespace-pre-line">{selected.privacy_notice_text}</p>
            </details>
            {#if selected.application_id}
              <div class="rounded-md border border-slate-700 p-2" data-testid="linked-place">
                <p class="text-slate-400 text-xs">On the waiting list</p>
                <p class="text-slate-100">{standingOf(selected.application_id)}</p>
                {#if placeOf(selected.application_id)}
                  <Button variant="tertiary" size="xs" on:click={() => dispatch('showWaitingList', selected.application_id)}>Open this place on the waiting list →</Button>
                {/if}
              </div>
            {/if}
          </WorkflowItemControls>
        </aside>
      {/if}
    </div>
  </div>
{/if}
