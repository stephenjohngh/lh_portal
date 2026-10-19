<!-- src/lib/workflow/WorkflowItemControls.svelte -->
<!-- The controls of ONE workflow item, the same in every app that has items
     (2026-10-18 review: three hand-made copies had already drifted).

     It shows where the item is (step, deadline), who it is with (and Take it),
     the process's FIELDS with the item's values (migration 254 — any process
     may have them), the moves from its step — each held back with the reason
     when it cannot be made yet, in the database's own words — the note, the
     history and the printable record. The app's own details go in the default
     slot, between where it stands and its fields.

     The app keeps what is its own:
       · onMove(move, note) / onAssign(userId) do the change through the app's
         store, so the app's side effects (its timeline, a reload) stay there;
         a throw is shown here as the reason.
       · onFieldsSaved() — re-read after field values change (they are saved
         here, through workflow_set_fields()).
       · extraRefusal(move) — the app's own reason a move cannot be made yet
         (s.93's for a complaint, unsaved changes for a case), checked first.
       · confirmMove(move) — { title, message, danger } to ask first, or null.
       · handOff(move) — true when the app makes this move through its OWN
         form (a maintenance job's Record completion, which records the
         result with it); the button then opens that form, and the app moves
         the item. The reasons above still hold it back first.
       · audit — { appId, entityType, entityId } for its audit lines (the
         reference only — never a name or a value).
     The database makes every check again when the change is made. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '#lib/components/common/Button.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import FieldInput from './FieldInput.svelte';
  import { movesFrom, moveRefusal, isFinished, isMoveEvent, STEP_KIND_LABEL, timerPhrase } from './workflowModel.js';
  import { deadlineBand, deadlineWords, describeDeadline } from './workflowDeadlines.js';
  import { actionLabel } from './workflowActions.js';
  import { itemRecordModel, assignWords } from './itemRecord.js';
  import { itemHistory, setItemFields, timerDue } from './workflowApi.js';
  import { fieldText, fieldChanges, fieldDraft, LINK_TYPES } from './workflowFieldValues.js';
  import { loadLinkOptions } from './fieldLinks.js';
  import { downloadBlob } from '#lib/utils/download.js';
  import { fmtDateTime, fmtDate, fmtGenerated, today } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { formatVerificationCode } from '#lib/utils/caseVerificationCode.js';
  import { logAudit } from '#lib/utils/auditLogger.js';

  /** The item (null until its workflow is set up). @type {any} */ export let item = null;
  /** @type {any} */ export let workflow = null;
  /** @type {any[]} */ export let steps = [];
  /** @type {any[]} */ export let moves = [];
  /** The process's fields (workflow_fields). @type {any[]} */ export let fields = [];
  /** The subject's reference, for the confirmation line and the audit. */
  export let reference = '';
  export let isAdmin = false;
  export let canEdit = false;
  /** @type {string|null} */ export let me = null;
  /** @type {Array<{ id: string, full_name: string|null }>} */ export let assignees = [];
  /** @type {Record<string, string>} */ export let nameById = {};
  /** @type {(move: any, note: string) => Promise<any>} */ export let onMove;
  /** @type {(userId: string|null) => Promise<any>} */ export let onAssign;
  /** @type {() => Promise<any>} */ export let onFieldsSaved = async () => {};
  /** @type {(move: any) => string|null} */ export let extraRefusal = () => null;
  /** @type {(move: any) => ({ title: string, message: string, danger?: boolean } | null)} */ export let confirmMove = () => null;
  /** @type {(move: any) => boolean} */ export let handOff = () => false;
  /** @type {{ appId: string, entityType: string, entityId: string } | null} */ export let audit = null;
  export let showHistory = true;
  /**
   * The printable record, or null for none: what the subject is (title, facts,
   * sections) and the file's name. The fields are added to its facts here.
   * @type {null | { subject: () => any, filenameStem: string }}
   */
  export let record = null;
  /** Words for "no move from here". */
  export let finishedText = 'Nothing further happens from this step.';

  const dispatch = createEventDispatcher();

  let error = '';
  let done = '';
  let busy = '';
  let note = '';
  /** @type {any[]} */
  let history = [];
  let historyAsk = 0;
  let assignNonce = 0;                              // redraws the choice when a change is refused

  // History and the field draft are read per item (keyed on the id, never the object).
  let itemFor = '';
  /** @type {Record<string, any>} */
  let draft = {};
  $: if ((item?.id ?? '') !== itemFor) {
    itemFor = item?.id ?? '';
    note = ''; done = ''; error = '';
    draft = fieldDraft(fields, item?.fields ?? {});
  }
  // …and again whenever it reaches another step, however it got there: a move
  // handed to the app (handOff — Parking's offer, Maintenance's completion) or
  // the overnight timer never passes through move() below.
  let historyFor = '';
  $: if (`${item?.id ?? ''}:${item?.step_key ?? ''}` !== historyFor) {
    historyFor = `${item?.id ?? ''}:${item?.step_key ?? ''}`;
    readHistory();
  }
  async function readHistory() {
    const id = item?.id;
    history = [];
    if (!id) return;
    const asked = ++historyAsk;
    try {
      const read = await itemHistory(id);
      if (asked === historyAsk) history = read;    // a slower, earlier read never overwrites a newer one
    } catch (/** @type {any} */ err) { if (asked === historyAsk) error = errMessage(err, 'Could not read its history.'); }
  }

  // What the link fields offer, read once per process that has one.
  /** @type {any} */
  let links = { component: [], space: [], person: [] };
  let linksFor = '';
  $: needsLinks = fields.some((f) => LINK_TYPES.includes(f.type));
  $: if (needsLinks && workflow && linksFor !== workflow.id) { linksFor = workflow.id; readLinks(); }
  async function readLinks() {
    try {
      links = await loadLinkOptions(fields, Object.entries(nameById).map(([id, full_name]) => ({ id, full_name })));
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not read what the link fields offer.'); }
  }

  $: stepByKey = new Map(steps.map((st) => [st.key, st]));
  $: step = item ? stepByKey.get(item.step_key) ?? null : null;
  $: finished = isFinished(step?.kind ?? '');
  $: offered = item ? movesFrom(moves, item.step_key, { isAdmin, canEdit }) : [];

  // ── A timed move out of this step (migration 259): the system makes it
  // overnight once the item has sat here long enough. Its day is the
  // database's to count (working days skip the non-working days).
  $: timed = item ? moves.find((m) => m.from_key === item.step_key && m.timer_days) ?? null : null;
  /** @type {string|null} */
  let timerOn = null;
  let timerFor = '';
  $: if (timed && item && `${item.id}:${item.step_key}` !== timerFor) { timerFor = `${item.id}:${item.step_key}`; readTimer(item.id); }
  $: if (!timed) { timerOn = null; timerFor = ''; }
  async function readTimer(/** @type {string} */ id) {
    timerOn = null;
    try { timerOn = await timerDue(id); }
    catch (/** @type {any} */ err) { timerOn = null; }
  }
  $: lastMoverId = [...history].reverse().find(isMoveEvent)?.by ?? null;
  $: withName = (/** @type {string|null|undefined} */ uid) => (uid ? nameById[uid] || 'A user no longer listed' : '');
  $: due = item?.due_on && !finished ? item.due_on : null;
  $: changes = fieldChanges(fields, draft, item?.fields ?? {});
  $: fieldsDirty = Object.keys(changes).length > 0;
  /** Why a move cannot be made now: the app's reason, unsaved fields, the workflow's conditions, then the note. */
  $: whyNot = (/** @type {any} */ m) => extraRefusal(m)
    || (fieldsDirty ? 'Save the fields first.' : null)
    || moveRefusal(m, { userId: me, assignedTo: item?.assigned_to ?? null, lastMoverId, fields, values: item?.fields ?? {} })
    || (m.note_required && !note.trim() ? 'Add a note to say why.' : null);
  /** Each reason once, with the buttons it holds back — several moves can be held for different reasons. */
  $: reasons = (() => {
    /** @type {Map<string, string[]>} */
    const by = new Map();
    for (const m of offered) { const why = whyNot(m); if (why) by.set(why, [...(by.get(why) ?? []), m.label]); }
    return [...by].map(([why, labels]) => `${labels.join(', ')}: ${why}`);
  })();
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-300' };

  /** @type {any} */
  let pending = null;
  $: pendingAsk = pending ? confirmMove(pending) : null;
  function press(/** @type {any} */ m) {
    if (whyNot(m)) return;
    if (handOff(m)) return;
    if (confirmMove(m)) pending = m; else move(m);
  }
  async function move(/** @type {any} */ m) {
    const ref = reference;                           // captured before the await
    const n = note.trim();
    const reached = stepByKey.get(m.to_key)?.name ?? m.to_key;
    pending = null;
    busy = m.to_key; error = ''; done = '';
    try {
      await onMove(m, n);
      note = '';
      done = `${ref}: ${m.label} — now ${reached}.`;
      dispatch('changed', { move: m });
      await readHistory();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'That could not be done.'); }
    finally { busy = ''; }
  }
  async function assign(/** @type {string|null} */ uid) {
    const ref = reference;
    busy = 'assign'; error = ''; done = '';
    try {
      const result = await onAssign(uid);
      if (result?.changed !== false) done = `${ref}: ${uid ? `now with ${withName(uid)}` : 'now with no one'}.`;
      dispatch('changed', { assigned: uid });
      await readHistory();
    } catch (/** @type {any} */ err) { error = errMessage(err, 'That could not be done.'); assignNonce += 1; }
    finally { busy = ''; }
  }
  async function saveFields() {
    const it = item;                                 // captured before the await
    const ref = reference;
    const send = changes;
    const a = audit;
    if (!it) return;
    busy = 'fields'; error = ''; done = '';
    try {
      const result = await setItemFields(it.id, send);
      draft = fieldDraft(fields, result?.fields ?? {});
      done = `${ref}: saved.`;
      // The labels changed, never the values (they may name a person or say more than the log should).
      if (a) logAudit('update', a.entityType, a.entityId, `${ref} — fields`, { appId: a.appId, eventCategory: a.appId,
        afterData: { fields: Object.keys(send).map((k) => fields.find((f) => f.key === k)?.label ?? k) } });
      dispatch('changed', { fields: true });
      await Promise.all([onFieldsSaved(), readHistory()]);
    } catch (/** @type {any} */ err) { error = errMessage(err, 'The fields could not be saved.'); }
    finally { busy = ''; }
  }

  async function downloadRecord() {
    const it = item;                                 // captured before the await
    const rec = record;
    const a = audit;
    if (!it || !workflow || !rec) return;
    busy = 'record'; error = '';
    try {
      const events = await itemHistory(it.id);
      const subject = rec.subject();
      const withFields = { ...subject, facts: [...(subject.facts ?? []),
        ...fields.map((f) => /** @type {[string, string]} */ ([f.label, fieldText(f, it.fields?.[f.key], links)]))] };
      const model = itemRecordModel({ workflow, steps, item: it, events, people: nameById, todayISO: today(), subject: withFields });
      const { buildItemRecord } = await import('#lib/docx/itemRecordDocx.js');
      const { bytes, filename } = await buildItemRecord(model, {
        generatedAt: fmtGenerated(), generatedBy: withName(me) || 'a signed-in user', filenameStem: rec.filenameStem,
      });
      downloadBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), filename);
      // The reference only — the file may hold personal details, the log does not.
      if (a) logAudit('export', a.entityType, a.entityId, reference, { appId: a.appId, eventCategory: a.appId, afterData: { record: reference } });
    } catch (/** @type {any} */ err) { error = errMessage(err, 'Could not make the record.'); }
    finally { busy = ''; }
  }

  /** A history row in words. @param {any} e */
  const eventWords = (e) => (isMoveEvent(e)
    ? `${e.from_key ? `${stepByKey.get(e.from_key)?.name ?? e.from_key} → ` : ''}${stepByKey.get(e.to_key)?.name ?? e.to_key}`
    : e.kind === 'fields' ? 'Fields changed' : assignWords(e.assigned_to, nameById));
</script>

<div class="space-y-3 text-sm" data-testid="wf-item">
  <ErrorDisplay message={error} onDismiss={() => (error = '')} />
  {#if done}<p class="text-sm text-green-400" role="status">{done}</p>{/if}

  {#if item}
    <div class="flex items-start justify-between gap-2">
      <p><span class="text-slate-400">Step:</span> <span class="text-white">{step?.name ?? item.step_key}</span>
        {#if step}<span class="text-xs text-slate-500">· {STEP_KIND_LABEL[step.kind]}</span>{/if}</p>
      {#if record}
        <Button variant="tertiary" size="xs" loading={busy === 'record'} disabled={!!busy}
          title="A Word record of this and every move made on it" on:click={downloadRecord}>⬇ Record</Button>
      {/if}
    </div>
    {#if due}
      <p class={BAND_CLS[deadlineBand(due) ?? 'ok']} data-testid="wf-due">{deadlineWords(due)} — {fmtDate(due)}
        <!-- A date the subject sets itself (an action's due date, migration 255)
             comes with no step rule to describe. -->
        {#if describeDeadline(step ?? {})}<span class="block text-xs text-slate-500">{describeDeadline(step ?? {})}.</span>{/if}</p>
    {/if}
    {#if timed && timerOn && !finished}
      <p class="text-xs text-slate-400" data-testid="wf-timer">⏲ <strong>{timed.label}</strong> happens by itself on {fmtDate(timerOn)}
        — {timerPhrase(timed)} — unless it is moved before then.</p>
    {/if}
    {#if workflow?.public_status && item?.public_code && canEdit}
      <p class="text-xs text-slate-400" data-testid="wf-public-code">🌐 Public status: whoever has reference
        <span class="font-mono text-slate-200">{reference}</span> and code
        <span class="font-mono text-slate-200">{formatVerificationCode(item.public_code)}</span> can see its step at <span class="font-mono">/status</span>.</p>
    {/if}
    {#if !finished}
      <div class="flex items-center gap-2 flex-wrap" data-testid="wf-with">
        <span class="text-slate-400">With:</span>
        {#if canEdit}
          {#key assignNonce}
            <select class="px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200" aria-label="Who it is with"
              value={item.assigned_to ?? ''} disabled={!!busy}
              on:change={(e) => assign(/** @type {HTMLSelectElement} */ (e.currentTarget).value || null)}>
              <option value="">No one</option>
              {#each assignees as p (p.id)}<option value={p.id}>{p.full_name || 'A user with no name set'}{p.id === me ? ' (me)' : ''}</option>{/each}
              {#if item.assigned_to && !assignees.some((p) => p.id === item.assigned_to)}
                <option value={item.assigned_to}>{withName(item.assigned_to)} (can no longer work these)</option>
              {/if}
            </select>
          {/key}
          {#if me && item.assigned_to !== me && assignees.some((p) => p.id === me)}
            <Button variant="tertiary" size="xs" disabled={!!busy} on:click={() => assign(me)}>Take it</Button>
          {/if}
        {:else}
          <span class="text-slate-100">{withName(item.assigned_to) || 'No one'}</span>
        {/if}
      </div>
    {/if}
  {:else}
    <p class="text-xs text-amber-300">Not yet in its workflow — an administrator opening this app sets it up. It cannot be moved on until then.</p>
  {/if}

  <slot />

  {#if item && fields.length}
    <div class="space-y-2 border-t border-slate-700 pt-3" data-testid="wf-fields">
      {#if canEdit}
        {#each fields as f (f.key)}<FieldInput field={f} bind:value={draft[f.key]} {links} />{/each}
        <div class="flex gap-2">
          <Button size="small" variant="primary" disabled={!fieldsDirty || !!busy} loading={busy === 'fields'} on:click={saveFields}>Save fields</Button>
          <Button size="small" variant="secondary" disabled={!fieldsDirty || !!busy} on:click={() => (draft = fieldDraft(fields, item?.fields ?? {}))}>Undo</Button>
        </div>
      {:else}
        <dl class="grid grid-cols-[10rem_1fr] gap-x-2 gap-y-1">
          {#each fields as f (f.key)}<dt class="text-slate-400">{f.label}</dt><dd class="text-slate-100">{fieldText(f, item.fields?.[f.key], links)}</dd>{/each}
        </dl>
      {/if}
    </div>
  {/if}

  {#if item && offered.length}
    <div class="space-y-2 border-t border-slate-700 pt-3" data-testid="wf-moves">
      <label class="block">
        <span class="text-xs text-slate-400">Note to record with the move {offered.some((m) => m.note_required) ? '(needed for some)' : '(optional)'}</span>
        <textarea bind:value={note} rows="2" class="mt-1 w-full rounded bg-slate-900 border border-slate-600 p-2 text-sm text-slate-200"></textarea>
      </label>
      <div class="flex flex-wrap gap-2">
        {#each offered as m (m.to_key)}
          <Button size="small" variant={stepByKey.get(m.to_key)?.kind === 'declined' ? 'danger' : stepByKey.get(m.to_key)?.kind === 'done' ? 'primary' : 'secondary'}
            disabled={!!busy || !!whyNot(m)} loading={busy === m.to_key}
            title={whyNot(m) || (m.action ? actionLabel(m.action) : '')} on:click={() => press(m)}>{m.label}</Button>
        {/each}
      </div>
      {#each reasons as why (why)}
        <p class="text-xs text-amber-300" data-testid="wf-move-refusal">{why}</p>
      {/each}
    </div>
  {:else if item && !finished}
    <p class="text-xs text-slate-500">You cannot move this one on.</p>
  {:else if item}
    <p class="text-xs text-slate-500">{finishedText}</p>
  {/if}

  {#if showHistory && history.length}
    <div class="border-t border-slate-700 pt-2">
      <p class="text-xs text-slate-400 mb-1">History</p>
      <ul class="space-y-1 text-xs" data-testid="wf-history">
        {#each history as e (e.id)}
          <li><span class="text-slate-400">{fmtDateTime(e.at)}</span> · {eventWords(e)}
            {#if e.by}<span class="text-slate-500"> · {withName(e.by)}</span>{/if}
            {#if e.note}<span class="block text-slate-300 whitespace-pre-line">{e.note}</span>{/if}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<ConfirmDialog show={!!pendingAsk} title={pendingAsk?.title ?? ''} message={pendingAsk?.message ?? ''} danger={!!pendingAsk?.danger}
  confirmText="Confirm" processing={!!busy} on:confirm={() => move(pending)} on:cancel={() => (pending = null)} />
