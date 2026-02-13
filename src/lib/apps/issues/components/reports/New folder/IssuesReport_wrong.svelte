<!-- src/lib/apps/issues/components/reports/IssuesReport.svelte -->
<!-- Updated to show issue numbers in report -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import { ISSUE_STATUS } from '$lib/utils/constants';

  export let show = false;
  export let issues = [];

  const dispatch = createEventDispatcher();

  // Group issues by status
  $: currentIssues = issues.filter(i => i.status === ISSUE_STATUS.CURRENT || !i.status);
  $: parkedIssues = issues.filter(i => i.status === ISSUE_STATUS.PARKED);
  $: completedIssues = issues.filter(i => i.status === ISSUE_STATUS.COMPLETED);

  // Statistics
  $: stats = {
    total: issues.length,
    current: currentIssues.length,
    parked: parkedIssues.length,
    completed: completedIssues.length,
    withComments: issues.filter(i => i.issue_comments?.length > 0).length,
    withActions: issues.filter(i => i.issue_actions?.length > 0).length
  };

  function handleClose() {
    show = false;
    dispatch('close');
  }

  function handlePrint() {
    window.print();
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
  }

  // Format issue title with number
  function formatIssueTitle(issue) {
    return issue.issue_number 
      ? `#${issue.issue_number}) ${issue.name}`
      : issue.name;
  }
</script>

<Modal
  bind:show
  title="Issues Report"
  size="xlarge"
  on:close={handleClose}
>
  <div class="form-spacing print:text-black print:bg-white">
    <!-- Summary Statistics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 print:border print:border-gray-300 print:p-4">
      <div class="bg-slate-700/50 rounded-lg p-4 print:bg-white">
        <div class="text-2xl font-bold">{stats.total}</div>
        <div class="text-muted-sm print:text-gray-600">Total Issues</div>
      </div>
      <div class="bg-blue-500/10 rounded-lg p-4 print:bg-white">
        <div class="text-2xl font-bold text-blue-400 print:text-black">{stats.current}</div>
        <div class="text-muted-sm print:text-gray-600">Current</div>
      </div>
      <div class="bg-amber-500/10 rounded-lg p-4 print:bg-white">
        <div class="text-2xl font-bold text-amber-400 print:text-black">{stats.parked}</div>
        <div class="text-muted-sm print:text-gray-600">Parked</div>
      </div>
      <div class="bg-green-500/10 rounded-lg p-4 print:bg-white">
        <div class="text-2xl font-bold text-green-400 print:text-black">{stats.completed}</div>
        <div class="text-muted-sm print:text-gray-600">Completed</div>
      </div>
    </div>

    <!-- Current Issues -->
    {#if currentIssues.length > 0}
      <div>
        <h3 class="heading-section print:text-black">Current Issues ({currentIssues.length})</h3>
        <div class="space-y-2">
          {#each currentIssues as issue}
            <div class="bg-slate-700/50 rounded-lg p-3 print:bg-white print:border print:border-gray-300">
              <div class="flex-start mb-2">
                <div class="flex-1">
                  <div class="flex-row mb-1">
                    {#if issue.issue_number}
                      <span class="text-sm font-mono text-purple-400 font-semibold print:text-black">
                        #{issue.issue_number})
                      </span>
                    {/if}
                    <h4 class="font-semibold print:text-black">{issue.name}</h4>
                  </div>
                  {#if issue.description}
                    <p class="text-muted-sm print:text-gray-700">{issue.description}</p>
                  {/if}
                </div>
                <Badge color="bg-blue-600" className="print:bg-gray-200 print:text-black">Current</Badge>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-sm print:text-gray-600">
                <div class="flex-row">
                  <Icon name="user" size={3} />
                  <span>{issue.created_by_profile?.full_name || 'Deleted User'}</span>
                </div>
                <div class="flex-row">
                  <Icon name="calendar" size={3} />
                  <span>{formatDate(issue.created_at)}</span>
                </div>
                {#if issue.issue_comments?.length > 0}
                  <div class="flex-row">
                    <Icon name="message" size={3} />
                    <span>{issue.issue_comments.length} comment{issue.issue_comments.length !== 1 ? 's' : ''}</span>
                  </div>
                {/if}
                {#if issue.issue_actions?.length > 0}
                  <div class="flex-row">
                    <Icon name="clipboard" size={3} />
                    <span>{issue.issue_actions.length} action{issue.issue_actions.length !== 1 ? 's' : ''}</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Parked Issues -->
    {#if parkedIssues.length > 0}
      <div class="print:page-break-before">
        <h3 class="heading-section print:text-black">Parked Issues ({parkedIssues.length})</h3>
        <div class="space-y-2">
          {#each parkedIssues as issue}
            <div class="bg-slate-700/50 rounded-lg p-3 print:bg-white print:border print:border-gray-300">
              <div class="flex-start mb-2">
                <div class="flex-1">
                  <div class="flex-row mb-1">
                    {#if issue.issue_number}
                      <span class="text-sm font-mono text-purple-400 font-semibold print:text-black">
                        #{issue.issue_number})
                      </span>
                    {/if}
                    <h4 class="font-semibold print:text-black">{issue.name}</h4>
                  </div>
                  {#if issue.description}
                    <p class="text-muted-sm print:text-gray-700">{issue.description}</p>
                  {/if}
                </div>
                <Badge color="bg-amber-600" className="print:bg-gray-200 print:text-black">Parked</Badge>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-sm print:text-gray-600">
                <div class="flex-row">
                  <Icon name="user" size={3} />
                  <span>{issue.created_by_profile?.full_name || 'Deleted User'}</span>
                </div>
                <div class="flex-row">
                  <Icon name="calendar" size={3} />
                  <span>{formatDate(issue.created_at)}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Completed Issues -->
    {#if completedIssues.length > 0}
      <div class="print:page-break-before">
        <h3 class="heading-section print:text-black">Completed Issues ({completedIssues.length})</h3>
        <div class="space-y-2">
          {#each completedIssues as issue}
            <div class="bg-slate-700/50 rounded-lg p-3 print:bg-white print:border print:border-gray-300">
              <div class="flex-start mb-2">
                <div class="flex-1">
                  <div class="flex-row mb-1">
                    {#if issue.issue_number}
                      <span class="text-sm font-mono text-purple-400 font-semibold print:text-black">
                        #{issue.issue_number})
                      </span>
                    {/if}
                    <h4 class="font-semibold print:text-black">{issue.name}</h4>
                  </div>
                  {#if issue.description}
                    <p class="text-muted-sm print:text-gray-700">{issue.description}</p>
                  {/if}
                </div>
                <Badge color="bg-green-600" className="print:bg-gray-200 print:text-black">Completed</Badge>
              </div>
              <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-sm print:text-gray-600">
                <div class="flex-row">
                  <Icon name="user" size={3} />
                  <span>{issue.created_by_profile?.full_name || 'Deleted User'}</span>
                </div>
                <div class="flex-row">
                  <Icon name="calendar" size={3} />
                  <span>{formatDate(issue.created_at)}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Report Footer -->
    <div class="text-center text-muted-sm print:text-gray-600 print:mt-8">
      Generated on {new Date().toLocaleString()}
    </div>
  </div>

  <!-- Footer Buttons -->
  <div slot="footer" class="flex space-x-3 print:hidden">
    <Button
      variant="secondary"
      size="large"
      icon="printer"
      on:click={handlePrint}
    >
      Print Report
    </Button>
    <Button
      variant="primary"
      size="large"
      on:click={handleClose}
    >
      Close
    </Button>
  </div>
</Modal>

<style>
  @media print {
    :global(body) {
      background: white;
    }
  }
</style>
