<!-- src/lib/apps/management/components/reports/ReportIssueCard.svelte -->
<script>
  import { getPriorityLabel, ACTION_STATUS, ACTIVITY_TYPE, ACTIVITY_TYPE_CONFIG } from '$lib/utils/constants';
  import { fmtDate, isOverdue, wasModified } from '$lib/utils/dates';
  import { buildFieldSummary, formatTimestamp, STATUS_COLORS } from './reportUtils';

  export let issue;
  export let statusType  = 'current';
  export let sortOrder   = 'desc'; // 'desc' = latest first, 'asc' = oldest first
  export let filterDate  = '';     // YYYY-MM-DD; activities before this date are hidden
  export let summaryOnly = false;  // show only the summary header; body hidden until expanded

  const colors = STATUS_COLORS[statusType];

  // Multiplier: 1 = oldest first (asc), -1 = newest first (desc)
  $: dir = sortOrder === 'asc' ? 1 : -1;

  // Timestamp for date comparison; null = no filter.
  $: filterDateTime = filterDate ? new Date(filterDate).getTime() : null;

  // All activities as a single chronological log, filtered by date.
  $: sortedActivities = (issue.activities || [])
    .filter(a => !filterDateTime || (a.created_at && new Date(a.created_at).getTime() >= filterDateTime))
    .slice()
    .sort((a, b) => dir * (new Date(a.created_at) - new Date(b.created_at)));

  // Actions: outstanding before completed; within each group sort by direction.
  $: sortedActions = (issue.outstandingActions || []).slice().sort((a, b) => {
    const aC = a.status === ACTION_STATUS.COMPLETED ? 1 : 0;
    const bC = b.status === ACTION_STATUS.COMPLETED ? 1 : 0;
    if (aC !== bC) return aC - bC;
    return dir * (new Date(a.created_at) - new Date(b.created_at));
  });

  // Fallback config for unknown/missing activity types.
  const FALLBACK_CFG = ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT];

  // Per-activity expand state for summaryOnly mode.
  // Activities with a non-empty summary header are collapsed by default;
  // clicking expand reveals the full body text.
  let expanded = {}; // { [activityId]: boolean }
  function toggleExpand(id) {
    expanded[id] = !expanded[id];
    expanded = expanded;
  }
</script>

<div class="border border-gray-300 rounded-lg overflow-hidden break-inside-avoid">
  <!-- Issue Header -->
  <div class="{colors.header} p-4 border-b {colors.border}">
    <div class="flex-start">
      <div class="flex-1">
        <div class="flex-row mb-2">
          <h3 class="text-lg font-bold text-gray-900">
            {#if issue.issue_number}
              {issue.issue_number}.
            {/if}
            {issue.name}
          </h3>
          <span class="badge {getPriorityLabel(issue.priority).color}">
            {getPriorityLabel(issue.priority).label}
          </span>
          {#if statusType === 'parked'}
            <span class="badge-amber">🅿️ Parked</span>
          {:else if statusType === 'completed'}
            <span class="badge-green">✓ Completed</span>
          {/if}
        </div>
        {#if issue.description}
          <p class="text-gray-700 text-sm whitespace-pre-wrap mb-2">{issue.description}</p>
        {/if}
        <div class="text-xs text-gray-600">
          Created: {formatTimestamp(issue.created_at, issue.updated_at)}
          • Priority: {issue.priority}
          {#if sortedActions.length > 0}
            • {sortedActions.length} {sortedActions.length === 1 ? 'action' : 'actions'}
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- ── Activity Log — all types, chronological ──────────────── -->
  {#if sortedActivities.length > 0}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <h4 class="font-semibold text-gray-900 mb-3 text-icon">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <span>Activity Log ({sortedActivities.length}):</span>
      </h4>
      <div class="section-spacing">
        {#each sortedActivities as activity}
          {@const cfg        = ACTIVITY_TYPE_CONFIG[activity.activity_type] ?? FALLBACK_CFG}
          {@const summary    = buildFieldSummary(activity.activity_type, activity.fields)}
          {@const hasSummary = !!summary}
          {@const isExpanded = expanded[activity.id] ?? false}
          <!-- In summaryOnly mode, body is hidden when a summary exists and the item is not expanded -->
          {@const showBody   = !summaryOnly || !hasSummary || isExpanded}

          {#if activity.historic}
            <!-- Historic entry: amber-tinted regardless of type -->
            <div class="p-3 bg-amber-50 rounded border border-amber-200">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300 font-semibold uppercase tracking-wide">Historic</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded {cfg.reportBadgeCls} border font-semibold uppercase tracking-wide">{cfg.icon} {cfg.label}</span>
                  {#if summary}
                    <span class="text-amber-700 text-[11px]">{summary}</span>
                  {/if}
                </div>
                {#if summaryOnly && hasSummary}
                  <button type="button" class="text-[10px] text-amber-600 hover:text-amber-800 underline shrink-0"
                    on:click={() => toggleExpand(activity.id)}>
                    {isExpanded ? 'collapse' : 'expand'}
                  </button>
                {/if}
              </div>
              {#if showBody}
                {#if activity.activity_type === ACTIVITY_TYPE.NOTE && activity.body?.startsWith('<')}
                  <div class="rich-content text-gray-500 text-sm italic">{@html activity.body}</div>
                {:else}
                  <p class="text-gray-500 text-sm italic whitespace-pre-wrap">{activity.body}</p>
                {/if}
              {/if}
              <p class="text-xs text-gray-400 mt-1">
                {fmtDate(activity.created_at)}
                {#if activity.created_by_profile?.full_name} · {activity.created_by_profile.full_name}{/if}
                {#if wasModified(activity.created_at, activity.updated_at)} · Modified: {fmtDate(activity.updated_at)}{/if}
              </p>
            </div>
          {:else}
            <!-- Normal entry: type-specific background -->
            <div class="{cfg.reportBg} rounded border {cfg.reportBorder} p-3">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span class="text-[10px] px-1.5 py-0.5 rounded {cfg.reportBadgeCls} border font-semibold uppercase tracking-wide">{cfg.icon} {cfg.label}</span>
                  {#if summary}
                    <span class="text-gray-700 text-[11px]">{summary}</span>
                  {/if}
                </div>
                {#if summaryOnly && hasSummary}
                  <button type="button" class="text-[10px] text-gray-400 hover:text-gray-600 underline shrink-0"
                    on:click={() => toggleExpand(activity.id)}>
                    {isExpanded ? 'collapse' : 'expand'}
                  </button>
                {/if}
              </div>
              {#if showBody}
                {#if activity.activity_type === ACTIVITY_TYPE.NOTE && activity.body?.startsWith('<')}
                  <div class="rich-content text-gray-900 text-sm">{@html activity.body}</div>
                {:else}
                  <p class="text-gray-900 text-sm whitespace-pre-wrap">{activity.body}</p>
                {/if}
              {/if}
              <p class="text-xs text-gray-500 mt-1">
                {fmtDate(activity.created_at)}
                {#if activity.created_by_profile?.full_name} · {activity.created_by_profile.full_name}{/if}
                {#if wasModified(activity.created_at, activity.updated_at)} · Modified: {fmtDate(activity.updated_at)}{/if}
              </p>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- ── Actions — separate section ────────────────────────────── -->
  {#if sortedActions.length > 0}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <h4 class="font-semibold text-gray-900 mb-3 text-icon">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <span>Actions:</span>
      </h4>
      <div class="section-spacing">
        {#each sortedActions as action}
          {#if action.status === ACTION_STATUS.COMPLETED}
            <div class="flex-row-md items-start p-3 bg-gray-100 rounded border border-gray-200 opacity-70">
              <div class="flex-shrink-0 mt-0.5">
                <svg class="w-5 h-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-gray-400 text-sm italic whitespace-pre-wrap">{action.action_text}</p>
                <div class="flex-row-wrap mt-2">
                  {#if action.name_text}
                    <span class="text-xs px-2 py-1 bg-gray-200 text-gray-500 rounded border border-gray-300">👤 {action.name_text}</span>
                  {/if}
                  {#if action.date_deadline}
                    <span class="text-xs px-2 py-1 bg-gray-200 text-gray-500 rounded border border-gray-300">📅 Due: {fmtDate(action.date_deadline)}</span>
                  {/if}
                  <span class="text-xs px-2 py-1 bg-green-100 text-green-600 rounded border border-green-200 capitalize">✓ Completed</span>
                </div>
                <p class="text-xs text-gray-400 mt-2">Added: {fmtDate(action.created_at)}</p>
              </div>
            </div>
          {:else}
            <div class="flex-row-md items-start p-3 bg-gray-50 rounded border border-gray-200">
              <div class="flex-shrink-0 mt-1">
                <div class="w-5 h-5 border-2 border-gray-400 rounded"></div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-gray-900 font-medium whitespace-pre-wrap">{action.action_text}</p>
                <div class="flex-row-wrap mt-2">
                  {#if action.name_text}
                    <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded border border-blue-200">👤 {action.name_text}</span>
                  {/if}
                  {#if action.date_deadline}
                    <span class="text-xs px-2 py-1 rounded border {isOverdue(action.date_deadline) ? 'bg-red-100 text-red-700 border-red-300 font-semibold' : 'bg-orange-100 text-orange-700 border-orange-200'}">
                      📅 Due: {fmtDate(action.date_deadline)}{#if isOverdue(action.date_deadline)} ⚠️{/if}
                    </span>
                  {/if}
                  <span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded border border-purple-200 capitalize">{action.status}</span>
                </div>
                <p class="text-xs text-gray-500 mt-2">Added: {fmtDate(action.created_at)}</p>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {:else if statusType !== 'completed'}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <p class="text-gray-500 text-sm italic">No actions</p>
    </div>
  {:else}
    <div class="p-4 bg-white border-t {colors.sectionBorder}">
      <p class="text-gray-500 text-sm italic">Issue completed</p>
    </div>
  {/if}
</div>
