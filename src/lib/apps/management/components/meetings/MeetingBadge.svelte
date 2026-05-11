<!-- src/lib/apps/management/components/meetings/MeetingBadge.svelte -->
<!--
  Inline chip shown when an item carries a meeting_id.
  Clicking opens a small menu:
    – All users:   "Jump to meeting"
    – Admins only: "Remove tag"  (only when rowId + rowTable props provided)

  Props:
    meetingId  — required, the UUID to resolve
    rowId      — optional: the row to untag (activity.id / action.id / issue.id)
    rowTable   — optional: 'activities' | 'actions' | 'issues'
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { meetingsStore } from '../../stores/meetingsStore';
  import { issuesStore }   from '../../stores/issuesStore';
  import { permissions }   from '$lib/stores/permissions';
  import { fmtDate, fmtDateLong } from '$lib/utils/dates';

  export let meetingId = null;
  export let rowId     = null;   // row to untag; omit on read-only badge usages
  export let rowTable  = null;   // 'activities' | 'actions' | 'issues'

  const dispatch = createEventDispatcher();

  $: meeting  = meetingId
    ? $meetingsStore.list.find(m => m.id === meetingId) ?? null
    : null;

  $: canUntag = $permissions.isAdmin && !!rowId && !!rowTable;

  let menuOpen  = false;
  let untagging = false;

  function toggle(e) {
    e.stopPropagation();
    menuOpen = !menuOpen;
  }

  function handleJump(e) {
    e.stopPropagation();
    menuOpen = false;
    dispatch('click', meetingId);
  }

  async function handleUntag(e) {
    e.stopPropagation();
    menuOpen = false;
    untagging = true;
    const result = await meetingsStore.untagItem(rowTable, rowId);
    if (result.success) await issuesStore.fetchIssues();
    untagging = false;
  }
</script>

<!-- Close menu on any outside click -->
<svelte:window on:click={() => { if (menuOpen) menuOpen = false; }} />

{#if meeting}
  <div class="relative inline-block">

    <button
      type="button"
      on:click={toggle}
      disabled={untagging}
      title="🗓 {meeting.title} · {fmtDateLong(meeting.meeting_date)}"
      class="text-[11px] px-1.5 py-0.5 rounded
             bg-purple-600/20 text-purple-200 border border-purple-500/40
             hover:bg-purple-600/30 hover:border-purple-400/60
             transition-colors leading-none flex items-center gap-1
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      🗓 {fmtDate(meeting.meeting_date)} · {meeting.meeting_type}{#if untagging}&nbsp;…{/if}
    </button>

    {#if menuOpen}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="absolute left-0 top-full mt-1 z-50 min-w-[11rem]
               bg-slate-800 border border-slate-600 rounded shadow-xl overflow-hidden"
        on:click|stopPropagation
      >
        <button
          type="button"
          class="w-full text-left px-3 py-2 text-sm text-slate-200
                 hover:bg-slate-700 flex items-center gap-2"
          on:click={handleJump}
        >
          🗓 Jump to meeting
        </button>
        {#if canUntag}
          <button
            type="button"
            class="w-full text-left px-3 py-2 text-sm text-red-300
                   hover:bg-red-900/30 border-t border-slate-700 flex items-center gap-2"
            on:click={handleUntag}
          >
            ✕ Remove tag
          </button>
        {/if}
      </div>
    {/if}

  </div>
{/if}
