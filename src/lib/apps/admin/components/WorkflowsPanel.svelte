<!-- src/lib/apps/admin/components/WorkflowsPanel.svelte -->
<!-- Admin → Workflows (migration 247, 2026-10-17): the steps an
     item goes through and the moves between them, for any app that uses the
     shared workflow manager (#lib/workflow/). The first user is Parking's
     online application. A workflow appears here once its app has set it up
     (the app saves its shipped default the first time an admin opens it).
     Saved whole, through workflow_save(), which makes the same checks as
     workflowProblem() below and refuses to remove a step something is in. -->
<script>
  import { onMount } from 'svelte';
  import { listWorkflows, loadWorkflow, saveWorkflow, listChanges, listEvents, listTimerRuns, runTimers, setPublicStatus } from '#lib/workflow/workflowApi.js';
  import { PUBLIC_STATUS_APPS, publicStageName } from '#lib/workflow/workflowModel.js';
  import { workflowStats, simulateDeadlines } from '#lib/workflow/workflowStats.js';
  import WorkflowDiagram from '#lib/workflow/WorkflowDiagram.svelte';
  import { today } from '#lib/utils/dates.js';
  import { definitionOf, definitionChanged, workflowDiff } from '#lib/workflow/workflowModel.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { fmtDateTime } from '#lib/utils/dates.js';
  import Modal from '#lib/components/common/Modal.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormTextarea from '#lib/components/common/FormTextarea.svelte';
  import { workflowProblem, stepKeyFor, STEP_KINDS, MOVE_WHO, FIELD_TYPES, orderedSteps } from '#lib/workflow/workflowModel.js';
  import { actionsFor } from '#lib/workflow/workflowActions.js';
  import { contractFor } from '#lib/workflow/workflowContracts.js';
  import { shippedWorkflowFor } from '#lib/workflow/shippedWorkflows.js';
  import { DEADLINE_BASES, DEADLINE_FROM, describeDeadline } from '#lib/workflow/workflowDeadlines.js';
  import { listNonWorkingDays, ensureNonWorkingDays, addNonWorkingDay, removeNonWorkingDay } from '#lib/workflow/nonWorkingDays.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import { isFinished } from '#lib/workflow/workflowModel.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';
  import { workflowFile, workflowFileName, readWorkflowFile, importTarget } from '#lib/workflow/workflowTransfer.js';
  import { downloadBlob } from '#lib/utils/download.js';

  let ready = false;
  let error = '';
  let saved = '';
  let saving = false;
  /** @type {any[]} */
  let workflows = [];
  let chosenKey = '';
  /** @type {any} */
  let current = null;
  /** @type {any[]} */
  let steps = [];
  /** @type {any[]} */
  let moves = [];
  // The process's fields (migration 253; any process since 254): each with
  // `optionsText`, the choices one per line, while it is being edited.
  /** @type {any[]} */
  let fields = [];
  let loadedKey = '';
  // The review mark (migration 249): a workflow that must not change without a
  // full review. Changing a marked one asks who reviewed it and against what.
  let reviewRequired = false;
  let reviewReason = '';
  /** @type {any} */
  let loadedDef = null;
  /** @type {any[]} */
  let changes = [];
  let askReview = false;
  // The diagram's figures: read only when asked for (they read every move made).
  let showUse = false;
  /** @type {any} */
  let usage = null;
  let usageFor = '';
  $: if (showUse && current && usageFor !== current.id) { usageFor = current.id; readUsage(current.id); }
  async function readUsage(/** @type {string} */ id) {
    try { usage = await listEvents(id); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read how the workflow is being used.'); }
  }
  $: stats = showUse && usage ? workflowStats({ steps, moves, items: usage.items, events: usage.events, today: today() }) : null;
  // "What if": the deadlines in the editor laid over the items as they stand (roadmap §6).
  $: deadlinesEdited = !!loadedDef && JSON.stringify(steps.map((x) => [x.key, x.deadline_days === '' ? null : Number(x.deadline_days ?? NaN) || null, x.deadline_basis, x.deadline_from]))
    !== JSON.stringify(loadedDef.steps.map((/** @type {any} */ x) => [x.key, x.deadline_days, x.deadline_basis, x.deadline_from]));
  $: simulated = stats && current ? simulateDeadlines({ steps, items: usage.items, events: usage.events, today: today(),
    nonWorking: offDays.map((d) => d.day), subjectDue: !!contractFor(current.app_id)?.subjectDue }) : null;
  let review = { reviewedBy: '', reviewedAgainst: '', note: '' };

  /** @type {{ day: string, name: string }[]} */
  let offDays = [];
  let newDay = '';
  let newDayName = '';
  let dayError = '';

  async function readOffDays() {
    try { offDays = await listNonWorkingDays(); }
    catch (/** @type {any} */ err) { dayError = errMessage(err, 'Could not read the non-working days.'); }
  }
  async function addDay() {
    dayError = '';
    if (!newDay || !newDayName.trim()) { dayError = 'Give the date and what it is.'; return; }
    try { await addNonWorkingDay(newDay, newDayName); newDay = ''; newDayName = ''; await readOffDays(); }
    catch (/** @type {any} */ err) { dayError = errMessage(err, 'That day could not be added.'); }
  }
  async function removeDay(/** @type {string} */ day) {
    dayError = '';
    try { await removeNonWorkingDay(day); await readOffDays(); }
    catch (/** @type {any} */ err) { dayError = errMessage(err, 'That day could not be removed.'); }
  }

  // ── Timers (migration 259) ──
  /** @type {any[]} */
  let timerRuns = [];
  let runningTimers = false;
  async function readTimerRuns() {
    try { timerRuns = await listTimerRuns(5); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the timer runs.'); }
  }
  async function runTimersNow() {
    runningTimers = true; error = '';
    try {
      const r = await runTimers();
      saved = `Timers run: ${r?.moved ?? 0} moved${r?.failed ? `, ${r.failed} could not be` : ''}.`;
      logAudit('update', 'workflow', null, 'Timers run by hand', { appId: 'admin', eventCategory: 'admin', afterData: { moved: r?.moved ?? 0, failed: r?.failed ?? 0 } });
      await readTimerRuns();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not run the timers.'); }
    finally { runningTimers = false; }
  }

  onMount(async () => {
    readTimerRuns();
    profilesStore.load().catch(() => { /* names fall back to — */ });
    try {
      // The shipped bank holidays, when the list is empty (the seed rule).
      await ensureNonWorkingDays().catch((/** @type {any} */ err) => { dayError = errMessage(err, 'The bank holidays could not be added.'); });
      await readOffDays();
      workflows = await listWorkflows();
      if (workflows.length) chosenKey = workflows[0].key;
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the workflows.'); }
    finally { ready = true; }
  });

  // Read the chosen workflow once per choice (keyed on the string, never an object).
  $: if (chosenKey && chosenKey !== loadedKey) { loadedKey = chosenKey; open(chosenKey); }
  async function open(/** @type {string} */ key) {
    error = ''; saved = '';
    try {
      const wf = await loadWorkflow(key);
      current = wf?.workflow ?? null;
      steps = orderedSteps(wf?.steps ?? []).map((s) => ({ ...s, deadline_days: s.deadline_days ?? '',
        deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered', isNew: false }));
      moves = (wf?.moves ?? []).map((m) => ({ ...m, required_fields: [...(m.required_fields ?? [])] }));
      fields = (wf?.fields ?? []).map((f) => ({ ...f, optionsText: (f.options ?? []).join('\n'), help: f.help ?? '', isNew: false }));
      reviewRequired = !!current?.review_required;
      reviewReason = current?.review_reason ?? '';
      loadedDef = current ? definitionOf({ name: current.name, description: current.description,
        reviewRequired, reviewReason, steps, moves, fields: fieldsOut(fields) }) : null;
      changes = current ? await listChanges(current.id) : [];
      if (pendingImport && pendingImport.key === key) { const f = pendingImport; pendingImport = null; applyImport(f.definition); }
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read that workflow.'); }
  }

  // ── The public status page (migration 261): off unless switched on ──
  $: publicAllowed = !!current && PUBLIC_STATUS_APPS.includes(current.app_id);
  let publicReview = { reviewedBy: '', reviewedAgainst: '', note: '' };
  let switchingPublic = false;
  async function switchPublic(/** @type {boolean} */ on) {
    const wf = current;
    if (!wf) return;
    switchingPublic = true; error = ''; saved = '';
    try {
      await setPublicStatus(wf.key, on, wf.review_required ? publicReview : null);
      logAudit('update', 'workflow', wf.id, wf.name, { appId: 'admin', eventCategory: 'admin', afterData: { public_status: on } });
      saved = on ? 'Public status page switched on.' : 'Public status page switched off.';
      publicReview = { reviewedBy: '', reviewedAgainst: '', note: '' };
      workflows = await listWorkflows();
      loadedKey = '';                         // read it back
    } catch (/** @type {any} */ err) { error = errMessage(err, 'That could not be changed.'); }
    finally { switchingPublic = false; }
  }
  $: publicReviewMissing = !!current?.review_required && (!publicReview.reviewedBy.trim() || !publicReview.reviewedAgainst.trim());

  // ── Export and import (roadmap §6): a workflow as one file ──
  /** A file waiting for its workflow to be read into the editor. @type {any} */
  let pendingImport = null;
  /** @type {HTMLInputElement|null} */
  let importInput = null;
  /** The saved version, as a file — never edits not yet saved. */
  function exportCurrent() {
    if (!current || !loadedDef) return;
    const file = workflowFile(current, loadedDef, new Date().toISOString());
    downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), workflowFileName(current.key, today()));
    logAudit('export', 'workflow', current.id, current.name, { appId: 'admin', eventCategory: 'admin' });
  }
  /** Put a file's definition in the editor: it is checked and saved like any change. @param {any} def */
  function applyImport(def) {
    const had = new Set(steps.map((s) => s.key));
    const hadFields = new Set(fields.map((f) => f.key));
    steps = orderedSteps(def.steps.map((/** @type {any} */ s, /** @type {number} */ i) => ({ ...s, position: i + 1 })))
      .map((s) => ({ ...s, public_name: s.public_name ?? '', deadline_days: s.deadline_days ?? '',
        deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered', isNew: !had.has(s.key) }));
    moves = def.moves.map((/** @type {any} */ m) => ({ note_required: false, admin_only: false, action: '', who: 'anyone', four_eyes: false,
      timer_days: null, timer_basis: 'calendar', ...m, action: m.action ?? '', required_fields: [...(m.required_fields ?? [])] }));
    fields = (def.fields ?? []).map((/** @type {any} */ f) => ({ ...f, optionsText: (f.options ?? []).join('\n'), help: f.help ?? '',
      isNew: !hadFields.has(f.key) }));
    reviewRequired = !!def.review_required;
    reviewReason = def.review_reason ?? '';
    saved = 'The file’s steps, moves and fields are in the editor — look them over, then save.';
  }
  async function importFile(/** @type {Event} */ e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    error = ''; saved = '';
    try {
      const file = readWorkflowFile(await picked.text());
      const where = importTarget(file, workflows);
      if ('refused' in where) { error = where.refused; return; }
      if ('newCases' in where) {
        const d = file.definition;
        const id = await saveWorkflow({ key: file.key, name: d.name, appId: 'cases', description: d.description ?? null,
          steps: d.steps, moves: d.moves, fields: d.fields, reviewRequired: !!d.review_required, reviewReason: d.review_reason ?? null });
        logAudit('create', 'workflow', id, d.name, { appId: 'admin', eventCategory: 'admin', afterData: { key: file.key, app: 'cases', from: 'file' } });
        workflows = await listWorkflows();
        chosenKey = file.key;
        saved = `“${d.name}” set up from the file.`;
        return;
      }
      if (where.into === loadedKey && current) applyImport(file.definition);
      else { pendingImport = file; chosenKey = where.into; }
    } catch (/** @type {any} */ err) { error = errMessage(err, 'That file could not be imported.'); }
  }

  $: actions = current ? actionsFor(current.app_id) : [];
  // Only a Cases process is opened with a form, so only its fields can be needed to open one.
  $: isCases = current?.app_id === 'cases';
  // What the owning app needs the workflow to keep (migration 254): shown, and
  // the fixed kinds cannot be changed here; the save checks the rest.
  $: contract = current ? contractFor(current.app_id) : null;
  $: fixedKind = (/** @type {any} */ st) => contract?.steps?.[st.key] ?? null;
  // The shipped version, when there is one: how this building's differs.
  $: shipped = current ? shippedWorkflowFor(current.key) : null;
  $: shippedDiff = shipped && loadedDef
    ? workflowDiff(definitionOf({ name: shipped.name, description: shipped.description ?? null, reviewRequired: !!shipped.reviewRequired,
        reviewReason: shipped.reviewReason ?? null, steps: shipped.steps, moves: shipped.moves, fields: shipped.fields ?? [] }), loadedDef)
      .filter((l) => l !== 'Nothing that is kept changed.')
    : [];
  /** Put the shipped steps and moves in the editor — saved, and reviewed if marked, like any change. */
  function loadShipped() {
    if (!shipped) return;
    steps = orderedSteps(shipped.steps.map((/** @type {any} */ s, /** @type {number} */ i) => ({ ...s, position: i + 1 })))
      .map((s) => ({ ...s, public_name: s.public_name ?? '', deadline_days: s.deadline_days ?? '',
        deadline_basis: s.deadline_basis ?? 'calendar', deadline_from: s.deadline_from ?? 'entered', isNew: false }));
    moves = shipped.moves.map((/** @type {any} */ m) => ({ note_required: false, admin_only: false, action: '', who: 'anyone', four_eyes: false, timer_days: null, timer_basis: 'calendar',
      ...m, required_fields: [...(m.required_fields ?? [])] }));
    saved = 'The shipped steps and moves are in the editor — look them over, then save.';
  }
  /** The fields as saved: choices from their lines, none on a field that is not a choice. */
  function fieldsOut(/** @type {any[]} */ list) {
    return list.map(({ optionsText, isNew, ...f }) => ({ ...f,
      options: f.type === 'choice' ? String(optionsText ?? '').split('\n').map((o) => o.trim()).filter(Boolean) : [] }));
  }
  $: problem = current
    ? workflowProblem({ steps, moves, appId: current.app_id, fields: fieldsOut(fields) })
      ?? (reviewRequired && !reviewReason.trim() ? 'Say why this workflow needs a full review before it is changed.' : null)
    : null;
  $: changed = !!current && !!loadedDef && definitionChanged(loadedDef,
    definitionOf({ name: current.name, description: current.description, reviewRequired, reviewReason, steps, moves, fields: fieldsOut(fields) }));
  // Marked when it was read: a change needs the review, including taking the mark off.
  $: needsReview = !!current?.review_required && changed;
  $: pendingDiff = askReview && current && loadedDef
    ? workflowDiff(loadedDef, definitionOf({ name: current.name, description: current.description, reviewRequired, reviewReason, steps, moves, fields: fieldsOut(fields) }))
    : [];
  $: nameOf = (/** @type {string|null} */ id) => $profiles.list?.find((p) => p.id === id)?.full_name ?? '—';

  function addStep() {
    const key = stepKeyFor('New step', steps.map((s) => s.key));
    steps = [...steps, { key, name: 'New step', public_name: '', kind: 'open', deadline_days: '',
      deadline_basis: 'calendar', deadline_from: 'entered', isNew: true }];
  }
  function renameNew(/** @type {any} */ st) {
    // A new step's key follows its name until it is saved; a saved step keeps its key.
    if (st.isNew) st.key = stepKeyFor(st.name, steps.filter((x) => x !== st).map((x) => x.key));
    steps = steps;
  }
  function moveStep(/** @type {number} */ i, /** @type {number} */ d) {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    steps = next;
  }
  function removeStep(/** @type {any} */ st) {
    steps = steps.filter((x) => x !== st);
    moves = moves.filter((m) => m.from_key !== st.key && m.to_key !== st.key);
  }
  function addMove() {
    const from = steps[0]?.key ?? '';
    const to = steps.find((s) => s.key !== from)?.key ?? '';
    moves = [...moves, { from_key: from, to_key: to, label: 'New move', note_required: false, admin_only: false, action: '', who: 'anyone', four_eyes: false, timer_days: null, timer_basis: 'calendar' }];
  }
  function removeMove(/** @type {any} */ m) { moves = moves.filter((x) => x !== m); }

  // ── The process's fields (migration 253; any process since 254) ──
  function addField() {
    const key = stepKeyFor('New field', fields.map((f) => f.key));
    fields = [...fields, { key, label: 'New field', type: 'text', optionsText: '', help: '', required_on_create: false, isNew: true }];
  }
  function renameNewField(/** @type {any} */ f) {
    // A new field's key follows its label until it is saved; a saved one keeps its key (items hold values under it).
    if (f.isNew) f.key = stepKeyFor(f.label, fields.filter((x) => x !== f).map((x) => x.key));
    fields = fields;
  }
  function moveField(/** @type {number} */ i, /** @type {number} */ d) {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    fields = next;
  }
  function removeField(/** @type {any} */ f) {
    fields = fields.filter((x) => x !== f);
    moves = moves.map((m) => ({ ...m, required_fields: (m.required_fields ?? []).filter((/** @type {string} */ k) => k !== f.key) }));
  }
  function toggleNeeded(/** @type {any} */ m, /** @type {string} */ key) {
    const has = (m.required_fields ?? []).includes(key);
    m.required_fields = has ? m.required_fields.filter((/** @type {string} */ k) => k !== key) : [...(m.required_fields ?? []), key];
    moves = moves;
  }

  // ── A new Cases process ──
  let newProcessName = '';
  let creating = false;
  async function createProcess() {
    const name = newProcessName.trim();
    if (!name) return;
    creating = true; error = ''; saved = '';
    try {
      const key = stepKeyFor(`case_${name}`, workflows.map((w) => w.key));
      const id = await saveWorkflow({ key, name, appId: 'cases', description: null,
        steps: [{ key: 'open', name: 'Open', kind: 'start' }, { key: 'done', name: 'Done', kind: 'done' }],
        moves: [{ from_key: 'open', to_key: 'done', label: 'Finish' }], fields: [] });
      logAudit('create', 'workflow', id, name, { appId: 'admin', eventCategory: 'admin', afterData: { key, app: 'cases' } });
      workflows = await listWorkflows();
      newProcessName = '';
      chosenKey = key;
      saved = `“${name}” set up — give it its steps, moves and fields, then save.`;
    } catch (/** @type {any} */ err) { error = errMessage(err, 'The process could not be set up.'); }
    finally { creating = false; }
  }

  function save() {
    if (!current || problem) return;
    if (needsReview) { review = { reviewedBy: '', reviewedAgainst: '', note: '' }; askReview = true; return; }
    doSave(null);
  }

  async function doSave(/** @type {any} */ withReview) {
    const wf = current;                       // captured before the await
    saving = true; error = ''; saved = '';
    try {
      await saveWorkflow({ key: wf.key, name: wf.name, appId: wf.app_id, description: wf.description,
        steps: steps.map(({ isNew, ...s }) => s), moves, reviewRequired, reviewReason, review: withReview,
        fields: fieldsOut(fields), expectedUpdatedAt: wf.updated_at });
      askReview = false;
      logAudit('update', 'workflow', wf.id, wf.name, { appId: 'admin', eventCategory: 'admin',
        afterData: { steps: steps.map((s) => s.key), moves: moves.map((m) => `${m.from_key}>${m.to_key}`) } });
      saved = 'Saved.';
      loadedKey = '';                         // read it back
    } catch (/** @type {any} */ err) { error = errMessage(err, 'It could not be saved.'); }
    finally { saving = false; }
  }

  const inputCls = 'px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200';
</script>

<section class="space-y-4" data-testid="workflows-panel">
  <div>
    <h3 class="text-lg text-white">Workflows</h3>
    <p class="text-sm text-slate-400">The steps an item goes through and the moves between them. A workflow
      appears here once its app has set it up. Saved whole; a step that something is in cannot be removed.</p>
  </div>
  <ErrorDisplay message={error} onDismiss={() => (error = '')} />

  {#if !ready}
    <LoadingSpinner text="Loading workflows…" />
  {:else if workflows.length === 0}
    <p class="text-sm text-slate-400">No workflows yet. Parking's online application sets its own up the first time an
      administrator opens Parking → Applications.</p>
  {/if}
  {#if ready}
    <div class="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 p-3" data-testid="new-process">
      <label class="text-sm text-slate-300">New Cases process
        <input class="{inputCls} block w-72 mt-1" bind:value={newProcessName} placeholder="e.g. Building-work change control" aria-label="New process name" /></label>
      <Button variant="secondary" size="small" on:click={createProcess} disabled={creating || !newProcessName.trim()} loading={creating}>+ Set it up</Button>
      <p class="w-full text-xs text-slate-500">A process people work in the Cases app: its own steps, moves, deadlines and fields, with no code.
        ⛔ Cases are for building processes; a person field is a portal user, never a resident.</p>
    </div>
  {/if}
  {#if ready && workflows.length}
    <label class="flex items-center gap-2 text-sm text-slate-300">Workflow
      <select bind:value={chosenKey} class={inputCls}>
        {#each workflows as w (w.key)}<option value={w.key}>{w.name}{w.app_id === 'cases' ? ' (Cases)' : ''}</option>{/each}
      </select>
    </label>
    <div class="flex flex-wrap items-center gap-2" data-testid="workflow-transfer">
      <Button variant="tertiary" size="xs" on:click={exportCurrent} disabled={!current}>⬇ Export as a file</Button>
      <Button variant="tertiary" size="xs" on:click={() => importInput?.click()}>⬆ Import a file…</Button>
      <input type="file" accept="application/json,.json" class="hidden" bind:this={importInput} on:change={importFile}
        aria-label="Workflow file to import" />
      <span class="text-xs text-slate-500">The saved steps, moves and fields — no items, no names. An imported one is put in the editor to look over and save.</span>
    </div>

    {#if current}
      {#if current.description}<p class="text-sm text-slate-400">{current.description}</p>{/if}

      <div class="rounded-lg border p-3 space-y-2 {current.review_required ? 'border-amber-500/60 bg-amber-900/20' : 'border-slate-700'}" data-testid="workflow-review-mark">
        {#if current.review_required}
          <p class="text-sm text-amber-200">⚠ This workflow must not be changed without a full review: {current.review_reason}.
            Saving a change asks who reviewed it and against what.</p>
        {/if}
        <label class="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" bind:checked={reviewRequired} /> Needs a full review before any change
        </label>
        {#if reviewRequired}
          <input class="{inputCls} w-full" bind:value={reviewReason} aria-label="Why it needs a review"
            placeholder="Why — e.g. Statutory process: Building Safety Act 2022 s.93" />
        {/if}
      </div>

      {#if contract}
        <p class="text-xs text-slate-400 rounded border border-slate-700 p-2" data-testid="workflow-contract">🔒 {contract.explains}</p>
      {/if}

      {#if publicAllowed}
        <div class="rounded-lg border p-3 space-y-2 {current.public_status ? 'border-teal-600/60 bg-teal-900/20' : 'border-slate-700'}" data-testid="workflow-public">
          <p class="text-sm text-slate-200 font-semibold">Public status page — {current.public_status ? 'ON' : 'off'}</p>
          <p class="text-xs text-slate-400">
            {#if current.public_status}
              Anyone with an item’s reference and its code can see, at <span class="font-mono">/status</span>, which step it is at and when it was
              received and last changed — nothing else: no name, note, field or deadline. Staff see each item’s code with its controls, to give
              to the person it concerns.
            {:else}
              Switched off: nobody outside the portal can look these up. Switched on, anyone with an item’s reference and its code could see,
              at <span class="font-mono">/status</span>, which step it is at and when it was received and last changed — nothing else.
            {/if}
          </p>
          <p class="text-xs text-slate-400">What they would see at each step (the step’s “name the public sees”, or a word for its kind):
            {#each steps as st, i (st.key)}<span class="text-slate-200">{st.name}</span> → “{publicStageName(st)}”{i < steps.length - 1 ? ' · ' : ''}{/each}</p>
          {#if current.review_required}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input class="{inputCls}" bind:value={publicReview.reviewedBy} placeholder="Reviewed by" aria-label="Public status: reviewed by" />
              <input class="{inputCls}" bind:value={publicReview.reviewedAgainst} placeholder="Reviewed against" aria-label="Public status: reviewed against" />
            </div>
          {/if}
          <Button variant={current.public_status ? 'danger' : 'secondary'} size="small" loading={switchingPublic}
            disabled={switchingPublic || publicReviewMissing || changed}
            on:click={() => switchPublic(!current.public_status)}>
            {current.public_status ? 'Switch the public page off' : 'Switch the public page on'}
          </Button>
          {#if changed}<p class="text-xs text-amber-300">Save or undo the changes in the editor first.</p>{/if}
        </div>
      {/if}
      {#if shippedDiff.length}
        <details class="text-xs text-slate-400 rounded border border-slate-700 p-2" data-testid="workflow-shipped">
          <summary class="cursor-pointer text-slate-300">Differs from the version that ships with the portal ({shippedDiff.length})</summary>
          <ul class="mt-1 list-disc pl-5">{#each shippedDiff as line (line)}<li>{line}</li>{/each}</ul>
          <Button variant="tertiary" size="xs" on:click={loadShipped}>Load the shipped steps and moves</Button>
        </details>
      {/if}

      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-slate-200">Diagram</p>
          <label class="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" bind:checked={showUse} /> Show how it is being used</label>
        </div>
        <WorkflowDiagram {steps} {moves} {stats} title="{current.name} — diagram" />
        {#if stats}<p class="text-xs text-slate-400">{stats.total} in all · {stats.open} open · {stats.overdue} overdue.</p>{/if}
        {#if simulated && deadlinesEdited}
          <p class="text-xs text-amber-200" data-testid="workflow-simulated">With the deadlines as they are in the editor,
            {simulated.overdueThen} of the {simulated.open} open would be overdue today (now {simulated.overdueNow}). Nothing is changed until you save.</p>
        {:else if stats && current && contractFor(current.app_id)?.subjectDue}
          <p class="text-xs text-slate-500">Its items are dated by their own date, not by the steps’ deadlines.</p>
        {/if}
      </div>

      <div class="space-y-2">
        <div class="flex items-center justify-between"><p class="text-sm font-semibold text-slate-200">Steps</p>
          <Button variant="tertiary" size="xs" on:click={addStep}>+ Add a step</Button></div>
        <div class="overflow-x-auto"><table class="w-full text-sm" data-testid="workflow-steps">
          <thead><tr class="text-left text-xs text-slate-400">
            <th class="py-1 pr-2 font-medium">Name (staff see)</th><th class="py-1 pr-2 font-medium">Name the public sees</th>
            <th class="py-1 pr-2 font-medium">Kind</th><th class="py-1 pr-2 font-medium">Deadline</th>
            <th class="py-1 pr-2 font-medium">Key</th><th></th></tr></thead>
          <tbody>
            {#each steps as st, i (st)}
              <tr class="border-t border-slate-800">
                <td class="py-1 pr-2"><input class="{inputCls} w-44" bind:value={st.name} on:input={() => renameNew(st)} aria-label="Step name" /></td>
                <td class="py-1 pr-2"><input class="{inputCls} w-56" bind:value={st.public_name} placeholder="“{publicStageName({ kind: st.kind })}”" aria-label="Name the public sees" /></td>
                <td class="py-1 pr-2"><select class={inputCls} bind:value={st.kind} on:change={() => (steps = steps)} aria-label="Kind"
                  disabled={!!fixedKind(st)} title={fixedKind(st) ? 'Fixed by the app' : ''}>
                  {#each STEP_KINDS as k}<option value={k.value} title={k.explains}>{k.label}</option>{/each}</select></td>
                <td class="py-1 pr-2 whitespace-nowrap">
                  {#if isFinished(st.kind)}<span class="text-xs text-slate-500">—</span>
                  {:else}
                    <input type="number" min="1" max="365" class="{inputCls} w-16" bind:value={st.deadline_days}
                      on:input={() => (steps = steps)} placeholder="none" aria-label="Deadline days" />
                    <select class={inputCls} bind:value={st.deadline_basis} on:change={() => (steps = steps)} aria-label="Deadline counts">
                      {#each DEADLINE_BASES as b}<option value={b.value}>{b.label}</option>{/each}</select>
                    <select class={inputCls} bind:value={st.deadline_from} on:change={() => (steps = steps)} aria-label="Deadline from">
                      {#each DEADLINE_FROM as f}<option value={f.value}>{f.label}</option>{/each}</select>
                  {/if}
                </td>
                <td class="py-1 pr-2 font-mono text-xs text-slate-500">{st.key}</td>
                <td class="py-1 whitespace-nowrap">
                  <Button variant="tertiary" size="xs" on:click={() => moveStep(i, -1)} disabled={i === 0}>↑</Button>
                  <Button variant="tertiary" size="xs" on:click={() => moveStep(i, 1)} disabled={i === steps.length - 1}>↓</Button>
                  <Button variant="danger" size="xs" on:click={() => removeStep(st)}>Remove</Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      </div>

      {#if current}
        <div class="space-y-2">
          <div class="flex items-center justify-between"><p class="text-sm font-semibold text-slate-200">Fields</p>
            <Button variant="tertiary" size="xs" on:click={addField}>+ Add a field</Button></div>
          {#if fields.length === 0}<p class="text-xs text-slate-500">No fields yet. Add what this process needs to record on each item; a move can be made to need one filled.</p>{/if}
          <div class="overflow-x-auto"><table class="w-full text-sm" data-testid="workflow-fields">
            <thead><tr class="text-left text-xs text-slate-400">
              <th class="py-1 pr-2 font-medium">Label</th><th class="py-1 pr-2 font-medium">Type</th>
              <th class="py-1 pr-2 font-medium">Choices (one per line)</th>{#if isCases}<th class="py-1 pr-2 font-medium">Needed to open</th>{/if}
              <th class="py-1 pr-2 font-medium">Help</th><th class="py-1 pr-2 font-medium">Key</th><th></th></tr></thead>
            <tbody>
              {#each fields as f, i (f)}
                <tr class="border-t border-slate-800 align-top">
                  <td class="py-1 pr-2"><input class="{inputCls} w-44" bind:value={f.label} on:input={() => renameNewField(f)} aria-label="Field label" /></td>
                  <td class="py-1 pr-2"><select class={inputCls} bind:value={f.type} on:change={() => (fields = fields)} aria-label="Field type">
                    {#each FIELD_TYPES as t (t.value)}<option value={t.value}>{t.label}</option>{/each}</select></td>
                  <td class="py-1 pr-2">{#if f.type === 'choice'}<textarea class="{inputCls} w-44" rows="2" bind:value={f.optionsText}
                    on:input={() => (fields = fields)} aria-label="Choices"></textarea>{:else}<span class="text-xs text-slate-500">—</span>{/if}</td>
                  {#if isCases}<td class="py-1 pr-2 text-center"><input type="checkbox" bind:checked={f.required_on_create} on:change={() => (fields = fields)} aria-label="Needed to open a case" /></td>{/if}
                  <td class="py-1 pr-2"><input class="{inputCls} w-48" bind:value={f.help} on:input={() => (fields = fields)} placeholder="(optional)" aria-label="Field help" /></td>
                  <td class="py-1 pr-2 font-mono text-xs text-slate-500">{f.key}</td>
                  <td class="py-1 whitespace-nowrap">
                    <Button variant="tertiary" size="xs" on:click={() => moveField(i, -1)} disabled={i === 0}>↑</Button>
                    <Button variant="tertiary" size="xs" on:click={() => moveField(i, 1)} disabled={i === fields.length - 1}>↓</Button>
                    <Button variant="danger" size="xs" on:click={() => removeField(f)}>Remove</Button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table></div>
          <p class="text-xs text-slate-500">Removing a field keeps what cases already hold in it; renaming one keeps its key.</p>
        </div>
      {/if}

      <div class="space-y-2">
        <div class="flex items-center justify-between"><p class="text-sm font-semibold text-slate-200">Moves</p>
          <Button variant="tertiary" size="xs" on:click={addMove}>+ Add a move</Button></div>
        <div class="overflow-x-auto"><table class="w-full text-sm" data-testid="workflow-moves">
          <thead><tr class="text-left text-xs text-slate-400">
            <th class="py-1 pr-2 font-medium">From</th><th class="py-1 pr-2 font-medium">To</th>
            <th class="py-1 pr-2 font-medium">Button</th><th class="py-1 pr-2 font-medium">Note needed</th>
            <th class="py-1 pr-2 font-medium">Admin only</th><th class="py-1 pr-2 font-medium">Who may</th>
            <th class="py-1 pr-2 font-medium" title="Not the person who made the last move">Four-eyes</th>
            <th class="py-1 pr-2 font-medium">Action</th><th class="py-1 pr-2 font-medium">Fields needed</th>
            <th class="py-1 pr-2 font-medium" title="Made by the system, overnight, once an item has been this long in the step">By itself after</th><th></th></tr></thead>
          <tbody>
            {#each moves as m (m)}
              <tr class="border-t border-slate-800">
                <td class="py-1 pr-2"><select class={inputCls} bind:value={m.from_key} on:change={() => (moves = moves)} aria-label="From">
                  {#each steps as st (st.key)}<option value={st.key}>{st.name}</option>{/each}</select></td>
                <td class="py-1 pr-2"><select class={inputCls} bind:value={m.to_key} on:change={() => (moves = moves)} aria-label="To">
                  {#each steps as st (st.key)}<option value={st.key}>{st.name}</option>{/each}</select></td>
                <td class="py-1 pr-2"><input class="{inputCls} w-48" bind:value={m.label} on:input={() => (moves = moves)} aria-label="Button label" /></td>
                <td class="py-1 pr-2 text-center"><input type="checkbox" bind:checked={m.note_required} aria-label="Note needed" /></td>
                <td class="py-1 pr-2 text-center"><input type="checkbox" bind:checked={m.admin_only} aria-label="Admin only" /></td>
                <td class="py-1 pr-2"><select class={inputCls} bind:value={m.who} on:change={() => (moves = moves)} aria-label="Who may make it">
                  {#each MOVE_WHO as w (w.value)}<option value={w.value}>{w.label}</option>{/each}</select></td>
                <td class="py-1 pr-2 text-center"><input type="checkbox" bind:checked={m.four_eyes} on:change={() => (moves = moves)}
                  aria-label="Four-eyes" title="Must be made by someone other than the person who made the last move" /></td>
                <td class="py-1 pr-2"><select class={inputCls} bind:value={m.action} on:change={() => (moves = moves)} aria-label="Action">
                  <option value="">None</option>
                  {#each actions as a (a.key)}<option value={a.key} title={a.explains}>{a.label}</option>{/each}</select></td>
                <td class="py-1 pr-2" data-testid="move-fields-needed">
                  {#each fields as f (f.key)}
                    <label class="flex items-center gap-1 text-xs text-slate-300 whitespace-nowrap">
                      <input type="checkbox" checked={(m.required_fields ?? []).includes(f.key)} on:change={() => toggleNeeded(m, f.key)}
                        aria-label="{m.label} needs {f.label}" /> {f.label}</label>
                  {:else}<span class="text-xs text-slate-500">—</span>{/each}
                </td>
                <!-- Timers (migration 259): the move the system makes, overnight,
                     once an item has sat this long in the step. -->
                <td class="py-1 pr-2 whitespace-nowrap" data-testid="move-timer">
                  <input type="number" min="1" max="365" class="{inputCls} w-16" bind:value={m.timer_days} on:input={() => (moves = moves)}
                    aria-label="{m.label}: made by itself after (days)" placeholder="—" />
                  {#if m.timer_days}
                    <select class={inputCls} bind:value={m.timer_basis} on:change={() => (moves = moves)} aria-label="{m.label}: timer counts">
                      <option value="calendar">days</option><option value="working">working days</option></select>
                  {/if}
                </td>
                <td class="py-1"><Button variant="danger" size="xs" on:click={() => removeMove(m)}>Remove</Button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
        {#if actions.length}
          <ul class="text-xs text-slate-500 list-disc pl-5">
            {#each actions as a (a.key)}<li><span class="text-slate-400">{a.label}:</span> {a.explains}</li>{/each}
          </ul>
        {/if}
      </div>

      {#if steps.some((st) => st.deadline_days)}
        <ul class="text-xs text-slate-400 list-disc pl-5" data-testid="workflow-deadlines">
          {#each steps.filter((st) => st.deadline_days && !isFinished(st.kind)) as st (st)}
            <li><span class="text-slate-300">{st.name}:</span> {describeDeadline({ ...st, deadline_days: Number(st.deadline_days) })}.</li>
          {/each}
        </ul>
        <p class="text-xs text-slate-500">Saving re-dates what is in each step now. Working days skip weekends and the days below.</p>
      {/if}
      {#if problem}<p class="text-sm text-amber-300" role="alert" data-testid="workflow-problem">{problem}</p>{/if}
      {#if saved}<p class="text-sm text-green-400" role="status">{saved}</p>{/if}
      <div class="flex gap-2">
        <Button variant="primary" on:click={save} disabled={!!problem || saving || !changed} loading={saving}>
          {needsReview ? 'Save — record the review…' : 'Save workflow'}</Button>
        <Button variant="secondary" on:click={() => (loadedKey = '')} disabled={saving || !changed}>Undo changes</Button>
      </div>

      {#if changes.length}
        <div class="space-y-2 border-t border-slate-700 pt-3" data-testid="workflow-history">
          <p class="text-sm font-semibold text-slate-200">Changes</p>
          <ul class="space-y-2 text-sm">
            {#each changes as c (c.id)}
              <li class="border-b border-slate-800 pb-2">
                <p class="text-xs text-slate-400">{fmtDateTime(c.changed_at)} · {nameOf(c.changed_by)}</p>
                {#if c.reviewed_by}
                  <p class="text-xs text-amber-200">Reviewed by {c.reviewed_by}, against {c.reviewed_against}{c.review_note ? ` — ${c.review_note}` : ''}</p>
                {/if}
                <ul class="list-disc pl-5 text-slate-300">
                  {#each workflowDiff(c.before, c.after) as line}<li>{line}</li>{/each}
                </ul>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  {/if}

  <div class="space-y-2 border-t border-slate-700 pt-4" data-testid="non-working-days">
    <p class="text-sm font-semibold text-slate-200">Days that are not working days</p>
    <p class="text-xs text-slate-400">A deadline in working days skips weekends and these. The bank holidays for England and Wales
      to 2028 come with the portal; add the next years, or a day the office is closed.</p>
    <ErrorDisplay message={dayError} onDismiss={() => (dayError = '')} />
    <div class="flex flex-wrap items-end gap-2">
      <input type="date" class={inputCls} bind:value={newDay} aria-label="Date" />
      <input class="{inputCls} w-56" bind:value={newDayName} placeholder="e.g. Christmas Day" aria-label="What it is" />
      <Button variant="tertiary" size="xs" on:click={addDay}>+ Add a day</Button>
    </div>
    {#if offDays.length}
      <ul class="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
        {#each offDays as d (d.day)}
          <li class="flex items-center justify-between gap-2 border-b border-slate-800 py-0.5">
            <span><span class="text-slate-300">{fmtDate(d.day)}</span> <span class="text-slate-500">· {d.name}</span></span>
            <Button variant="tertiary" size="xs" on:click={() => removeDay(d.day)}>Remove</Button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-slate-500">None — working days skip only weekends.</p>
    {/if}
  </div>

  <!-- ── Timers (migration 259) ─────────────────────────────────────────────
       A move with "By itself after" is made by the database every night at
       03:15 (UTC) for every item that has sat in its step that long. What
       each run did is kept; it moves items and deletes nothing. -->
  <div class="space-y-2 border-t border-slate-700 pt-4" data-testid="workflow-timers">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-semibold text-slate-200">Timers</p>
      <Button variant="secondary" size="xs" loading={runningTimers} disabled={runningTimers} on:click={runTimersNow}>Run timers now</Button>
    </div>
    <p class="text-xs text-slate-400">A move set to happen <em>by itself after</em> a number of days is made every night, at about
      03:15 (UTC), for each item that has been in its step that long — recorded as “Automatic” with no person's name.
      Nothing is deleted.</p>
    {#if timerRuns.length}
      <ul class="text-xs text-slate-300 space-y-1">
        {#each timerRuns as run (run.id)}
          <li>{fmtDateTime(run.ran_at)} — {run.moved} moved{#if run.failed}, <span class="text-amber-300">{run.failed} could not be:</span>
            {#each run.failures ?? [] as f}<span class="block pl-3 text-amber-200/80">{f.label ?? 'An item'} — {f.move}: {f.reason}</span>{/each}{/if}</li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-slate-500">The timers have not run yet.</p>
    {/if}
  </div>
</section>

<Modal show={askReview} title="Record the review" size="medium" on:close={() => (askReview = false)}>
  <div class="space-y-3" data-testid="workflow-review-form">
    <p class="text-sm text-slate-300">This workflow must not be changed without a full review{current?.review_reason ? ` (${current.review_reason})` : ''}.
      Say who reviewed this change and what it was checked against.</p>
    <ul class="list-disc pl-5 text-sm text-slate-400">
      {#each pendingDiff as line}<li>{line}</li>{/each}
    </ul>
    <FormInput label="Reviewed by" bind:value={review.reviewedBy} placeholder="Name, and role if not on the portal" required />
    <FormInput label="Reviewed against" bind:value={review.reviewedAgainst} placeholder="e.g. Building Safety Act 2022 s.93; the complaints procedure v3" required />
    <FormTextarea label="Note" bind:value={review.note} rows={3} placeholder="Why the change, and anything the review found" />
  </div>
  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" on:click={() => (askReview = false)} disabled={saving}>Cancel</Button>
    <Button variant="primary" loading={saving} disabled={saving || !review.reviewedBy.trim() || !review.reviewedAgainst.trim()}
      on:click={() => doSave(review)}>Save the change</Button>
  </div>
</Modal>
