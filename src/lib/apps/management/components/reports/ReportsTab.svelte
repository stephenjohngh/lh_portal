<!-- src/lib/apps/issues/components/reports/ReportsTab.svelte -->
<!--
  Reports tab shell for the Issues app.
  Three sub-reports — each has a left filter panel + right live preview + Word doc download.
    Issues Report      — filtered issue list with comments and outstanding actions
    Actions Report     — outstanding / all actions filterable by assignee and status
    Meeting Minutes    — per-meeting minutes with attendees and tagged items
-->
<script>
  import IssuesReportPanel         from './IssuesReportPanel.svelte';
  import ActionsReportPanel        from './ActionsReportPanel.svelte';
  import MeetingMinutesReportPanel from './MeetingMinutesReportPanel.svelte';

  export let issues = [];

  let activeReport = 'issues'; // 'issues' | 'actions' | 'minutes'

  const tabs = [
    { id: 'issues',  label: 'Issues Report'    },
    { id: 'actions', label: 'Actions Report'   },
    { id: 'minutes', label: 'Meeting Minutes'  },
  ];
</script>

<div class="flex flex-col" style="height: calc(100vh - 260px); min-height: 500px;">

  <!-- Sub-tab bar -->
  <div class="flex border-b border-slate-700 shrink-0">
    {#each tabs as tab}
      <button
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
               {activeReport === tab.id
                 ? 'text-white border-purple-500'
                 : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-600'}"
        on:click={() => activeReport = tab.id}
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Active panel — fills remaining height with independent scrolling -->
  <div class="flex-1 min-h-0 overflow-hidden">
    {#if activeReport === 'issues'}
      <IssuesReportPanel {issues} />
    {:else if activeReport === 'actions'}
      <ActionsReportPanel {issues} />
    {:else if activeReport === 'minutes'}
      <MeetingMinutesReportPanel {issues} />
    {/if}
  </div>

</div>
