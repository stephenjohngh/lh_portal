<!-- src/lib/components/reports/ReportIssueCard.svelte -->
<script>
  import { getPriorityLabel } from '$lib/utils/priorities';
  import { formatDate, isOverdue } from '$lib/utils/dates';
  import { formatTimestamp, STATUS_COLORS } from './reportUtils';

  export let issue;
  export let index;
  export let statusType = 'current'; // 'current', 'parked', or 'completed'

  const colors = STATUS_COLORS[statusType];
  
  // Sort comments by created_at (oldest first)
  $: sortedComments = (issue.comments || [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  
  // Sort outstanding actions by created_at (oldest first)
  $: sortedActions = (issue.outstandingActions || [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
</script>

<div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
  <!-- Issue Header -->
  <div class="{colors.header} p-4 border-b {colors.border}">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg font-bold text-gray-900">{index}.</span>
          <h3 class="text-lg font-bold text-gray-900">{issue.name}</h3>
          <span class="px-2 py-1 text-xs font-semibold text-white rounded {getPriorityLabel(issue.priority).color}">
            {getPriorityLabel(issue.priority).label}
          </span>
          {#if statusType === 'parked'}
            <span class="px-2 py-1 text-xs font-semibold bg-amber-600 text-white rounded">🅿️ Parked</span>
          {:else if statusType === 'completed'}
            <span class="px-2 py-1 text-xs font-semibold bg-green-600 text-white rounded">✓ Completed</span>
          {/if}
        </div>
        {#if issue.description}
          <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
        {/if}
        <div class="text-xs text-gray-600">
          Created: {formatTimestamp(issue.created_at, issue.updated_at)}
          • Priority: {issue.priority}
          {#if issue.outstandingActions?.length > 0}
            • {issue.outstandingActions.length} outstanding {issue.outstandingActions.length === 1 ? 'action' : 'actions'}
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Comments Section -->
  {#if sortedComments.length > 0}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <h4 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        Comments ({sortedComments.length}):
      </h4>
      <div class="space-y-2">
        {#each sortedComments as comment}
          <div class="p-3 bg-gray-50 rounded border border-gray-200">
            <p class="text-gray-900 text-sm whitespace-pre-wrap">{comment.comment_text}</p>
            <p class="text-xs text-gray-500 mt-1">
              Added: {formatDate(comment.created_at)}
              {#if comment.updated_at && new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 1000}
                • Modified: {formatDate(comment.updated_at)}
              {/if}
            </p>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Outstanding Actions Section -->
  {#if sortedActions.length > 0}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <h4 class="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        Outstanding Actions:
      </h4>
      <div class="space-y-2">
        {#each sortedActions as action}
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded border border-gray-200">
            <div class="flex-shrink-0 mt-1">
              <div class="w-5 h-5 border-2 border-gray-400 rounded"></div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-gray-900 font-medium whitespace-pre-wrap">{action.action_text}</p>
              <div class="flex flex-wrap gap-2 mt-2">
                {#if action.name_text}
                  <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded border border-blue-200">
                    👤 {action.name_text}
                  </span>
                {/if}
                {#if action.date_deadline}
                  <span class="text-xs px-2 py-1 rounded border {isOverdue(action.date_deadline) ? 'bg-red-100 text-red-700 border-red-300 font-semibold' : 'bg-orange-100 text-orange-700 border-orange-200'}">
                    📅 Due: {formatDate(action.date_deadline)}
                    {#if isOverdue(action.date_deadline)}⚠️{/if}
                  </span>
                {/if}
                <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200 capitalize">
                  {action.status}
                </span>
              </div>
              <p class="text-xs text-gray-500 mt-2">
                Added: {formatDate(action.created_at)}
                {#if action.updated_at && new Date(action.updated_at).getTime() - new Date(action.created_at).getTime() > 1000}
                  • Modified: {formatDate(action.updated_at)}
                {/if}
              </p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if statusType !== 'completed'}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <p class="text-gray-500 text-sm italic">No outstanding actions</p>
    </div>
  {:else}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <p class="text-gray-500 text-sm italic">Issue completed</p>
    </div>
  {/if}
</div>
