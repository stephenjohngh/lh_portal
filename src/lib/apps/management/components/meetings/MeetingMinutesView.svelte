<!-- src/lib/apps/management/components/meetings/MeetingMinutesView.svelte -->
<!--
  Read-only "minutes" view rendered inside the Meetings tab when a
  meeting is selected.

  For each issue that has any meeting-tagged content:
    - Header: "#<issue_number> — <name>"  (🆕 if issue created this meeting)
    - Comments added during the meeting
    - Actions added during the meeting

  Attendees section shows all named attendees (resolved profiles +
  free-text extras). Print button produces a clean A4-ready printout.
-->
<script>
  import { onMount }              from 'svelte';
  import { fmtDate, fmtDateLong, fmtDateTime } from '$lib/utils/dates';
  import { profiles, profilesStore }           from '$lib/stores/profiles';
  import { buildFieldSummary }                 from '../reports/reportUtils.js';

  export let meeting = null;
  export let issues  = [];   // already filtered to this meeting's items

  onMount(() => profilesStore.load());

  // -- Build per-issue minutes entries ----------------------------------
  $: minutes = (() => {
    if (!meeting) return [];
    const id  = meeting.id;
    const out = [];
    for (const issue of issues) {
      const meetingActions   = (issue.actions    || []).filter(a => a.meeting_id === id);
      // Split activities by type for separate display sections
      const allActivities    = (issue.activities || []).filter(a => a.meeting_id === id);
      const meetingComments  = allActivities.filter(a => (a.activity_type ?? 'comment') === 'comment');
      const meetingDecisions = allActivities.filter(a => a.activity_type === 'decision');
      const meetingNotes     = allActivities.filter(a => a.activity_type === 'note');
      const meetingEmails    = allActivities.filter(a => a.activity_type === 'email');
      const meetingLetters   = allActivities.filter(a => a.activity_type === 'letter');
      const meetingDocuments = allActivities.filter(a => a.activity_type === 'document');
      const isNew            = issue.meeting_id === id;
      if (!isNew && meetingActions.length === 0 && allActivities.length === 0) continue;
      out.push({ issue, isNew, actions: meetingActions, comments: meetingComments, decisions: meetingDecisions, notes: meetingNotes, emails: meetingEmails, letters: meetingLetters, documents: meetingDocuments });
    }
    out.sort((a, b) => {
      const pa = a.issue.priority ?? 99;
      const pb = b.issue.priority ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.issue.issue_number ?? 0) - (b.issue.issue_number ?? 0);
    });
    return out;
  })();

  $: totals = minutes.reduce(
    (acc, m) => ({
      issues:    acc.issues    + (m.isNew ? 1 : 0),
      actions:   acc.actions   + m.actions.length,
      comments:  acc.comments  + m.comments.length,
      decisions: acc.decisions + m.decisions.length,
      notes:     acc.notes     + m.notes.length,
      emails:    acc.emails    + m.emails.length,
      letters:   acc.letters   + m.letters.length,
      documents: acc.documents + m.documents.length,
    }),
    { issues: 0, actions: 0, comments: 0, decisions: 0, notes: 0, emails: 0, letters: 0, documents: 0 }
  );

  // -- Resolve attendees to display names --------------------------------
  // participants = { profile_ids: uuid[], extras: text[] }
  $: attendees = (() => {
    const p = meeting?.participants;
    if (!p) return [];
    const profileNames = (p.profile_ids ?? [])
      .map(id => $profiles.list.find(pr => pr.id === id)?.full_name)
      .filter(Boolean);
    return [...profileNames, ...(p.extras ?? [])];
  })();


</script>

{#if meeting}
  <div class="minutes-view rounded-xl border border-slate-700 bg-slate-800/50 p-6 mb-4">

    <!-- ─── Heading ──────────────────────────────────────────────────── -->
    <div class="flex items-start justify-between gap-3 flex-wrap mb-5 pb-5 border-b border-slate-700">
      <div class="flex-1 min-w-0">
        <p class="text-xs uppercase tracking-wide text-purple-300/70 font-semibold mb-1">
          Meeting minutes
        </p>
        <h2 class="text-2xl font-bold text-white">{meeting.title}</h2>
        <p class="text-sm text-slate-400 mt-0.5">
          {fmtDateLong(meeting.meeting_date)} · {meeting.meeting_type}
          {#if meeting.status === 'open'}
            · <span class="text-amber-300">currently open</span>
          {/if}
        </p>

        <!-- Attendees — full list of names -->
        {#if attendees.length > 0}
          <div class="mt-2">
            <p class="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">
              Attendees
            </p>
            <div class="flex flex-wrap gap-1.5">
              {#each attendees as name}
                <span class="text-xs px-2 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-300">
                  {name}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        {#if meeting.notes}
          <p class="text-sm text-slate-300 mt-3 whitespace-pre-wrap leading-relaxed border-l-2 border-slate-600 pl-3 italic">
            {meeting.notes}
          </p>
        {/if}

        <p class="text-xs text-slate-500 mt-3">
          {totals.issues} new issue{totals.issues === 1 ? '' : 's'}
          · {totals.actions} action{totals.actions === 1 ? '' : 's'}
          · {totals.comments} comment{totals.comments === 1 ? '' : 's'}
          {#if totals.decisions > 0}
            · {totals.decisions} decision{totals.decisions === 1 ? '' : 's'}
          {/if}
          {#if totals.notes > 0}
            · {totals.notes} note{totals.notes === 1 ? '' : 's'}
          {/if}
          {#if totals.emails > 0}
            · {totals.emails} email{totals.emails === 1 ? '' : 's'}
          {/if}
          {#if totals.letters > 0}
            · {totals.letters} letter{totals.letters === 1 ? '' : 's'}
          {/if}
          {#if totals.documents > 0}
            · {totals.documents} document{totals.documents === 1 ? '' : 's'}
          {/if}
        </p>
      </div>

    </div>

    <!-- ─── Per-issue sections ─────────────────────────────────────── -->
    {#if minutes.length === 0}
      <p class="text-sm text-slate-500 italic">No items tagged to this meeting yet.</p>
    {:else}
      <div class="space-y-4">
        {#each minutes as m (m.issue.id)}
          <div class="rounded-lg border border-slate-600/70 bg-slate-900/40 overflow-hidden">

            <!-- Issue header bar -->
            <div class="bg-slate-700/50 border-b border-slate-600/60 px-4 py-3 flex items-baseline gap-2 flex-wrap">
              {#if m.issue.issue_number}
                <span class="text-slate-400 font-mono text-sm">#{m.issue.issue_number}</span>
              {/if}
              <h3 class="text-base font-semibold text-white flex-1">{m.issue.name}</h3>
              {#if m.isNew}
                <span class="text-[11px] px-1.5 py-0.5 rounded bg-emerald-600/20 text-emerald-300
                             border border-emerald-500/40 font-normal shrink-0">
                  🆕 New issue
                </span>
              {/if}
            </div>

            <!-- Issue body: comments then actions -->
            <div class="px-4 py-3 space-y-4">

              {#if m.comments.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-blue-400/80 font-semibold mb-2">
                    Comments
                  </p>
                  <ul class="space-y-2">
                    {#each m.comments as c (c.id)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-blue-400 shrink-0 mt-0.5">•</span>
                        <div class="flex-1 min-w-0">
                          {#if c.body?.startsWith('<')}
                            <div class="rich-content text-slate-200 text-sm">{@html c.body}</div>
                          {:else}
                            <p class="text-slate-200 text-sm whitespace-pre-wrap">{c.body}</p>
                          {/if}
                          <p class="text-xs text-slate-500 mt-0.5">
                            {fmtDateTime(c.created_at, c.created_by_profile?.full_name)}
                            {#if c.historic}
                              · <span class="text-amber-400">historic</span>
                            {/if}
                          </p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if m.decisions.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-violet-400/80 font-semibold mb-2">
                    Decisions
                  </p>
                  <ul class="space-y-2">
                    {#each m.decisions as d (d.id)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-violet-400 shrink-0 mt-0.5">•</span>
                        <div class="flex-1 min-w-0">
                          {#if d.body?.startsWith('<')}
                            <div class="rich-content text-slate-200 text-sm">{@html d.body}</div>
                          {:else}
                            <p class="text-slate-200 text-sm whitespace-pre-wrap">{d.body}</p>
                          {/if}
                          <p class="text-xs text-slate-500 mt-0.5">
                            {fmtDateTime(d.created_at, d.created_by_profile?.full_name)}
                            {#if d.historic}
                              · <span class="text-amber-400">historic</span>
                            {/if}
                          </p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if m.notes.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-teal-400/80 font-semibold mb-2">
                    Notes
                  </p>
                  <ul class="space-y-2">
                    {#each m.notes as n (n.id)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-teal-400 shrink-0 mt-0.5">📝</span>
                        <div class="flex-1 min-w-0">
                          {#if n.body?.startsWith('<')}
                            <div class="rich-content text-slate-200 text-sm">{@html n.body}</div>
                          {:else}
                            <p class="text-slate-200 text-sm whitespace-pre-wrap">{n.body}</p>
                          {/if}
                          <p class="text-xs text-slate-500 mt-0.5">
                            {fmtDateTime(n.created_at, n.created_by_profile?.full_name)}
                            {#if n.historic}
                              · <span class="text-amber-400">historic</span>
                            {/if}
                          </p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if m.emails.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-cyan-400/80 font-semibold mb-2">
                    Emails
                  </p>
                  <ul class="space-y-2">
                    {#each m.emails as e (e.id)}
                      {@const fieldSummary = buildFieldSummary('email', e.fields)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-cyan-400 shrink-0 mt-0.5">📧</span>
                        <div class="flex-1 min-w-0">
                          {#if e.body}
                            {#if e.body.startsWith('<')}
                              <div class="rich-content text-slate-200 text-sm">{@html e.body}</div>
                            {:else}
                              <p class="text-slate-200 text-sm whitespace-pre-wrap">{e.body}</p>
                            {/if}
                          {/if}
                          {#if fieldSummary}<p class="text-xs text-cyan-300/70 mt-0.5">{fieldSummary}</p>{/if}
                          <p class="text-xs text-slate-500 mt-0.5">
                            {fmtDateTime(e.created_at, e.created_by_profile?.full_name)}
                            {#if e.historic}
                              · <span class="text-amber-400">historic</span>
                            {/if}
                          </p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if m.letters.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-slate-300/80 font-semibold mb-2">
                    Letters
                  </p>
                  <ul class="space-y-2">
                    {#each m.letters as l (l.id)}
                      {@const fieldSummary = buildFieldSummary('letter', l.fields)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-slate-300 shrink-0 mt-0.5">📄</span>
                        <div class="flex-1 min-w-0">
                          {#if l.body}
                            {#if l.body.startsWith('<')}
                              <div class="rich-content text-slate-200 text-sm">{@html l.body}</div>
                            {:else}
                              <p class="text-slate-200 text-sm whitespace-pre-wrap">{l.body}</p>
                            {/if}
                          {/if}
                          {#if fieldSummary}<p class="text-xs text-slate-400/70 mt-0.5">{fieldSummary}</p>{/if}
                          <p class="text-xs text-slate-500 mt-0.5">
                            {fmtDateTime(l.created_at, l.created_by_profile?.full_name)}
                            {#if l.historic}
                              · <span class="text-amber-400">historic</span>
                            {/if}
                          </p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if m.documents.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-gray-300/80 font-semibold mb-2">
                    Documents
                  </p>
                  <ul class="space-y-2">
                    {#each m.documents as d (d.id)}
                      {@const fieldSummary = buildFieldSummary('document', d.fields)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-gray-300 shrink-0 mt-0.5">📎</span>
                        <div class="flex-1 min-w-0">
                          {#if (d.body || fieldSummary)?.startsWith('<')}
                            <div class="rich-content text-slate-200 text-sm">{@html d.body || fieldSummary}</div>
                          {:else}
                            <p class="text-slate-200 text-sm whitespace-pre-wrap">{d.body || fieldSummary}</p>
                          {/if}
                          <p class="text-xs text-slate-500 mt-0.5">
                            {fmtDateTime(d.created_at, d.created_by_profile?.full_name)}
                            {#if d.historic}
                              · <span class="text-amber-400">historic</span>
                            {/if}
                          </p>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if m.actions.length > 0}
                <div>
                  <p class="text-[11px] uppercase tracking-wide text-amber-400/80 font-semibold mb-2">
                    Actions
                  </p>
                  <ul class="space-y-2">
                    {#each m.actions as a (a.id)}
                      <li class="flex items-start gap-2 text-sm">
                        <span class="text-amber-400 shrink-0 mt-0.5">•</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-slate-200 whitespace-pre-wrap">{a.action_text}</p>
                          <div class="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                            <span class="px-1.5 py-0.5 rounded bg-purple-600/15 text-purple-300
                                         border border-purple-500/30 capitalize">
                              {a.status}
                            </span>
                            {#if a.name_text}
                              <span>👤 {a.name_text}</span>
                            {/if}
                            {#if a.date_deadline}
                              <span>📅 due {fmtDate(a.date_deadline)}</span>
                            {/if}
                            <span class="text-slate-600">
                              added {fmtDateTime(a.created_at, a.created_by_profile?.full_name)}
                            </span>
                          </div>
                        </div>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}

            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

