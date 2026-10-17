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
  import { listWorkflows, loadWorkflow, saveWorkflow } from '#lib/workflow/workflowApi.js';
  import { workflowProblem, stepKeyFor, STEP_KINDS, orderedSteps } from '#lib/workflow/workflowModel.js';
  import { actionsFor } from '#lib/workflow/workflowActions.js';
  import { DEADLINE_BASES, DEADLINE_FROM, describeDeadline } from '#lib/workflow/workflowDeadlines.js';
  import { listNonWorkingDays, ensureNonWorkingDays, addNonWorkingDay, removeNonWorkingDay } from '#lib/workflow/nonWorkingDays.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import { isFinished } from '#lib/workflow/workflowModel.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import Button from '#lib/components/common/Button.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '#lib/components/common/LoadingSpinner.svelte';

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
  let loadedKey = '';

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

  onMount(async () => {
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
      moves = (wf?.moves ?? []).map((m) => ({ ...m }));
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read that workflow.'); }
  }

  $: actions = current ? actionsFor(current.app_id) : [];
  $: problem = current ? workflowProblem({ steps, moves, appId: current.app_id }) : null;

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
    moves = [...moves, { from_key: from, to_key: to, label: 'New move', note_required: false, admin_only: false, action: '' }];
  }
  function removeMove(/** @type {any} */ m) { moves = moves.filter((x) => x !== m); }

  async function save() {
    if (!current || problem) return;
    const wf = current;                       // captured before the await
    saving = true; error = ''; saved = '';
    try {
      await saveWorkflow({ key: wf.key, name: wf.name, appId: wf.app_id, description: wf.description,
        steps: steps.map(({ isNew, ...s }) => s), moves });
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
  {:else}
    <label class="flex items-center gap-2 text-sm text-slate-300">Workflow
      <select bind:value={chosenKey} class={inputCls}>
        {#each workflows as w (w.key)}<option value={w.key}>{w.name}</option>{/each}
      </select>
    </label>

    {#if current}
      {#if current.description}<p class="text-sm text-slate-400">{current.description}</p>{/if}

      <div class="space-y-2">
        <div class="flex items-center justify-between"><p class="text-sm font-semibold text-slate-200">Steps</p>
          <Button variant="tertiary" size="xs" on:click={addStep}>+ Add a step</Button></div>
        <div class="overflow-x-auto"><table class="w-full text-sm" data-testid="workflow-steps">
          <thead><tr class="text-left text-xs text-slate-400">
            <th class="py-1 pr-2 font-medium">Name (staff see)</th><th class="py-1 pr-2 font-medium">Name the applicant sees</th>
            <th class="py-1 pr-2 font-medium">Kind</th><th class="py-1 pr-2 font-medium">Deadline</th>
            <th class="py-1 pr-2 font-medium">Key</th><th></th></tr></thead>
          <tbody>
            {#each steps as st, i (st)}
              <tr class="border-t border-slate-800">
                <td class="py-1 pr-2"><input class="{inputCls} w-44" bind:value={st.name} on:input={() => renameNew(st)} aria-label="Step name" /></td>
                <td class="py-1 pr-2"><input class="{inputCls} w-56" bind:value={st.public_name} placeholder="(same as staff)" aria-label="Name the applicant sees" /></td>
                <td class="py-1 pr-2"><select class={inputCls} bind:value={st.kind} on:change={() => (steps = steps)} aria-label="Kind">
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

      <div class="space-y-2">
        <div class="flex items-center justify-between"><p class="text-sm font-semibold text-slate-200">Moves</p>
          <Button variant="tertiary" size="xs" on:click={addMove}>+ Add a move</Button></div>
        <div class="overflow-x-auto"><table class="w-full text-sm" data-testid="workflow-moves">
          <thead><tr class="text-left text-xs text-slate-400">
            <th class="py-1 pr-2 font-medium">From</th><th class="py-1 pr-2 font-medium">To</th>
            <th class="py-1 pr-2 font-medium">Button</th><th class="py-1 pr-2 font-medium">Note needed</th>
            <th class="py-1 pr-2 font-medium">Admin only</th><th class="py-1 pr-2 font-medium">Action</th><th></th></tr></thead>
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
                <td class="py-1 pr-2"><select class={inputCls} bind:value={m.action} on:change={() => (moves = moves)} aria-label="Action">
                  <option value="">None</option>
                  {#each actions as a (a.key)}<option value={a.key} title={a.explains}>{a.label}</option>{/each}</select></td>
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
        <Button variant="primary" on:click={save} disabled={!!problem || saving} loading={saving}>Save workflow</Button>
        <Button variant="secondary" on:click={() => (loadedKey = '')} disabled={saving}>Undo changes</Button>
      </div>
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
</section>
