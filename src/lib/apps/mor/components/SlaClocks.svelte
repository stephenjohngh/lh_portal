<!-- src/lib/apps/mor/components/SlaClocks.svelte -->
<!-- Displays all SLA clocks for a case. The 10-day BSR clock is
     always shown prominently when the case is on the BSR track.
     A 60-second interval keeps the labels live while the user is
     looking at the page. -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { allSlaClocks, BSR_TRACK_STATUSES,
           clockBgClass, clockTextClass } from '$lib/apps/mor/utils/morHelpers';
  import { fmtDateTime } from '$lib/utils/dates';

  export let c; // mor_cases row

  // `tick` is used as a reactive trigger — bumping it forces clocks to
  // recompute against the current Date.now(). One tick per minute is enough
  // for an hour-level countdown and avoids unnecessary churn.
  let tick = 0;
  let intervalId = null;

  onMount(() => {
    intervalId = setInterval(() => tick++, 60_000);
  });
  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });

  // tick reference is intentional — it makes the reactive depend on it.
  $: clocks    = (tick, allSlaClocks(c));
  $: onBsrTrack = BSR_TRACK_STATUSES.has(c?.status);
  $: bsrClock   = clocks.find(cl => cl.id === 'bsr_report');
</script>

<div class="space-y-2">
  <!-- Statutory 10-day BSR clock — shown prominently on BSR track -->
  {#if onBsrTrack && bsrClock && !bsrClock.done}
    {@const cl = bsrClock.clock}
    {#if cl}
      <div class="rounded-lg border p-3 {clockBgClass(cl.status)}">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              ⚠ Statutory 10-day BSR report deadline
            </p>
            <p class="text-lg font-bold {clockTextClass(cl.status)} mt-0.5">
              {cl.label}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-slate-500">Deadline</p>
            <p class="text-xs {clockTextClass(cl.status)}">
              {fmtDateTime(cl.deadline.toISOString())}
            </p>
          </div>
        </div>
      </div>
    {:else}
      <!-- BSR report done -->
      <div class="rounded-lg border border-emerald-700/50 bg-emerald-900/20 p-3 flex items-center justify-between">
        <p class="text-sm text-emerald-300 font-medium">✓ BSR report submitted</p>
        <p class="text-xs text-slate-500">{fmtDateTime(bsrClock.doneAt)}</p>
      </div>
    {/if}
  {/if}

  <!-- Other SLA clocks (compact row) -->
  <div class="grid grid-cols-3 gap-2">
    {#each clocks.filter(cl => cl.id !== 'bsr_report') as item}
      <div class="rounded border p-2 text-center
                  {item.done ? 'border-slate-700 bg-slate-800/30' :
                   item.clock ? clockBgClass(item.clock.status) : 'border-slate-700 bg-slate-800/30'}">
        <p class="text-xs text-slate-500 mb-0.5">{item.label}</p>
        {#if item.done}
          <p class="text-xs text-emerald-400">✓ Done</p>
        {:else if item.clock}
          <p class="text-xs font-semibold {clockTextClass(item.clock.status)}">{item.clock.label}</p>
        {:else}
          <p class="text-xs text-slate-500">—</p>
        {/if}
      </div>
    {/each}
  </div>
</div>
