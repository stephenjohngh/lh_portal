<!-- ComponentInspectionHistory.svelte -->
<!-- Displays the last 5 inspection records for a component.
     Loads its own data via api.js when componentId changes.
     Purely presentational — no mutations. -->
<script>
  import { api }         from '$lib/utils/api';
  import { fmtDateTime } from '$lib/utils/dates.js';
  import { sec }         from '../ui.js';

  export let componentId;   // string | null

  let recentInspections  = [];
  let loadingInspections = false;

  // Reload whenever componentId changes
  $: if (componentId) loadInspectionHistory(componentId);

  async function loadInspectionHistory(id) {
    loadingInspections = true;
    recentInspections  = [];
    try {
      recentInspections = await api.get('component_inspections', {
        filters:   { component_id: id },
        orderBy:   'inspected_at',
        ascending: false,
        limit:     5,
      });
    } catch (_) {
      recentInspections = [];
    } finally {
      loadingInspections = false;
    }
  }

  function resultBadgeClass(r) {
    return r === 'ok'      ? 'bg-green-600/30 text-green-400 border-green-700/40'  :
           r === 'failed'  ? 'bg-red-600/30 text-red-400 border-red-700/40'        :
           r === 'problem' ? 'bg-amber-600/30 text-amber-400 border-amber-700/40'  :
                             'bg-slate-700/60 text-slate-400 border-slate-600/40';
  }

  function resultText(r) {
    return { ok: '✓ PASS', failed: '✗ FAIL', problem: '⚙ PROBLEM', inactive: '— INACTIVE' }[r]
      ?? (r ?? '—');
  }
</script>

<section class="border border-slate-700 rounded-lg p-4 bg-slate-800/30">
  <p class="{sec} mb-3">Inspection History</p>

  {#if loadingInspections}
    <p class="text-sm text-slate-500 italic">Loading…</p>

  {:else if recentInspections.length === 0}
    <p class="text-sm text-slate-500 italic">Not yet inspected.</p>

  {:else}
    <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
      {#each recentInspections as insp (insp.id)}
        <div class="border border-slate-700/60 rounded-lg p-3 bg-slate-800/50">
          <div class="flex items-center gap-2 flex-wrap mb-1.5">
            <span class="text-xs text-slate-400 tabular-nums">{fmtDateTime(insp.inspected_at)}</span>
            <span class="text-xs px-2 py-0.5 rounded border font-medium {resultBadgeClass(insp.inspection_result)}">
              {resultText(insp.inspection_result)}
            </span>
          </div>
          {#if insp.inspector_notes}
            <p class="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{insp.inspector_notes}</p>
          {:else}
            <p class="text-xs text-slate-600 italic">No notes recorded</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
