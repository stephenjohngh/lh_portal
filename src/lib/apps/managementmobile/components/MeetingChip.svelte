<script>
  // src/lib/apps/managementmobile/components/MeetingChip.svelte
  // Small read-only badge shown on an issue that's tagged to a meeting.
  // Tapping opens that meeting (dispatches 'open' with the meeting id).
  import { createEventDispatcher } from 'svelte';
  import { fmtDate } from '$lib/utils/dates.js';

  export let meeting = null;   // resolved meeting row, or null

  const dispatch = createEventDispatcher();
</script>

{#if meeting}
  <button
    class="mchip"
    class:open={meeting.status === 'open'}
    on:click|stopPropagation={() => dispatch('open', meeting.id)}
    title="{meeting.title} · {fmtDate(meeting.meeting_date)}"
  >
    🗓 {fmtDate(meeting.meeting_date)}{#if meeting.status === 'open'} · open{/if}
  </button>
{/if}

<style>
  .mchip {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: #1e1a3a;
    color: #a5b4fc;
    border: 1px solid #2e2a5a;
    cursor: pointer;
    white-space: nowrap;
    touch-action: manipulation;
    flex-shrink: 0;
  }
  .mchip.open { border-color: #f59e0b55; color: #fbbf24; background: #2a200a; }
</style>
