<!-- src/lib/apps/issues/components/meetings/MeetingBadge.svelte -->
<!--
  Small inline chip rendered next to an item's metadata when it carries
  a meeting_id. Resolves the id against the meetings list to show
  "🗓 30 Apr · team_progress" with the full title in the tooltip.

  Click → dispatches 'click' (parent sets meetingFilterId).
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { meetingsStore } from '../../stores/meetingsStore';
  import { fmtDate, fmtDateLong } from '$lib/utils/dates';

  export let meetingId = null;

  const dispatch = createEventDispatcher();

  $: meeting = meetingId
    ? $meetingsStore.list.find(m => m.id === meetingId) ?? null
    : null;

  $: tooltip = meeting
    ? `${meeting.title}\n${fmtDateLong(meeting.meeting_date)} · ${meeting.meeting_type}\n(click to filter)`
    : '';
</script>

{#if meeting}
  <button
    type="button"
    on:click|stopPropagation={() => dispatch('click', meetingId)}
    class="text-[11px] px-1.5 py-0.5 rounded
           bg-purple-600/20 text-purple-200 border border-purple-500/40
           hover:bg-purple-600/30 hover:border-purple-400/60
           transition-colors leading-none flex items-center gap-1"
    title={tooltip}
  >
    🗓 {fmtDate(meeting.meeting_date)} · {meeting.meeting_type}
  </button>
{/if}
