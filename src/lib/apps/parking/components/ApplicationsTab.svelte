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
  import { movesFrom, orderedSteps, isFinished, STEP_KIND_LABEL } from '#lib/workflow/workflowModel.js';
  import { actionLabel } from '#lib/workflow/workflowActions.js';
  import { deadlineBand, deadlineWords, describeDeadline } from '#lib/workflow/workflowDeadlines.js';
  import { HOLDER_TYPE_LABEL } from '../utils/agreementModel.js';
  import { ANY_SIZE } from '../utils/waitingListModel.js';
  import { fmtDateTime, fmtDate } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';

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

  onMount(async () => {
    try {
      await requestStore.load();
      if (!$requestStore.workflow && $permissions.isAdmin) await requestStore.setUpWorkflow();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the applications.'); }
    finally { ready = true; }
  });

  $: s = $requestStore;
  $: stepByKey = new Map(s.steps.map((st) => [st.key, st]));
  $: itemFor = (/** @type {string} */ id) => s.items.find((i) => i.subject_id === id) ?? null;
  $: stepOf = (/** @type {string} */ id) => stepByKey.get(itemFor(id)?.step_key ?? '') ?? null;
  $: rows = s.requests
    .filter((r) => {
      const k = stepOf(r.id)?.kind ?? '';
      return show === '' || (show === 'open' ? !isFinished(k) : isFinished(k));
    })
    .filter((r) => matchesSearch([r.reference, r.display_name, r.company_name, r.email, r.wanted_size], q));
  $: selected = s.requests.find((r) => r.id === selectedId) ?? null;
  $: selectedStep = selected ? stepOf(selected.id) : null;
  $: moves = selectedStep ? movesFrom(s.moves, selectedStep.key, { isAdmin: $permissions.isAdmin, canEdit }) : [];
  $: nameOf = (/** @type {string} */ key) => stepByKey.get(key)?.name ?? key;
  // An open item's deadline in its step (migration 248); a finished one has none.
  $: dueOf = (/** @type {string} */ id) => {
    const item = itemFor(id);
    return item?.due_on && !isFinished(stepOf(id)?.kind ?? '') ? item.due_on : null;
  };
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
      done = `${request.reference}: ${m.label}.`;
      note = '';
      historyFor = null;                              // re-read the history
    } catch (/** @type {any} */ err) {
      error = errMessage(err, 'That could not be done.');
    } finally { moving = ''; }
  }

  const sizeLabel = (/** @type {string} */ v) => (v === ANY_SIZE ? 'Any size' : v);
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

    <div class="flex flex-wrap gap-2 items-center">
      <input bind:value={q} placeholder="Search reference, name, email…" aria-label="Search applications"
        class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-64" />
      <select bind:value={show} aria-label="Which applications" class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
        <option value="open">Open</option>
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
              <th class="py-2 pr-3 font-medium">Step</th><th class="py-2 font-medium">Due</th></tr></thead>
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
          <p><span class="text-slate-400">Step:</span> <span class="text-white">{selectedStep?.name ?? '—'}</span>
            {#if selectedStep}<span class="text-xs text-slate-500">· {STEP_KIND_LABEL[selectedStep.kind]}</span>{/if}</p>
          {#if dueOf(selected.id)}
            <p class="{BAND_CLS[deadlineBand(dueOf(selected.id)) ?? 'ok']}">{deadlineWords(dueOf(selected.id))} — {fmtDate(dueOf(selected.id))}
              <span class="block text-xs text-slate-500">{describeDeadline(selectedStep ?? {})}.</span></p>
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
                    disabled={!!moving || (m.note_required && !note.trim())} loading={moving === m.to_key}
                    title={m.action ? actionLabel(m.action) : ''} on:click={() => makeMove(m)}>{m.label}</Button>
                {/each}
              </div>
            </div>
          {:else if selectedStep && !isFinished(selectedStep.kind)}
            <p class="text-xs text-slate-500">You cannot move this one on.</p>
          {/if}

          {#if history.length}
            <div class="border-t border-slate-700 pt-2">
              <p class="text-xs text-slate-400 mb-1">History</p>
              <ul class="space-y-1 text-xs" data-testid="application-history">
                {#each history as e (e.id)}
                  <li><span class="text-slate-400">{fmtDateTime(e.at)}</span> · {e.from_key ? `${nameOf(e.from_key)} → ` : ''}{nameOf(e.to_key)}
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
