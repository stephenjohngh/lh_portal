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
  import ComplaintTimeline from './ComplaintTimeline.svelte';
  import ComplaintActions from './ComplaintActions.svelte';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { fmtDateTime, fmtDate, today } from '#lib/utils/dates.js';
  import { statusMeta, blockedReason, moveConfirmation, STATUS } from '../utils/complaintLifecycle.js';
  import { categoryLabel, channelLabel, complainantLabel,
           OUTCOMES, asOptions } from '../utils/complaintOptions.js';

  /** @type {any} */ export let complaint;
  /** @type {any[]} */ export let timeline = [];
  export let canEdit = false;
  /** The complaint's follow-up actions (complaint_actions). */
  export let actions = [];
  export let saving = false;
  export let isAdmin = false;
  /** The complaint's workflow item (migration 252); null until the workflow is set up. */
  /** @type {any} */ export let item = null;
  /** The workflow, its steps and moves. */
  /** @type {any} */ export let workflow = null;
  /** @type {any[]} */ export let steps = [];
  /** @type {any[]} */ export let wfMoves = [];
  /** The workflow's fields (migration 254 — any process may have them). @type {any[]} */ export let fields = [];
  /** Who it may be given to, everyone's names by id, and the viewer. */
  /** @type {Array<{ id: string, full_name: string|null }>} */ export let assignees = [];
  /** @type {Record<string, string>} */ export let nameById = {};
  /** @type {string|null} */ export let me = null;
  /** The change itself, through the store (its timeline entry, its reload). */
  /** @type {(move: any, note: string) => Promise<any>} */ export let onMove;
  /** @type {(userId: string|null) => Promise<any>} */ export let onAssign;
  /** @type {() => Promise<any>} */ export let onFieldsSaved = async () => {};

  const dispatch = createEventDispatcher();

  let note = '';
  let responseDraft = '';
  let outcomeDraft = '';

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

  /** The response draft is what `blockedReason` should judge, not the saved value. */
  $: probe = { ...complaint, response_text: responseDraft };
  /** s.93's own reason a move cannot be made yet, before the workflow's. */
  $: extraRefusal = (/** @type {any} */ m) => blockedReason(probe, m.to_key);
  /** Every move is asked first; responding or closing also says if they have not been told of the right to escalate. */
  $: confirmMove = (/** @type {any} */ m) => moveConfirmation(m, complaint);
  $: audit = complaint ? { appId: 'complaints', entityType: 'complaint', entityId: complaint.id } : null;
  $: record = complaint ? {
    filenameStem: `${complaint.reference}_${today()}`,
    subject: () => ({
      title: `Building safety complaint ${complaint.reference}`,
      facts: [['Reference', complaint.reference], ['Received', fmtDateTime(complaint.received_at)],
        ['About', categoryLabel(complaint.category)], ['Came in by', channelLabel(complaint.channel)],
        ['In scope', complaint.in_scope ? 'Yes' : 'No'], ['Complainant', complaint.complainant_name || 'Not given'],
        ['They are', complainantLabel(complaint.complainant_type)], ['Reply to', complaint.complainant_contact || ''],
        ['Flat / area', complaint.dwelling_ref || ''],
        ['Told of the right to escalate', complaint.escalation_told_at ? fmtDate(complaint.escalation_told_at) : 'Not recorded']],
      sections: [{ heading: 'Subject', text: complaint.subject }, { heading: 'What was said', text: complaint.description },
        { heading: 'Response', text: complaint.response_text }],
    }),
  } : null;
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
    </div>

    <WorkflowItemControls {item} {workflow} {steps} moves={wfMoves} reference={complaint.reference} {isAdmin} {canEdit} {me}
      {fields} {assignees} {nameById} {onMove} {onAssign} {onFieldsSaved} {extraRefusal} {confirmMove} {audit} {record} showHistory={false}
      finishedText="Nothing further happens to a complaint in this state.">
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

    </WorkflowItemControls>

    <ComplaintActions caseId={complaint.id} {actions} {canEdit} {isAdmin} />

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

{/if}
