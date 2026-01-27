<!-- src/lib/components/reports/ReportIssueSection.svelte -->
<script>
  import ReportIssueCard from './ReportIssueCard.svelte';
  import { STATUS_COLORS } from './reportUtils';

  export let issues = [];
  export let title = '';
  export let statusType = 'current'; // 'current', 'parked', or 'completed'

  const colors = STATUS_COLORS[statusType];
</script>

{#if issues.length > 0}
  <div>
    <h2 class="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b-2 {colors.barColor}">
      {title} ({issues.length})
    </h2>
    <div class="space-y-4">
      {#each issues as issue, index}
        <ReportIssueCard 
          {issue}
          index={index + 1}
          {statusType}
        />
      {/each}
    </div>
  </div>
{/if}
