<!-- src/lib/apps/golden_thread/components/GtRiskHeatmap.svelte -->
<!-- Fire × structural 5×5 risk heat-map (FR-RISK-009). One grid per domain:
     rows = impact (5→1), cols = likelihood (1→5); each cell counts active risks
     at that score, coloured by band; a ⚠ marks cells holding a live-escalated
     risk. Clicking a cell emits `cell` so the parent can filter the list. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { scoreBand, liveRating, RISK_DOMAIN_LABELS } from '$lib/apps/golden_thread/utils/gtRiskScoring.js';

  export let risks = [];
  export let alertsByRisk = {};

  const dispatch = createEventDispatcher();
  const scale = [1, 2, 3, 4, 5];
  const impactRows = [5, 4, 3, 2, 1];

  // Only active risks contribute to the live picture.
  $: active = risks.filter((r) => r.status !== 'closed' && r.status !== 'superseded');
  const domains = ['fire', 'structural'];

  // Tailwind bg per band (heat-map cells use solid fills).
  const CELL = { low: 'bg-green-700/70', medium: 'bg-amber-700/70', high: 'bg-orange-700/80', very_high: 'bg-red-800/80' };

  function cellRisks(domain, likelihood, impact) {
    return active.filter((r) => r.domain === domain && r.likelihood === likelihood && r.impact === impact);
  }
  function cellEscalated(rs) {
    return rs.some((r) => liveRating(r, alertsByRisk[r.id] ?? {}).escalated);
  }
</script>

<div class="grid gap-6 lg:grid-cols-2">
  {#each domains as domain}
    {@const dcount = active.filter((r) => r.domain === domain).length}
    <div>
      <p class="text-sm font-semibold text-slate-200 mb-2">{RISK_DOMAIN_LABELS[domain]} <span class="text-slate-500 font-normal">({dcount})</span></p>
      <div class="flex gap-1">
        <!-- Impact axis label -->
        <div class="flex items-center"><span class="text-[10px] text-slate-500 -rotate-90 whitespace-nowrap">Impact →</span></div>
        <div class="flex-1">
          {#each impactRows as impact}
            <div class="flex gap-1 mb-1">
              <div class="w-4 flex items-center justify-center text-[10px] text-slate-500">{impact}</div>
              {#each scale as likelihood}
                {@const rs = cellRisks(domain, likelihood, impact)}
                {@const band = scoreBand(likelihood * impact)}
                <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                <div
                  class="flex-1 aspect-square rounded flex items-center justify-center text-xs font-bold text-white cursor-pointer
                         {CELL[band.band]} {rs.length === 0 ? 'opacity-30' : 'hover:ring-2 hover:ring-white/40'}"
                  title="{RISK_DOMAIN_LABELS[domain]} · L{likelihood}×I{impact} = {likelihood * impact} ({band.label}) · {rs.length} risk(s)"
                  on:click={() => rs.length && dispatch('cell', { domain, likelihood, impact, risks: rs })}
                >
                  {#if rs.length}{rs.length}{#if cellEscalated(rs)}<span class="ml-0.5">⚠</span>{/if}{/if}
                </div>
              {/each}
            </div>
          {/each}
          <!-- Likelihood axis -->
          <div class="flex gap-1 mt-0.5">
            <div class="w-4"></div>
            {#each scale as likelihood}<div class="flex-1 text-center text-[10px] text-slate-500">{likelihood}</div>{/each}
          </div>
          <p class="text-[10px] text-slate-500 text-center mt-0.5">Likelihood →</p>
        </div>
      </div>
    </div>
  {/each}
</div>
