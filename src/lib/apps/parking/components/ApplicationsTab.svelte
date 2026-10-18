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
  import { movesFrom, moveRefusal, orderedSteps, isFinished, isMoveEvent, STEP_KIND_LABEL } from '#lib/workflow/workflowModel.js';
  import { actionLabel } from '#lib/workflow/workflowActions.js';
  import { deadlineBand, deadlineWords, describeDeadline } from '#lib/workflow/workflowDeadlines.js';
  import { workflowStats } from '#lib/workflow/workflowStats.js';
  import { listEvents } from '#lib/workflow/workflowApi.js';
  import WorkflowDiagram from '#lib/workflow/WorkflowDiagram.svelte';
  import { today } from '#lib/utils/dates.js';
  import { HOLDER_TYPE_LABEL } from '../utils/agreementModel.js';
  import { ANY_SIZE } from '../utils/waitingListModel.js';
  import { fmtDateTime, fmtDate } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { itemRecordModel, assignWords } from '#lib/workflow/itemRecord.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { auth } from '#lib/stores/auth.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { downloadBlob } from '#lib/utils/download.js';
  import { fmtGenerated } from '#lib/utils/dates.js';

  export let canEdit = false;
  const dispatch = createEventDispatcher();

  let ready = false;
  let error = '';
  let show = 'open';           // 'open' | 'finished' | ''
  let q = '';
  /** @type {string|null} */
  let selectedId = null;
  let history = /** @type {any[]} */ ([]);
  let historyFor = null;
  let note = '';
  let moving = '';
  let done = '';

  // Who an application is with (migration 250): the people it may be given to,
  // and everyone's names for showing who it is with (a person may since have
  // lost the grant and still be named on an application).
  /** @type {Array<{ id: string, full_name: string|null }>} */
  let assignees = [];

  onMount(async () => {
    try {
      await requestStore.load();
      if (!$requestStore.workflow && $permissions.isAdmin) await requestStore.setUpWorkflow();
      const [list] = await Promise.all([requestStore.assignees(), profilesStore.load()]);
      assignees = list;
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
  $: selectedStep = selected ? stepOf(selected.id) : null;
  $: moves = selectedStep ? movesFrom(s.moves, selectedStep.key, { isAdmin: $permissions.isAdmin, canEdit }) : [];
  $: nameOf = (/** @type {string} */ key) => stepByKey.get(key)?.name ?? key;
  // The move conditions (migration 251), said before anything is pressed: who
  // made the last MOVE (four-eyes), and who it is with (assignee only).
  $: lastMoverId = [...history].reverse().find(isMoveEvent)?.by ?? null;
  $: refusalOf = (/** @type {any} */ m) => moveRefusal(m, {
    userId: me, assignedTo: selected ? itemFor(selected.id)?.assigned_to ?? null : null, lastMoverId });
  $: refusals = [...new Set(moves.map(refusalOf).filter(Boolean))];
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

  // History is read when an application is opened (keyed on its id, never the object).
  $: if (selected && selected.id !== historyFor) { historyFor = selected.id; note = ''; done = ''; loadHistory(selected.id); }
  async function loadHistory(/** @type {string} */ id) {
    const item = itemFor(id);
    history = [];
    if (!item) return;
    try { history = await requestStore.history(item.id); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read its history.'); }
  }

  async function makeMove(/** @type {any} */ m) {
    const request = selected;                         // captured before the await
    if (!request) return;
    moving = m.to_key; error = ''; done = '';
    try {
      const result = await requestStore.move(request, m.to_key, note);
      if (result?.action) await parkingStore.load();  // the waiting list changed
      done = `${request.reference}: ${m.label} — now ${stepByKey.get(m.to_key)?.name ?? m.to_key}.`;
      note = '';
      loadHistory(request.id);                        // re-read it, keeping the message above
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'That could not be done.');
    } finally { moving = ''; }
  }

  let assigning = false;
  let assignNonce = 0;                                // redraws the choice when a change is refused
  /** @param {string|null} userId */
  async function assignTo(userId) {
    const request = selected;                         // captured before the await
    if (!request) return;
    assigning = true; error = ''; done = '';
    try {
      const result = await requestStore.assign(request, userId);
      if (result?.changed) done = `${request.reference}: ${userId ? `now with ${withName(userId)}` : 'now with no one'}.`;
      loadHistory(request.id);                        // re-read it, keeping the message above
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'That could not be done.');
      assignNonce += 1;                               // put the choice back to what it is
    } finally { assigning = false; }
  }

  const sizeLabel = (/** @type {string} */ v) => (v === ANY_SIZE ? 'Any size' : v);

  // The record of one application — what it is, where it stands, every move
  // and who made it — as a Word file, for the file or to show what was done.
  // Built in the browser from what this panel holds plus the full history.
  let recording = false;
  async function downloadRecord() {
    const request = selected;                         // captured before the await
    const item = request ? itemFor(request.id) : null;
    if (!request || !item || !s.workflow) return;
    recording = true; error = '';
    try {
      const [events] = await Promise.all([requestStore.history(item.id), profilesStore.load()]);
      const list = /** @type {Array<{ id: string, full_name: string|null }>} */ ($profiles.list);
      const people = Object.fromEntries(list.map((p) => [p.id, p.full_name || 'A user with no name set']));
      const model = itemRecordModel({
        workflow: s.workflow, steps: s.steps, item, events, people, todayISO: today(),
        subject: {
          title: `Parking application ${request.reference}`,
          facts: [
            ['Reference', request.reference],
            ['Received', fmtDateTime(request.received_at)],
            ['Name', request.display_name],
            ['Company', request.company_name],
            ['Kind', HOLDER_TYPE_LABEL[request.holder_type] ?? request.holder_type],
            ['Email', request.email],
            ['Phone', request.phone],
            ['Address for letters', request.correspondence_address],
            ['Size wanted', sizeLabel(request.wanted_size)],
            ['Their notes', request.notes],
            ['On the waiting list', request.application_id ? 'Yes' : ''],
          ],
          sections: [{ heading: 'Privacy notice they agreed to', text: request.privacy_notice_text }],
        },
      });
      const { buildItemRecord } = await import('#lib/docx/itemRecordDocx.js');
      const me = list.find((p) => p.id === $auth.user?.id)?.full_name || $auth.user?.email || 'a signed-in user';
      const { bytes, filename } = await buildItemRecord(model, {
        generatedAt: fmtGenerated(), generatedBy: me, filenameStem: `${request.reference}_${today()}`,
      });
      downloadBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
      // The reference only — the file holds personal details, the log does not.
      logAudit('export', 'parking_request', request.id, request.reference,
        { appId: 'parking', eventCategory: 'parking', afterData: { record: request.reference } });
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'Could not make the record.');
    } finally { recording = false; }
  }
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
    {#if done}<p class="text-sm text-green-400" role="status">{done}</p>{/if}

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
            <div class="flex gap-1">
              <Button variant="tertiary" size="xs" loading={recording} disabled={recording || !itemFor(selected.id)}
                title="A Word record of this application and every move made on it" on:click={downloadRecord}>⬇ Record</Button>
              <Button variant="tertiary" size="xs" on:click={() => (selectedId = null)}>Close</Button>
            </div>
          </div>
          <p><span class="text-slate-400">Step:</span> <span class="text-white">{selectedStep?.name ?? '—'}</span>
            {#if selectedStep}<span class="text-xs text-slate-500">· {STEP_KIND_LABEL[selectedStep.kind]}</span>{/if}</p>
          {#if dueOf(selected.id)}
            <p class="{BAND_CLS[deadlineBand(dueOf(selected.id)) ?? 'ok']}">{deadlineWords(dueOf(selected.id))} — {fmtDate(dueOf(selected.id))}
              <span class="block text-xs text-slate-500">{describeDeadline(selectedStep ?? {})}.</span></p>
          {/if}

          {#if selectedStep && !isFinished(selectedStep.kind)}
            <div class="flex items-center gap-2" data-testid="application-assignee">
              <span class="text-slate-400">With:</span>
              {#if canEdit}
                {#key assignNonce}
                <select class="px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200"
                  aria-label="Who it is with" value={itemFor(selected.id)?.assigned_to ?? ''} disabled={assigning}
                  on:change={(e) => assignTo(/** @type {HTMLSelectElement} */ (e.currentTarget).value || null)}>
                  <option value="">No one</option>
                  {#each assignees as p (p.id)}<option value={p.id}>{p.full_name || 'A user with no name set'}{p.id === me ? ' (me)' : ''}</option>{/each}
                  {#if itemFor(selected.id)?.assigned_to && !assignees.some((p) => p.id === itemFor(selected.id)?.assigned_to)}
                    <option value={itemFor(selected.id)?.assigned_to}>{withName(itemFor(selected.id)?.assigned_to)} (can no longer work these)</option>
                  {/if}
                </select>
                {/key}
                {#if me && itemFor(selected.id)?.assigned_to !== me && assignees.some((p) => p.id === me)}
                  <Button variant="tertiary" size="xs" disabled={assigning} on:click={() => assignTo(me)}>Take it</Button>
                {/if}
              {:else}
                <span class="text-slate-100">{withName(itemFor(selected.id)?.assigned_to) || 'No one'}</span>
              {/if}
            </div>
          {/if}

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
            <p class="text-green-300">On the waiting list.
              <Button variant="tertiary" size="xs" on:click={() => dispatch('showWaitingList')}>Open the waiting list</Button></p>
          {/if}

          {#if moves.length}
            <div class="space-y-2 border-t border-slate-700 pt-3">
              <label class="block">
                <span class="text-xs text-slate-400">Note {moves.some((m) => m.note_required) ? '(needed for some)' : '(optional)'}</span>
                <textarea bind:value={note} rows="2" class="mt-1 w-full rounded bg-slate-900 border border-slate-600 p-2 text-sm"></textarea>
              </label>
              <div class="flex flex-wrap gap-2">
                {#each moves as m (m.to_key)}
                  <Button size="small" variant={stepByKey.get(m.to_key)?.kind === 'declined' ? 'danger' : stepByKey.get(m.to_key)?.kind === 'done' ? 'primary' : 'secondary'}
                    disabled={!!moving || !!refusalOf(m) || (m.note_required && !note.trim())} loading={moving === m.to_key}
                    title={refusalOf(m) || (m.action ? actionLabel(m.action) : '')} on:click={() => makeMove(m)}>{m.label}</Button>
                {/each}
              </div>
              {#each refusals as why (why)}
                <p class="text-xs text-amber-300" data-testid="move-refusal">{why}</p>
              {/each}
            </div>
          {:else if selectedStep && !isFinished(selectedStep.kind)}
            <p class="text-xs text-slate-500">You cannot move this one on.</p>
          {/if}

          {#if history.length}
            <div class="border-t border-slate-700 pt-2">
              <p class="text-xs text-slate-400 mb-1">History</p>
              <ul class="space-y-1 text-xs" data-testid="application-history">
                {#each history as e (e.id)}
                  <li><span class="text-slate-400">{fmtDateTime(e.at)}</span> ·
                    {#if isMoveEvent(e)}{e.from_key ? `${nameOf(e.from_key)} → ` : ''}{nameOf(e.to_key)}{:else}{assignWords(e.assigned_to, nameById)}{/if}
                    {#if e.by}<span class="text-slate-500"> · {withName(e.by)}</span>{/if}
                    {#if e.note}<span class="block text-slate-300 whitespace-pre-line">{e.note}</span>{/if}</li>
                {/each}
              </ul>
            </div>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
{/if}
