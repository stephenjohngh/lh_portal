<!-- src/lib/apps/building_assets/components/ComponentCases.svelte -->
<!-- The Cases that name this component (2026-11-04), read through cases/public.js.
     By reference, process and step only: a case's title may name a person. Shows
     nothing when there are none, or for someone without the Cases grant. -->
<script>
  import { listCasesForComponent } from '#lib/apps/cases/public.js';
  import { errMessage } from '#lib/utils/errors.js';

  /** @type {string|null} */ export let componentId = null;

  /** @type {Array<{ id: string, reference: string, process: string, step: string, finished: boolean }>} */
  let rows = [];
  let error = '';
  let readFor = '';
  $: if ((componentId ?? '') !== readFor) { readFor = componentId ?? ''; read(); }
  async function read() {
    const id = componentId;
    rows = []; error = '';
    if (!id) return;
    try {
      const found = await listCasesForComponent(id);
      if (id === componentId) rows = found;
    } catch (/** @type {any} */ err) { error = errMessage(err, 'The cases for this component could not be read.'); }
  }
</script>

{#if error}<p class="text-xs text-amber-300">{error}</p>{/if}
{#if rows.length}
  <div class="space-y-1" data-testid="component-cases">
    <p class="text-xs font-semibold text-slate-300 uppercase tracking-wide">Cases</p>
    {#each rows as r (r.id)}
      <p class="text-sm {r.finished ? 'text-slate-500' : 'text-slate-200'}">{r.reference} · {r.process} · {r.step}</p>
    {/each}
  </div>
{/if}
