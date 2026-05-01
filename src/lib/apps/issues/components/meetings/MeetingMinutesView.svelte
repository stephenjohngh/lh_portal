<!-- src/lib/apps/issues/components/meetings/MeetingMinutesView.svelte -->
<!--
  Read-only "minutes" view rendered while the issues list is filtered
  to a specific meeting.

  For each issue that has any meeting-tagged content:
    - Header line: "#<issue_number> — <name>"  (plus 🆕 if the issue
      itself was created during this meeting).
    - Actions added during the meeting (each as one line, expanded).
    - Comments added during the meeting (each as one line, expanded).

  No edit/delete affordances, no full IssueCard chrome — just enough
  detail to read or print as minutes.
-->
<script>
  import { fmtDate, fmtDateLong, fmtDateTime } from '$lib/utils/dates';
  import Button from '$lib/components/common/Button.svelte';

  export let meeting = null;     // the meeting being viewed
  export let issues  = [];       // already filtered to this meeting's issues

  // Build the rendered list — for each issue, extract just the items
  // tagged to this meeting. Issues that lose all their meeting items
  // (and weren't themselves created during the meeting) drop out.
  $: minutes = (() => {
    if (!meeting) return [];
    const id = meeting.id;
    const out = [];
    for (const issue of issues) {
      const meetingActions  = (issue.actions  || []).filter(a => a.meeting_id === id);
      const meetingComments = (issue.comments || []).filter(c => c.meeting_id === id);
      const isNew           = issue.meeting_id === id;
      if (!isNew && meetingActions.length === 0 && meetingComments.length === 0) continue;
      out.push({ issue, isNew, actions: meetingActions, comments: meetingComments });
    }
    // Stable sort: new issues first, then by issue_number ascending
    out.sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
    });
    return out;
  })();

  $: totals = minutes.reduce(
    (acc, m) => ({
      issues:   acc.issues   + (m.isNew ? 1 : 0),
      actions:  acc.actions  + m.actions.length,
      comments: acc.comments + m.comments.length
    }),
    { issues: 0, actions: 0, comments: 0 }
  );

  function fmtParticipantsSummary(p) {
    const names = (p?.profile_ids ?? []).length;
    const ext   = (p?.extras      ?? []).length;
    if (!names && !ext) return null;
    return [
      names && `${names} user${names === 1 ? '' : 's'}`,
      ext   && `${ext} external`
    ].filter(Boolean).join(', ');
  }

  $: participantsSummary = fmtParticipantsSummary(meeting?.participants);

  function printMinutes() {
    window.print();
  }
</script>

{#if meeting}
  <div class="bg-slate-800/50 rounded-xl border border-slate-700 p-6 mb-4 minutes-view">

    <!-- ─── Heading ────────────────────────────────────────────── -->
    <div class="flex items-start justify-between gap-3 flex-wrap mb-4 pb-4 border-b border-slate-700">
      <div class="flex-1 min-w-0">
        <p class="text-xs uppercase tracking-wide text-purple-300/70 font-semibold mb-1">Meeting minutes</p>
        <h2 class="text-2xl font-bold text-white">{meeting.title}</h2>
        <p class="text-sm text-slate-400 mt-0.5">
          {fmtDateLong(meeting.meeting_date)} · {meeting.meeting_type}
          {#if meeting.status === 'open'}
            · <span class="text-amber-300">currently open</span>
          {/if}
        </p>
        {#if participantsSummary}
          <p class="text-xs text-slate-500 mt-1">👥 {participantsSummary}</p>
        {/if}
        {#if meeting.notes}
          <p class="text-sm text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed">{meeting.notes}</p>
        {/if}
        <p class="text-xs text-slate-500 mt-2">
          {totals.issues} new issue{totals.issues === 1 ? '' : 's'}
          · {totals.actions} action{totals.actions === 1 ? '' : 's'}
          · {totals.comments} comment{totals.comments === 1 ? '' : 's'}
        </p>
      </div>

      <Button
        variant="secondary"
        size="small"
        icon="download"
        on:click={printMinutes}
        className="print:hidden"
      >
        Print
      </Button>
    </div>

    <!-- ─── Per-issue sections ─────────────────────────────────── -->
    {#if minutes.length === 0}
      <p class="text-sm text-slate-500 italic">No items tagged to this meeting yet.</p>
    {:else}
      <div class="space-y-5">
        {#each minutes as m (m.issue.id)}
          <section class="border-l-2 border-purple-500/40 pl-4">
            <!-- Issue header line -->
            <h3 class="text-base font-semibold text-white flex items-baseline gap-2 flex-wrap">
              {#if m.issue.issue_number}
                <span class="text-slate-400 font-mono">#{m.issue.issue_number}</span>
              {/if}
              <span>{m.issue.name}</span>
              {#if m.isNew}
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-normal">
                  🆕 New issue
                </span>
              {/if}
            </h3>

            {#if m.actions.length > 0}
              <p class="text-xs uppercase tracking-wide text-amber-400/80 font-semibold mt-3 mb-1.5">Actions</p>
              <ul class="space-y-1.5">
                {#each m.actions as a (a.id)}
                  <li class="flex items-start gap-2 text-sm">
                    <span class="text-amber-400 shrink-0 mt-0.5">•</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-slate-200 whitespace-pre-wrap">{a.action_text}</p>
                      <div class="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                        <span class="px-1.5 py-0.5 rounded bg-purple-600/15 text-purple-300 border border-purple-500/30 capitalize">
                          {a.status}
                        </span>
                        {#if a.name_text}
                          <span>👤 {a.name_text}</span>
                        {/if}
                        {#if a.date_deadline}
                          <span>📅 due {fmtDate(a.date_deadline)}</span>
                        {/if}
                        <span class="text-slate-600">added {fmtDateTime(a.created_at, a.created_by_profile?.full_name)}</span>
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}

            {#if m.comments.length > 0}
              <p class="text-xs uppercase tracking-wide text-blue-400/80 font-semibold mt-3 mb-1.5">Comments</p>
              <ul class="space-y-1.5">
                {#each m.comments as c (c.id)}
                  <li class="flex items-start gap-2 text-sm">
                    <span class="text-blue-400 shrink-0 mt-0.5">•</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-slate-200 whitespace-pre-wrap">{c.comment_text}</p>
                      <p class="text-xs text-slate-500 mt-0.5">
                        added {fmtDateTime(c.created_at, c.created_by_profile?.full_name)}
                        {#if c.historic}
                          · <span class="text-amber-400">historic</span>
                        {/if}
                      </p>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Print-friendly: drop the dark theme, expand everything to full width. */
  @media print {
    .minutes-view {
      background: white !important;
      color: black !important;
      border: none !important;
      padding: 0 !important;
    }
    .minutes-view :global(*) {
      color: black !important;
    }
    .minutes-view :global(.text-slate-400),
    .minutes-view :global(.text-slate-500),
    .minutes-view :global(.text-slate-600) {
      color: #555 !important;
    }
  }
</style>
