<!-- src/lib/apps/cases/components/CasePanel.svelte -->
<!-- One case of a Cases process (migration 253): its title, description and
     the process's fields (editable by whoever can edit Cases), who it is with,
     its deadline, the moves from its step — each held back with the reason
     when it cannot be made yet, the needed fields among them — its history,
     its documents and its printable record. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { casesStore } from '../stores/casesStore.js';
  import FieldInput from './FieldInput.svelte';
  import AttachedDocuments from '#lib/components/common/documents/AttachedDocuments.svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { movesFrom, moveRefusal, isFinished, isMoveEvent, STEP_KIND_LABEL } from '#lib/workflow/workflowModel.js';
  import { deadlineBand, deadlineWords, describeDeadline } from '#lib/workflow/workflowDeadlines.js';
  import { itemRecordModel, assignWords } from '#lib/workflow/itemRecord.js';
  import { actionLabel } from '#lib/workflow/workflowActions.js';
  import { fieldText, fieldsForSave } from '../utils/caseFields.js';
  import { DOC_FOLDERS, entityFolderPath } from '#lib/utils/documentUtils.js';
  import { downloadBlob } from '#lib/utils/download.js';
  import { fmtDateTime, fmtDate, fmtGenerated, today } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { logAudit } from '#lib/utils/auditLogger.js';

  /** @type {any} */ export let c;
  /** @type {any} */ export let item = null;
  /** @type {any} */ export let workflow = null;
  /** @type {any[]} */ export let steps = [];
  /** @type {any[]} */ export let moves = [];
  /** @type {any[]} */ export let fields = [];
  /** @type {any} */ export let links = { component: [], space: [], person: [] };
  /** @type {Array<{ id: string, full_name: string|null }>} */ export let assignees = [];
  /** @type {Record<string, string>} */ export let nameById = {};
  /** @type {string|null} */ export let me = null;
  export let isAdmin = false;
  export let canEdit = false;

  const dispatch = createEventDispatcher();

  let error = '';
  let done = '';
  let busy = '';
  let note = '';
  /** @type {any[]} */
  let history = [];
  // The draft: read once per case (keyed on its id, never the object).
  let draftFor = '';
  let title = '';
  let description = '';
  /** @type {Record<string, any>} */
  let values = {};
  $: if (c && c.id !== draftFor) { draftFor = c.id; resetDraft(); readHistory(); }
  function resetDraft() {
    title = c.title ?? ''; description = c.description ?? '';
    values = Object.fromEntries(fields.map((f) => [f.key, c.fields?.[f.key] ?? '']));
    note = ''; done = ''; error = '';
  }
  async function readHistory() {
    const it = item;
    history = [];
    if (!it) return;
    try { history = await casesStore.history(it.id); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read its history.'); }
  }

  $: stepByKey = new Map(steps.map((st) => [st.key, st]));
  $: step = item ? stepByKey.get(item.step_key) ?? null : null;
  $: finished = isFinished(step?.kind ?? '');
  $: offered = item ? movesFrom(moves, item.step_key, { isAdmin, canEdit }) : [];
  $: lastMoverId = [...history].reverse().find(isMoveEvent)?.by ?? null;
  $: saved = fieldsForSave(fields, c?.fields ?? {}, c?.fields ?? {});
  $: draft = fieldsForSave(fields, values, c?.fields ?? {});
  $: dirty = !!c && (title.trim() !== (c.title ?? '') || description.trim() !== (c.description ?? '')
    || JSON.stringify(draft) !== JSON.stringify(saved));
  /** Why a move cannot be made now — said before it is pressed, in the database's words. */
  $: whyNot = (/** @type {any} */ m) => (dirty ? 'Save your changes first.' : null)
    || moveRefusal(m, { userId: me, assignedTo: item?.assigned_to ?? null, lastMoverId, fields, values: c?.fields ?? {} })
    || (m.note_required && !note.trim() ? 'Add a note to say why.' : null);
  $: withName = (/** @type {string|null|undefined} */ uid) => (uid ? nameById[uid] || 'A user no longer listed' : '');
  $: due = item?.due_on && !finished ? item.due_on : null;
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-300' };

  async function run(/** @type {string} */ what, /** @type {() => Promise<any>} */ fn, /** @type {string} */ ok) {
    busy = what; error = ''; done = '';
    try { await fn(); done = ok; await readHistory(); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'That could not be done.'); }
    finally { busy = ''; }
  }
  function saveDraft() {
    const theCase = c;                               // captured before the await
    return run('save', () => casesStore.save(theCase, { title, description, fields: draft }), `${theCase.reference}: saved.`);
  }
  function makeMove(/** @type {any} */ m) {
    const theCase = c;
    const n = note;
    return run(m.to_key, async () => { await casesStore.move(theCase, m.to_key, n); note = ''; }, `${theCase.reference}: ${m.label}.`);
  }
  function assignTo(/** @type {string|null} */ uid) {
    const theCase = c;
    return run('assign', () => casesStore.assign(theCase, uid), `${theCase.reference}: ${uid ? `now with ${withName(uid)}` : 'now with no one'}.`);
  }

  let confirmDelete = false;
  async function doDelete() {
    const theCase = c;
    busy = 'delete'; error = '';
    try { await casesStore.remove(theCase); confirmDelete = false; dispatch('closed'); }
    catch (/** @type {any} */ err) { error = errMessage(err, 'It could not be deleted.'); confirmDelete = false; }
    finally { busy = ''; }
  }

  // The printable record (#lib/workflow/itemRecord.js), as for any workflow item.
  async function downloadRecord() {
    const theCase = c;
    const it = item;
    if (!theCase || !it || !workflow) return;
    busy = 'record'; error = '';
    try {
      const events = await casesStore.history(it.id);
      const model = itemRecordModel({
        workflow, steps, item: it, events, people: nameById, todayISO: today(),
        subject: {
          title: `${workflow.name} ${theCase.reference}`,
          facts: [['Reference', theCase.reference], ['Opened', fmtDateTime(theCase.created_at)], ['Title', theCase.title],
            ...fields.map((f) => /** @type {[string, string]} */ ([f.label, fieldText(f, theCase.fields?.[f.key], links)]))],
          sections: [{ heading: 'Description', text: theCase.description }],
        },
      });
      const { buildItemRecord } = await import('#lib/docx/itemRecordDocx.js');
      const { bytes, filename } = await buildItemRecord(model, {
        generatedAt: fmtGenerated(), generatedBy: withName(me) || 'a signed-in user', filenameStem: `${theCase.reference}_${today()}`,
      });
      downloadBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
      logAudit('export', 'case', theCase.id, theCase.reference, { appId: 'cases', eventCategory: 'cases', afterData: { record: theCase.reference } });
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not make the record.'); }
    finally { busy = ''; }
  }
</script>

{#if c}
  <aside class="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3 text-sm" data-testid="case-panel">
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-mono text-white">{c.reference}</p>
        <p class="text-xs text-slate-400">Opened {fmtDateTime(c.created_at)} · {withName(c.created_by) || '—'}</p>
      </div>
      <div class="flex gap-1">
        <Button variant="tertiary" size="xs" loading={busy === 'record'} disabled={!!busy || !item} on:click={downloadRecord}
          title="A Word record of this case and every move made on it">⬇ Record</Button>
        <Button variant="tertiary" size="xs" on:click={() => dispatch('closed')}>Close</Button>
      </div>
    </div>
    <ErrorDisplay message={error} onDismiss={() => (error = '')} />
    {#if done}<p class="text-sm text-green-400" role="status">{done}</p>{/if}

    <p><span class="text-slate-400">Step:</span> <span class="text-white">{step?.name ?? '—'}</span>
      {#if step}<span class="text-xs text-slate-500">· {STEP_KIND_LABEL[step.kind]}</span>{/if}</p>
    {#if due}
      <p class={BAND_CLS[deadlineBand(due) ?? 'ok']} data-testid="case-due">{deadlineWords(due)} — {fmtDate(due)}
        <span class="block text-xs text-slate-500">{describeDeadline(step ?? {})}.</span></p>
    {/if}
    {#if item && !finished}
      <div class="flex items-center gap-2" data-testid="case-with">
        <span class="text-slate-400">With:</span>
        {#if canEdit}
          <select class="px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" aria-label="Who it is with"
            value={item.assigned_to ?? ''} disabled={!!busy}
            on:change={(e) => assignTo(/** @type {HTMLSelectElement} */ (e.currentTarget).value || null)}>
            <option value="">No one</option>
            {#each assignees as p (p.id)}<option value={p.id}>{p.full_name || 'A user with no name set'}{p.id === me ? ' (me)' : ''}</option>{/each}
            {#if item.assigned_to && !assignees.some((p) => p.id === item.assigned_to)}
              <option value={item.assigned_to}>{withName(item.assigned_to)} (can no longer work these)</option>
            {/if}
          </select>
          {#if me && item.assigned_to !== me && assignees.some((p) => p.id === me)}
            <Button variant="tertiary" size="xs" disabled={!!busy} on:click={() => assignTo(me)}>Take it</Button>
          {/if}
        {:else}
          <span class="text-slate-100">{withName(item.assigned_to) || 'No one'}</span>
        {/if}
      </div>
    {/if}

    <div class="space-y-2 border-t border-slate-700 pt-3" data-testid="case-details">
      {#if canEdit}
        <label class="block text-xs text-slate-400">Title
          <input class="mt-1 w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" bind:value={title} /></label>
        <label class="block text-xs text-slate-400">Description
          <textarea rows="3" class="mt-1 w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" bind:value={description}></textarea></label>
        {#each fields as f (f.key)}<FieldInput field={f} bind:value={values[f.key]} {links} />{/each}
        <div class="flex gap-2">
          <Button size="small" variant="primary" disabled={!dirty || !title.trim() || !!busy} loading={busy === 'save'} on:click={saveDraft}>Save changes</Button>
          <Button size="small" variant="secondary" disabled={!dirty || !!busy} on:click={resetDraft}>Undo changes</Button>
        </div>
      {:else}
        <p class="text-white">{c.title}</p>
        {#if c.description}<p class="text-slate-300 whitespace-pre-line">{c.description}</p>{/if}
        <dl class="grid grid-cols-[10rem_1fr] gap-x-2 gap-y-1">
          {#each fields as f (f.key)}<dt class="text-slate-400">{f.label}</dt><dd class="text-slate-100">{fieldText(f, c.fields?.[f.key], links)}</dd>{/each}
        </dl>
      {/if}
    </div>

    {#if offered.length}
      <div class="space-y-2 border-t border-slate-700 pt-3">
        <label class="block">
          <span class="text-xs text-slate-400">Note {offered.some((m) => m.note_required) ? '(needed for some)' : '(optional)'}</span>
          <textarea bind:value={note} rows="2" class="mt-1 w-full rounded bg-slate-900 border border-slate-600 p-2 text-sm"></textarea>
        </label>
        <div class="flex flex-wrap gap-2">
          {#each offered as m (m.to_key)}
            <Button size="small" variant={stepByKey.get(m.to_key)?.kind === 'declined' ? 'danger' : stepByKey.get(m.to_key)?.kind === 'done' ? 'primary' : 'secondary'}
              disabled={!!busy || !!whyNot(m)} loading={busy === m.to_key}
              title={whyNot(m) || (m.action ? actionLabel(m.action) : '')} on:click={() => makeMove(m)}>{m.label}</Button>
          {/each}
        </div>
        {#each [...new Set(offered.map(whyNot).filter(Boolean))] as why (why)}
          <p class="text-xs text-amber-300" data-testid="case-move-refusal">{why}</p>
        {/each}
      </div>
    {:else if step && !finished}
      <p class="text-xs text-slate-500">You cannot move this one on.</p>
    {/if}

    <div class="border-t border-slate-700 pt-3">
      <AttachedDocuments entityType="case" entityId={c.id} {canEdit} canDelete={isAdmin}
        folderPath={entityFolderPath(DOC_FOLDERS.CASES, `${c.reference} ${c.title}`, c.id)} title="Documents" />
    </div>

    {#if history.length}
      <div class="border-t border-slate-700 pt-2">
        <p class="text-xs text-slate-400 mb-1">History</p>
        <ul class="space-y-1 text-xs" data-testid="case-history">
          {#each history as e (e.id)}
            <li><span class="text-slate-400">{fmtDateTime(e.at)}</span> ·
              {#if isMoveEvent(e)}{e.from_key ? `${stepByKey.get(e.from_key)?.name ?? e.from_key} → ` : ''}{stepByKey.get(e.to_key)?.name ?? e.to_key}{:else}{assignWords(e.assigned_to, nameById)}{/if}
              {#if e.by}<span class="text-slate-500"> · {withName(e.by)}</span>{/if}
              {#if e.note}<span class="block text-slate-300 whitespace-pre-line">{e.note}</span>{/if}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if isAdmin}
      <div class="border-t border-slate-700 pt-3">
        <Button variant="danger" size="small" disabled={!!busy} on:click={() => (confirmDelete = true)}>Delete case</Button>
      </div>
    {/if}
  </aside>

  <ConfirmDialog show={confirmDelete} title="Delete {c.reference}?" danger={true} processing={busy === 'delete'}
    message="The case, its history and its documents are deleted. Nothing is kept. To finish a case, move it to a finished step instead."
    confirmText="Delete" on:confirm={doDelete} on:cancel={() => (confirmDelete = false)} />
{/if}
