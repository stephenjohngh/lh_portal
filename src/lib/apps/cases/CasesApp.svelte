<!-- src/lib/apps/cases/CasesApp.svelte -->
<!-- Cases (migration 253): the processes an administrator set up in Admin →
     Workflows with no code — building-work change control, fire-safety
     concern triage, permits to work — and the cases in each. A case has a
     title, a description, the process's own fields and documents; it moves
     through the process's steps with their deadlines, conditions and history.

     ⛔ Granted per user on Admin → Users (the `cases` grant gates every case
     at the table). Cases are for building processes: a person field is a
     portal user, and no resident's personal data belongs here. -->
<script>
  import AppGate from '#lib/components/common/AppGate.svelte';
  import TabBar from '#lib/components/common/TabBar.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import Modal from '#lib/components/common/Modal.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import FieldInput from './components/FieldInput.svelte';
  import CasePanel from './components/CasePanel.svelte';
  import { casesStore } from './stores/casesStore.js';
  import { linkOptions, missingToOpen, fieldsForSave, LINK_TYPES } from './utils/caseFields.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { auth } from '#lib/stores/auth.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { api } from '#lib/utils/api.js';
  import { isFinished } from '#lib/workflow/workflowModel.js';
  import { deadlineBand, deadlineWords } from '#lib/workflow/workflowDeadlines.js';
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { fmtDateTime } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';

  $: s = $casesStore;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;
  $: me = $auth.user?.id ?? null;
  $: nameById = Object.fromEntries(/** @type {Array<{ id: string, full_name: string|null }>} */ ($profiles.list)
    .map((p) => [p.id, p.full_name || 'A user with no name set']));

  let ready = false;
  let error = '';
  /** @type {Array<{ id: string, full_name: string|null }>} */
  let assignees = [];
  /** @type {any} */
  let links = { component: [], space: [], person: [] };
  let linksFor = '';

  const loadCases = async () => {
    try {
      await Promise.all([casesStore.load(), profilesStore.load()]);
      assignees = await casesStore.assignees();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read the cases.'); }
  };

  // What the link fields offer — read once per process that has one.
  $: needsLinks = s.fields.some((f) => LINK_TYPES.includes(f.type));
  $: if (ready && s.workflow && needsLinks && linksFor !== s.workflow.id) { linksFor = s.workflow.id; readLinks(); }
  $: if (ready && s.workflow && !needsLinks) links = { ...links, person: linkOptions({ people: $profiles.list }).person };
  async function readLinks() {
    try {
      const want = new Set(s.fields.map((f) => f.type));
      const [components, spaces, floors, types] = await Promise.all([
        want.has('component') ? api.getAll('components', { select: 'id, label, asset_id, type_code, floor_id' }) : [],
        want.has('space') ? api.getAll('spaces', { select: 'id, label, name, kind, assigned_id, floor_id' }) : [],
        want.has('component') || want.has('space') ? api.get('floors', { select: 'id, short_name' }) : [],
        want.has('component') ? api.getAll('component_types', { select: 'id, code, initial' }) : [],
      ]);
      links = linkOptions({ components, spaces, floors, types, people: $profiles.list });
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read what the link fields offer.'); }
  }

  async function choose(/** @type {string} */ key) {
    selectedId = null;
    try { await casesStore.load(key); assignees = await casesStore.assignees(); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read that process.'); }
  }

  let show = 'open';            // 'open' | 'mine' | 'finished' | ''
  let q = '';
  /** @type {string|null} */
  let selectedId = null;
  $: stepByKey = new Map(s.steps.map((st) => [st.key, st]));
  $: itemFor = (/** @type {string} */ id) => s.items.find((i) => i.subject_id === id) ?? null;
  $: stepOf = (/** @type {string} */ id) => stepByKey.get(itemFor(id)?.step_key ?? '') ?? null;
  $: rows = s.cases
    .filter((c) => {
      const k = stepOf(c.id)?.kind ?? '';
      if (show === 'mine') return !isFinished(k) && !!me && itemFor(c.id)?.assigned_to === me;
      return show === '' || (show === 'open' ? !isFinished(k) : isFinished(k));
    })
    .filter((c) => matchesSearch([c.reference, c.title, c.description], q));
  $: selected = s.cases.find((c) => c.id === selectedId) ?? null;
  $: dueOf = (/** @type {string} */ id) => (isFinished(stepOf(id)?.kind ?? '') ? null : itemFor(id)?.due_on ?? null);
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-400' };

  // ── Opening a case ──
  let showNew = false;
  let newTitle = '';
  let newDescription = '';
  /** @type {Record<string, any>} */
  let newValues = {};
  let creating = false;
  let newError = '';
  function startNew() {
    newTitle = ''; newDescription = ''; newError = '';
    newValues = Object.fromEntries(s.fields.map((f) => [f.key, '']));
    showNew = true;
  }
  $: newBlocked = !newTitle.trim() ? 'Give it a title.' : missingToOpen(s.fields, newValues);
  async function openCase() {
    if (newBlocked) return;
    creating = true; newError = '';
    try {
      const row = await casesStore.create({ title: newTitle, description: newDescription, fields: fieldsForSave(s.fields, newValues) });
      showNew = false;
      selectedId = row.id;
    } catch (/** @type {any} */ err) { newError = errMessage(err, 'The case could not be opened.'); }
    finally { creating = false; }
  }
</script>

<div class="p-4 space-y-3">
  <div class="flex items-center gap-3 flex-wrap">
    <h2 class="text-sm font-semibold text-white">Cases</h2>
    <div class="flex-1"></div>
    {#if ready && s.workflow && canEdit}<Button variant="primary" size="small" on:click={startNew}>+ Open a case</Button>{/if}
  </div>
  <ErrorDisplay message={error || s.error || ''} onDismiss={() => (error = '')} />

  <AppGate appId="cases" name="Cases" load={loadCases} requireGrant bind:ready loadingText="Loading cases…">
    {#if !s.processes.length}
      <div class="text-center py-10 text-slate-400 text-sm space-y-2">
        <p>No case processes yet.</p>
        <p class="text-xs text-slate-500 max-w-md mx-auto">An administrator sets one up in Admin → Workflows → <em>New Cases process</em>:
          its steps, moves, deadlines and fields, with no code. Cases are for building processes — change control, concern triage,
          permits to work — never a resident's personal records.</p>
      </div>
    {:else}
      <TabBar tabs={s.processes.map((p) => ({ key: p.key, label: p.name }))} active={s.chosen} on:select={(e) => choose(e.detail)} />
      {#if s.workflow?.description}<p class="text-sm text-slate-400">{s.workflow.description}</p>{/if}

      <div class="flex flex-wrap gap-2 items-center">
        <input bind:value={q} placeholder="Search reference, title…" aria-label="Search cases"
          class="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200 w-64" />
        <select bind:value={show} aria-label="Which cases" class="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-slate-200">
          <option value="open">Open</option><option value="mine">Open — with me</option>
          <option value="finished">Finished</option><option value="">All</option>
        </select>
        <span class="text-xs text-slate-500">{rows.length} of {s.cases.length}</span>
      </div>

      <div class="grid gap-4 {selected ? 'lg:grid-cols-[1fr_28rem]' : ''}">
        <div class="min-w-0 overflow-x-auto">
          {#if rows.length === 0}
            <p class="text-sm text-slate-500 italic py-4">{s.cases.length ? 'No cases match.' : 'No cases yet.'}</p>
          {:else}
            <table class="w-full text-sm" data-testid="case-list">
              <thead><tr class="border-b border-slate-700 text-left text-xs text-slate-400">
                <th class="py-2 pr-3 font-medium">Opened</th><th class="py-2 pr-3 font-medium">Reference</th>
                <th class="py-2 pr-3 font-medium">Title</th><th class="py-2 pr-3 font-medium">Step</th>
                <th class="py-2 pr-3 font-medium">With</th><th class="py-2 font-medium">Due</th></tr></thead>
              <tbody>
                {#each rows as c (c.id)}
                  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                  <tr class="border-b border-slate-800 cursor-pointer hover:bg-slate-800/60 {c.id === selectedId ? 'bg-slate-800' : ''}"
                    on:click={() => (selectedId = c.id)}>
                    <td class="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(c.created_at)}</td>
                    <td class="py-2 pr-3 font-mono text-slate-200">{c.reference}</td>
                    <td class="py-2 pr-3 text-slate-200">{c.title}</td>
                    <td class="py-2 pr-3 text-xs text-slate-300">{stepOf(c.id)?.name ?? '—'}</td>
                    <td class="py-2 pr-3 text-xs text-slate-300" data-testid="case-list-with">{isFinished(stepOf(c.id)?.kind ?? '') ? '' : (itemFor(c.id)?.assigned_to ? nameById[itemFor(c.id)?.assigned_to] ?? 'A user no longer listed' : '')}</td>
                    <td class="py-2 text-xs whitespace-nowrap {BAND_CLS[deadlineBand(dueOf(c.id)) ?? 'ok']}">{dueOf(c.id) ? deadlineWords(dueOf(c.id)) : ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
        {#if selected}
          <CasePanel c={selected} item={itemFor(selected.id)} workflow={s.workflow} steps={s.steps} moves={s.moves} fields={s.fields}
            {links} {assignees} {nameById} {me} isAdmin={$permissions.isAdmin} {canEdit} on:closed={() => (selectedId = null)} />
        {/if}
      </div>
    {/if}
  </AppGate>
</div>

<Modal show={showNew} title={s.workflow ? `Open a case — ${s.workflow.name}` : 'Open a case'} size="medium" on:close={() => (showNew = false)}>
  <div class="space-y-3 text-sm" data-testid="new-case-form">
    <label class="block text-xs text-slate-400">Title
      <input class="mt-1 w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" bind:value={newTitle} /></label>
    <label class="block text-xs text-slate-400">Description
      <textarea rows="3" class="mt-1 w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" bind:value={newDescription}></textarea></label>
    {#each s.fields as f (f.key)}<FieldInput field={f} bind:value={newValues[f.key]} {links} showNeeded={true} />{/each}
    <p class="text-xs text-slate-500">Documents can be attached once it is open.</p>
    {#if newBlocked}<p class="text-xs text-amber-300">{newBlocked}</p>{/if}
    {#if newError}<p class="text-sm text-red-400" role="alert">{newError}</p>{/if}
    <div class="flex gap-2 justify-end">
      <Button variant="secondary" on:click={() => (showNew = false)}>Cancel</Button>
      <Button variant="primary" disabled={!!newBlocked || creating} loading={creating} on:click={openCase}>Open the case</Button>
    </div>
  </div>
</Modal>
