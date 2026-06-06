<!-- src/lib/apps/mor/components/CaseCard.svelte -->
<!-- Summary row in the case list. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import {
    STATUS_LABEL, STATUS_COLOUR,
    MECHANISM_LABEL, MECHANISM_COLOUR,
    bsrReportClock, BSR_TRACK_STATUSES,
  } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDate } from '$lib/utils/dates';

  export let c; // mor_cases row

  const dispatch = createEventDispatcher();

  $: bsrClock = BSR_TRACK_STATUSES.has(c.status) && !c.bsr_report_submitted_at
    ? bsrReportClock(c.identification_date)
    : null;

  function bsrClockClass(status) {
    if (status === 'breach')   return 'text-red-400 font-bold';
    if (status === 'critical') return 'text-red-300 font-semibold';
    if (status === 'warning')  return 'text-amber-300';
    return 'text-slate-400';
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div
  class="bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600
         rounded-lg p-4 cursor-pointer transition-colors"
  on:click={() => dispatch('select', c)}
>
  <div class="flex flex-wrap items-start gap-2 mb-2">
    <!-- Reference + urgency -->
    <div class="flex items-center gap-2 min-w-0">
      {#if c.urgency}
        <span class="text-red-400 text-sm font-bold shrink-0" title="Urgent">⚠</span>
      {/if}
      <span class="font-mono text-sm font-semibold text-white">{c.reference}</span>
    </div>

    <div class="flex flex-wrap gap-1.5 ml-auto shrink-0">
      <Badge bgClass={STATUS_COLOUR[c.status] ?? 'bg-slate-600'}>
        {STATUS_LABEL[c.status] ?? c.status}
      </Badge>
      {#if c.mechanism && c.mechanism !== 'unknown'}
        <Badge bgClass={MECHANISM_COLOUR[c.mechanism]}>
          {MECHANISM_LABEL[c.mechanism]}
        </Badge>
      {/if}
    </div>
  </div>

  <p class="text-sm text-slate-300 line-clamp-2 mb-2">{c.description}</p>

  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
    <span>Identified: {fmtDate(c.identification_date)}</span>
    {#if c.location_text}
      <span>· {c.location_text}</span>
    {/if}
    {#if c.created_by_profile?.full_name}
      <span>· Logged by {c.created_by_profile.full_name}</span>
    {/if}
    <!-- 10-day BSR clock badge -->
    {#if bsrClock}
      <span class="ml-auto {bsrClockClass(bsrClock.status)}">
        BSR: {bsrClock.label}
      </span>
    {/if}
  </div>
</div>

<style>
  .bg-slate-750 { background-color: #2a3344; }
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
