<!-- src/lib/apps/complaints/components/ComplaintDetail.svelte -->
<!-- One complaint: what it is, where it has got to, and the only moves that are
     legal from here.

     The buttons are built from the state machine rather than written out, so
     the interface cannot offer something the database will refuse — and where a
     move is legal but not yet possible (responding with no response written) it
     is shown DISABLED with the reason, rather than hidden. A control that
     vanishes leaves somebody wondering where it went.

     ⭐ Since migration 252 the moves are the 'complaint' WORKFLOW's (Admin →
     Workflows), with their conditions, and the case carries the workflow's
     deadline (the two clocks) and who it is with. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button        from '#lib/components/common/Button.svelte';
  import FormTextarea  from '#lib/components/common/FormTextarea.svelte';
  import FormSelect    from '#lib/components/common/FormSelect.svelte';
  import Badge         from '#lib/components/common/Badge.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ComplaintTimeline from './ComplaintTimeline.svelte';
  import { fmtDateTime, fmtDate } from '#lib/utils/dates.js';
  import { statusMeta, blockedReason, STATUS } from '../utils/complaintLifecycle.js';
  import { movesFrom, moveRefusal } from '#lib/workflow/workflowModel.js';
  import { deadlineBand, deadlineWords, describeDeadline } from '#lib/workflow/workflowDeadlines.js';
  import { categoryLabel, channelLabel, complainantLabel,
           OUTCOMES, asOptions } from '../utils/complaintOptions.js';

  export let complaint;
  export let timeline = [];
  export let canEdit = false;
  export let saving = false;
  export let isAdmin = false;
  /** The complaint's workflow item (migration 252); null until the workflow is set up. */
  export let item = null;
  /** The workflow's steps and moves. */
  export let steps = [];
  export let wfMoves = [];
  /** Who it may be given to, everyone's names by id, the viewer, and who made the last move. */
  export let assignees = [];
  export let nameById = {};
  export let me = null;
  export let lastMoverId = null;

  const dispatch = createEventDispatcher();

  let note = '';
  let responseDraft = '';
  let outcomeDraft = '';
  let pendingTransition = null;

  // Keyed on the id, not the object: an object prop is dirty on every parent
  // update, which would wipe a half-typed response.
  let loadedFor = null;
  $: if (complaint?.id !== loadedFor) {
    loadedFor = complaint?.id ?? null;
    note = '';
    responseDraft = complaint?.response_text ?? '';
    outcomeDraft = complaint?.outcome ?? '';
  }

  $: meta = statusMeta(complaint?.status);
  $: stepByKey = new Map(steps.map((st) => [st.key, st]));
  $: step = item ? stepByKey.get(item.step_key) ?? null : null;
  $: finished = step ? step.kind === 'done' || step.kind === 'declined' : false;
  $: moves = item ? movesFrom(wfMoves, item.step_key, { isAdmin, canEdit }) : [];
  $: moveTo = (/** @type {string} */ to) => moves.find((m) => m.to_key === to) ?? null;
  $: due = item?.due_on && !finished ? item.due_on : null;
  const BAND_CLS = { overdue: 'text-red-400 font-semibold', due_soon: 'text-amber-300', ok: 'text-slate-300' };
  $: withName = (/** @type {string|null|undefined} */ uid) => (uid ? nameById[uid] || 'A user no longer listed' : '');

  /** The response draft is what `blockedReason` should judge, not the saved value. */
  $: probe = { ...complaint, response_text: responseDraft };

  /** Why a move cannot be made now — the workflow's conditions, then s.93's. */
  $: whyNot = (/** @type {any} */ m) => moveRefusal(m, { userId: me, assignedTo: item?.assigned_to ?? null, lastMoverId })
    || blockedReason(probe, m.to_key)
    || (m.note_required && !note.trim() ? 'Add a note to say why.' : null);

  function requestTransition(to) {
    const m = moveTo(to);
    if (!m || whyNot(m)) return;
    pendingTransition = to;
  }

  function confirmTransition() {
    const to = pendingTransition;
    pendingTransition = null;
    dispatch('transition', { to, note: note.trim() });
    note = '';
  }
</script>

{#if complaint}
  <div class="space-y-4">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <div class="flex items-start gap-3 flex-wrap">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-mono text-slate-400">{complaint.reference}</span>
          <Badge color={meta.badge}>{meta.label}</Badge>
          {#if !complaint.in_scope}
            <Badge color="bg-amber-700">Out of scope</Badge>
          {/if}
        </div>
        <h3 class="text-base font-semibold text-white mt-1">{complaint.subject}</h3>
        <p class="text-[11px] text-slate-500 mt-0.5">{meta.hint}</p>
      </div>
      <Button variant="secondary" size="small" on:click={() => dispatch('back')}>Back</Button>
    </div>

    <!-- ── Facts ──────────────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div>
        <p class="text-slate-500">Received</p>
        <p class="text-slate-300">{fmtDateTime(complaint.received_at)}</p>
      </div>
      <div>
        <p class="text-slate-500">About</p>
        <p class="text-slate-300">{categoryLabel(complaint.category)}</p>
      </div>
      <div>
        <p class="text-slate-500">Came in by</p>
        <p class="text-slate-300">{channelLabel(complaint.channel)}</p>
      </div>
      <div data-testid="complaint-with">
        <p class="text-slate-500">With</p>
        {#if canEdit && item && !finished}
          <select class="mt-0.5 w-full px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-slate-200"
            aria-label="Who it is with" value={item.assigned_to ?? ''} disabled={saving}
            on:change={(e) => dispatch('assign', /** @type {HTMLSelectElement} */ (e.currentTarget).value || null)}>
            <option value="">No one</option>
            {#each assignees as p (p.id)}<option value={p.id}>{p.full_name || 'A user with no name set'}{p.id === me ? ' (me)' : ''}</option>{/each}
            {#if item.assigned_to && !assignees.some((p) => p.id === item.assigned_to)}
              <option value={item.assigned_to}>{withName(item.assigned_to)} (can no longer work these)</option>
            {/if}
          </select>
          {#if me && item.assigned_to !== me && assignees.some((p) => p.id === me)}
            <Button variant="tertiary" size="xs" disabled={saving} on:click={() => dispatch('assign', me)}>Take it</Button>
          {/if}
        {:else}
          <p class="text-slate-300">{withName(item?.assigned_to) || 'No one'}</p>
        {/if}
      </div>
    </div>

    {#if due}
      <p class="text-xs {BAND_CLS[deadlineBand(due) ?? 'ok']}" data-testid="complaint-due">
        {step?.name ?? ''}: {deadlineWords(due)} — {fmtDate(due)}
        <span class="block text-[11px] text-slate-500">{describeDeadline(step ?? {})}.</span>
      </p>
    {/if}
    {#if !item}
      <p class="text-[11px] text-amber-300">Not yet in its workflow — an administrator opening Complaints sets it up. It cannot be moved on until then.</p>
    {/if}

    <div class="p-3 rounded border border-slate-700 bg-slate-800/40">
      <p class="text-[11px] text-slate-500 mb-1">What was said</p>
      <p class="text-sm text-slate-200 whitespace-pre-wrap">{complaint.description}</p>
    </div>

    {#if !complaint.in_scope && complaint.scope_rationale}
      <div class="p-3 rounded border border-amber-500/40 bg-amber-500/10">
        <p class="text-[11px] text-amber-300 mb-1">Why it is out of scope</p>
        <p class="text-xs text-amber-100 whitespace-pre-wrap">{complaint.scope_rationale}</p>
      </div>
    {/if}

    <!-- ── Who complained ─────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
      <div>
        <p class="text-slate-500">Complainant</p>
        <p class="text-slate-300">{complaint.complainant_name || 'Not given'}</p>
      </div>
      <div>
        <p class="text-slate-500">Reply to</p>
        <p class="text-slate-300 break-words">{complaint.complainant_contact || '—'}</p>
      </div>
      <div>
        <p class="text-slate-500">They are</p>
        <p class="text-slate-300">{complainantLabel(complaint.complainant_type)}</p>
      </div>
      <div>
        <p class="text-slate-500">Flat / area</p>
        <p class="text-slate-300">{complaint.dwelling_ref || '—'}</p>
      </div>
    </div>

    {#if !complaint.complainant_contact}
      <p class="text-[11px] text-amber-400/90">
        No way to reply. This can be investigated, but the duty to respond
        cannot be discharged — record that in the timeline.
      </p>
    {/if}

    <!-- ── The escalation right ───────────────────────────────────────── -->
    <!-- Its own box because it is its own duty. Telling somebody they may go
         to the regulator is what must be evidenced; whether they go is not in
         our control. -->
    <div class="p-3 rounded border border-slate-700 bg-slate-800/40 flex items-center gap-3 flex-wrap">
      <div class="min-w-0 flex-1">
        <p class="text-[11px] text-slate-500">Right to escalate to the BSR</p>
        {#if complaint.escalation_told_at}
          <p class="text-xs text-green-300">
            Complainant told on {fmtDate(complaint.escalation_told_at)}
          </p>
        {:else}
          <p class="text-xs text-amber-300">Not yet recorded as told</p>
        {/if}
      </div>
      {#if canEdit && !complaint.escalation_told_at}
        <Button variant="secondary" size="small" disabled={saving}
                on:click={() => dispatch('escalationTold')}>
          Record as told
        </Button>
      {/if}
    </div>

    <!-- ── Response ───────────────────────────────────────────────────── -->
    {#if canEdit}
      <div class="border-t border-slate-700 pt-3 space-y-2">
        <FormTextarea label="Response to the complainant" bind:value={responseDraft} rows={4}
                      placeholder="The written outcome that will be sent" />
        <div class="flex items-end gap-2 flex-wrap">
          <div class="w-56">
            <FormSelect label="Outcome" bind:value={outcomeDraft}
                        placeholder="Not decided" options={asOptions(OUTCOMES)} />
          </div>
          <div class="pb-4">
            <Button variant="secondary" size="small" disabled={saving}
                    on:click={() => dispatch('save', {
                      response_text: responseDraft, outcome: outcomeDraft || null })}>
              Save draft
            </Button>
          </div>
        </div>
      </div>
    {:else if complaint.response_text}
      <div class="p-3 rounded border border-slate-700 bg-slate-800/40">
        <p class="text-[11px] text-slate-500 mb-1">Response</p>
        <p class="text-sm text-slate-200 whitespace-pre-wrap">{complaint.response_text}</p>
      </div>
    {/if}

    <!-- ── The legal moves ────────────────────────────────────────────── -->
    {#if canEdit && moves.length}
      <div class="border-t border-slate-700 pt-3 space-y-2" data-testid="complaint-moves">
        <FormTextarea label={moves.some((m) => m.note_required) ? 'Note to record with this step (needed for some)' : 'Note to record with this step (optional)'}
                      bind:value={note} rows={2}
                      placeholder="What was done, or why" />
        <div class="flex flex-wrap gap-2">
          {#each moves as m (m.to_key)}
            {@const why = whyNot(m)}
            <Button variant="secondary" size="small"
                    disabled={saving || !!why} title={why ?? ''}
                    on:click={() => requestTransition(m.to_key)}>
              {m.label}
            </Button>
          {/each}
        </div>
        {#each moves as m (m.to_key)}
          {@const why = whyNot(m)}
          {#if why}
            <p class="text-[11px] text-amber-400/90" data-testid="complaint-move-refusal">{m.label}: {why}</p>
          {/if}
        {/each}
      </div>
    {:else if item && moves.length === 0 && finished}
      <p class="text-xs text-slate-500 border-t border-slate-700 pt-3">
        Nothing further happens to a complaint in this state.
      </p>
    {/if}

    <!-- ── Timeline ───────────────────────────────────────────────────── -->
    <div class="border-t border-slate-700 pt-3">
      <div class="flex items-center gap-2 mb-2">
        <h4 class="text-xs font-semibold text-white">What has happened</h4>
        <span class="text-[11px] text-slate-600">append-only</span>
      </div>
      <ComplaintTimeline entries={timeline} />

      {#if canEdit}
        <div class="mt-3 flex items-end gap-2">
          <div class="flex-1">
            <FormTextarea label="Add a note" bind:value={note} rows={2}
                          placeholder="Recorded against this complaint, permanently" />
          </div>
          <div class="pb-4">
            <Button variant="secondary" size="small" disabled={saving || !note.trim()}
                    on:click={() => { dispatch('note', note.trim()); note = ''; }}>
              Add note
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <ConfirmDialog
    show={!!pendingTransition}
    title={pendingTransition ? `${moveTo(pendingTransition)?.label ?? statusMeta(pendingTransition).label}?` : ''}
    message={pendingTransition === STATUS.WITHDRAWN
      ? 'The complainant withdrew this. It stays on the record and cannot be moved again.'
      : pendingTransition === STATUS.ESCALATED
        ? 'Record that this went to the Building Safety Regulator. It stays on the record and cannot be moved again.'
        : `This is recorded on the timeline and cannot be undone, only moved on from.`}
    confirmText="Confirm"
    danger={pendingTransition === STATUS.WITHDRAWN || pendingTransition === STATUS.ESCALATED}
    processing={saving}
    on:confirm={confirmTransition}
    on:cancel={() => pendingTransition = null}
  />
{/if}
