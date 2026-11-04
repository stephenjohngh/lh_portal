<!-- src/lib/apps/cases/components/CaseLatestChecks.svelte -->
<!-- The latest check of each component a case names (2026-11-04), read through
     Inspection's public.js, so the case says what was found without leaving it. -->
<script>
  import { latestInspectionOf } from '#lib/apps/inspection/public.js';
  import { fmtDateTime } from '#lib/utils/dates.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { resultLabel, noAccessReasonLabel } from '#lib/utils/resultConstants.js';

  /** @type {any[]} */ export let fields = [];
  /** The item's field values. @type {Record<string, any>} */ export let values = {};

  $: linked = fields.filter((f) => f.type === 'component' && values?.[f.key]).map((f) => ({ label: f.label, id: String(values[f.key]) }));
  // Keyed on the ids, never the object.
  $: key = linked.map((l) => l.id).join(',');
  let readFor = '';
  /** @type {Array<{ label: string, row: any }>} */ let checks = [];
  let error = '';
  $: if (key !== readFor) { readFor = key; read(); }
  async function read() {
    const asked = linked;
    error = '';
    try { checks = await Promise.all(asked.map(async (l) => ({ label: l.label, row: await latestInspectionOf(l.id) }))); }
    catch (/** @type {any} */ err) { checks = []; error = errMessage(err, 'The latest check could not be read.'); }
  }
  const words = (/** @type {any} */ r) => (r.inspection_result === 'no_access' && r.no_access_reason
    ? `${resultLabel(r.inspection_result)} (${noAccessReasonLabel(r.no_access_reason)})` : resultLabel(r.inspection_result));
</script>

{#if error}<p class="text-xs text-amber-300">{error}</p>{/if}
{#each checks as c (c.label)}
  <div class="border-t border-slate-700 pt-3 text-sm" data-testid="case-latest-check">
    <p class="text-xs text-slate-400">Latest check of {c.label}</p>
    {#if c.row}
      <p class="text-slate-200">{words(c.row)} · {fmtDateTime(c.row.inspected_at)}</p>
      {#if c.row.inspector_notes}<p class="text-slate-400 whitespace-pre-line">{c.row.inspector_notes}</p>{/if}
    {:else}
      <p class="text-slate-500">No check recorded.</p>
    {/if}
  </div>
{/each}
