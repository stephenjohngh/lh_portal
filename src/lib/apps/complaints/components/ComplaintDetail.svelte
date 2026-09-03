<!-- src/lib/apps/complaints/components/ComplaintDetail.svelte -->
<!-- One complaint: what it is, where it has got to, and the only moves that are
     legal from here.

     The buttons are built from the state machine rather than written out, so
     the interface cannot offer something the database will refuse — and where a
     move is legal but not yet possible (responding with no response written) it
     is shown DISABLED with the reason, rather than hidden. A control that
     vanishes leaves somebody wondering where it went. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import FormTextarea  from '$lib/components/common/FormTextarea.svelte';
  import FormSelect    from '$lib/components/common/FormSelect.svelte';
  import Badge         from '$lib/components/common/Badge.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import ComplaintTimeline from './ComplaintTimeline.svelte';
  import { fmtDateTime, fmtDate } from '$lib/utils/dates';
  import { statusMeta, nextStatuses, blockedReason, STATUS } from '../utils/complaintLifecycle.js';
  import { categoryLabel, channelLabel, complainantLabel,
           OUTCOMES, asOptions } from '../utils/complaintOptions.js';

  export let complaint;
  export let timeline = [];
  export let canEdit = false;
  export let saving = false;

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
  $: moves = nextStatuses(complaint?.status);

  /** The response draft is what `blockedReason` should judge, not the saved value. */
  $: probe = { ...complaint, response_text: responseDraft };

  function requestTransition(to) {
    const why = blockedReason(probe, to);
    if (why) return;
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
      <div>
        <p class="text-slate-500">Assigned to</p>
        <p class="text-slate-300">{complaint.assigned_to_profile?.full_name ?? 'Nobody'}</p>
      </div>
    </div>

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
      <div class="border-t border-slate-700 pt-3 space-y-2">
        <FormTextarea label="Note to record with this step (optional)"
                      bind:value={note} rows={2}
                      placeholder="What was done, or why" />
        <div class="flex flex-wrap gap-2">
          {#each moves as to}
            {@const why = blockedReason(probe, to)}
            {#if to === STATUS.CLOSED || to === STATUS.ESCALATED}
              <ProtectedButton requireAdmin={true} variant="secondary" size="small"
                               disabled={saving || !!why} title={why ?? ''}
                               on:click={() => requestTransition(to)}>
                {statusMeta(to).label}
              </ProtectedButton>
            {:else}
              <Button variant="secondary" size="small"
                      disabled={saving || !!why} title={why ?? ''}
                      on:click={() => requestTransition(to)}>
                {statusMeta(to).label}
              </Button>
            {/if}
          {/each}
        </div>
        {#each moves as to}
          {@const why = blockedReason(probe, to)}
          {#if why}
            <p class="text-[11px] text-amber-400/90">{statusMeta(to).label}: {why}</p>
          {/if}
        {/each}
      </div>
    {:else if moves.length === 0}
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
    title={pendingTransition ? `Move to ${statusMeta(pendingTransition).label}?` : ''}
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
