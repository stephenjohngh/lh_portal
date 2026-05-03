<!-- src/lib/apps/issues/components/reports/MeetingMinutesReportPanel.svelte -->
<script>
  import { onMount }     from 'svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import MeetingMinutesView from '../meetings/MeetingMinutesView.svelte';
  import { meetingsStore }  from '../../stores/meetingsStore';
  import { profiles, profilesStore } from '$lib/stores/profiles';
  import { fmtDate }     from '$lib/utils/dates';
  import { downloadResponse } from '$lib/utils/download';
  import { getLogger }   from '$lib/utils/logger';

  const logger = getLogger('MeetingMinutesReportPanel');

  export let issues = [];

  onMount(() => profilesStore.load());

  let selectedMeetingId = '';
  let isGenerating      = false;
  let downloadError     = '';

  // Auto-select the first (most recent) meeting
  $: if (!selectedMeetingId && $meetingsStore.list.length > 0) {
    selectedMeetingId = $meetingsStore.list[0].id;
  }

  $: selectedMeeting = selectedMeetingId
    ? ($meetingsStore.list.find(m => m.id === selectedMeetingId) ?? null)
    : null;

  $: meetingIssues = selectedMeeting
    ? issues.filter(issue =>
        issue.meeting_id === selectedMeeting.id ||
        (issue.comments || []).some(c => c.meeting_id === selectedMeeting.id) ||
        (issue.actions  || []).some(a => a.meeting_id === selectedMeeting.id)
      )
    : [];

  // Resolve attendee names (mirrors MeetingMinutesView logic)
  $: attendees = (() => {
    const p = selectedMeeting?.participants;
    if (!p) return [];
    const profileNames = (p.profile_ids ?? [])
      .map(id => $profiles.list.find(pr => pr.id === id)?.full_name)
      .filter(Boolean);
    return [...profileNames, ...(p.extras ?? [])];
  })();

  async function downloadWord() {
    if (!selectedMeeting) return;
    isGenerating  = true;
    downloadError = '';
    try {
      const response = await fetch('/api/reports/generate-minutes-docx', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting: selectedMeeting, issues: meetingIssues, attendees })
      });
      if (!response.ok) {
        const ct = response.headers.get('content-type');
        if (ct?.includes('application/json')) {
          const { error } = await response.json();
          throw new Error(error || 'Failed to generate document');
        }
        throw new Error(`Server error: ${response.status}`);
      }
      const safe     = (selectedMeeting.title ?? 'Minutes').replace(/[^a-zA-Z0-9]+/g, '_');
      const filename = `Minutes_${safe}_${new Date().toISOString().split('T')[0]}.docx`;
      await downloadResponse(response, filename);
      logger('✅ Downloaded:', filename);
    } catch (err) {
      logger('❌', err.message);
      downloadError = err.message;
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="flex h-full">

  <!-- ── Filter panel ── -->
  <aside class="w-64 shrink-0 border-r border-slate-700 bg-slate-800/60 p-5 flex flex-col gap-5 overflow-y-auto">

    <div>
      <p class="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Meeting</p>
      {#if $meetingsStore.list.length === 0}
        <p class="text-sm text-slate-500 italic">No meetings yet.</p>
      {:else}
        <select
          bind:value={selectedMeetingId}
          class="w-full px-2.5 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-sm"
        >
          {#each $meetingsStore.list as m (m.id)}
            <option value={m.id}>{m.title} ({fmtDate(m.meeting_date)})</option>
          {/each}
        </select>
      {/if}
    </div>

    {#if selectedMeeting}
      <div class="text-xs text-slate-400 space-y-1 leading-relaxed border border-slate-700 rounded-lg p-3 bg-slate-900/30">
        <p class="text-slate-300 font-medium">{selectedMeeting.meeting_type}</p>
        <p>{fmtDate(selectedMeeting.meeting_date)}</p>
        <p class="capitalize {selectedMeeting.status === 'open' ? 'text-amber-300' : 'text-slate-500'}">
          {selectedMeeting.status}
        </p>
        <p class="pt-1 border-t border-slate-700 text-slate-500">
          {meetingIssues.length} item{meetingIssues.length === 1 ? '' : 's'} tagged
        </p>
        {#if attendees.length > 0}
          <p class="text-slate-500">{attendees.length} attendee{attendees.length === 1 ? '' : 's'}</p>
        {/if}
      </div>
    {/if}

    <div class="mt-auto pt-4 border-t border-slate-700">
      <Button
        variant="primary"
        size="medium"
        icon="download"
        disabled={isGenerating || !selectedMeeting || meetingIssues.length === 0}
        on:click={downloadWord}
      >
        {isGenerating ? 'Generating…' : 'Download Word doc'}
      </Button>
      {#if downloadError}
        <p class="text-xs text-red-400 mt-2 break-words">{downloadError}</p>
      {/if}
    </div>
  </aside>

  <!-- ── Live preview (dark themed — matches MeetingMinutesView) ── -->
  <div class="flex-1 overflow-y-auto bg-slate-900 p-6">
    {#if selectedMeeting}
      <MeetingMinutesView meeting={selectedMeeting} issues={meetingIssues} />
    {:else}
      <div class="text-center py-16 text-slate-500 italic">
        Select a meeting from the left to preview its minutes.
      </div>
    {/if}
  </div>
</div>
