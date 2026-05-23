<!-- ComponentInspectionHistory.svelte -->
<!-- Displays the last 5 inspection records for a component, including
     a per-attribute pass/fail chip row sourced from each inspection's
     checklist_results JSONB. Loads its own data via api.js when
     componentId changes. Purely presentational — no mutations. -->
<script>
  import { api }                          from '$lib/utils/api';
  import { fmtDateTime }                  from '$lib/utils/dates.js';
  import { sec }                          from '../ui.js';
  import { statusBadgeCls }               from '$lib/utils/resultConstants.js';
  import { buildingAssetsStore }          from '../stores/buildingAssetsStore.js';
  import { typeByCode, conditionChecklistDisplay } from '../lookups.js';
  import ConditionChecklistChips          from './ConditionChecklistChips.svelte';

  export let componentId;   // string | null
  /** Optional — when provided, used to look up the type's condition defs
      so each row can show a per-attribute chip breakdown. */
  export let typeCode = null;

  let recentInspections  = [];
  let loadingInspections = false;

  // Condition defs for this component's type — derived from the store
  // so we don't need the parent to pass attrDefs in.
  $: conditionDefs = (() => {
    if (!typeCode) return [];
    const t = typeByCode($buildingAssetsStore.types, typeCode);
    return t ? ($buildingAssetsStore.attrDefs[t.id] ?? []) : [];
  })();

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

  // Border colours per status, used alongside the shared badge class
  const STATUS_BORDER = { ok: 'border-green-700/40', failed: 'border-red-700/40', problem: 'border-amber-700/40' };
  function resultBadgeClass(r) {
    return `${statusBadgeCls(r)} ${STATUS_BORDER[r] ?? 'border-slate-600/40'}`;
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
        {@const items = conditionChecklistDisplay(insp, conditionDefs)}
        <div class="border border-slate-700/60 rounded-lg p-3 bg-slate-800/50 space-y-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs text-slate-400 tabular-nums">{fmtDateTime(insp.inspected_at)}</span>
            <span class="text-xs px-2 py-0.5 rounded border font-medium {resultBadgeClass(insp.inspection_result)}">
              {resultText(insp.inspection_result)}
            </span>
          </div>
          {#if items.length > 0}
            <ConditionChecklistChips {items} size="xs" />
          {/if}
          {#if insp.inspector_notes}
            <p class="text-sm text-slate-300 whitespace-pre-line leading-relaxed">{insp.inspector_notes}</p>
          {:else}
            <p class="text-xs text-slate-600 italic">No notes recorded</p>
          {/if}
          {#if insp.photo_urls?.length > 0}
            <div class="flex flex-wrap gap-1 pt-1">
              {#each insp.photo_urls as url, i (url)}
                <a href={url} target="_blank" rel="noopener noreferrer"
                   class="block w-10 h-10 rounded overflow-hidden border border-slate-600/60
                          hover:border-slate-400 transition-colors shrink-0"
                   title="Photo {i + 1} of {insp.photo_urls.length}"
                >
                  <img src={url} alt="Inspection {i + 1}" class="w-full h-full object-cover" />
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
