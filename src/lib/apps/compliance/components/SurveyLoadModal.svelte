<!-- src/lib/apps/compliance/components/SurveyLoadModal.svelte
     Compliance → Inspection walks → Load a survey (admin only).
     A contractor's report, converted by us into the portal's survey template, is
     checked row by row and shown before anything is saved. Then it is loaded as walk
     results, with the contractor's report and the file attached as the evidence.
     docs/requirements/unbuilt/Survey_Load_Spec.md §5. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import Modal          from '#lib/components/common/Modal.svelte';
  import Button         from '#lib/components/common/Button.svelte';
  import ErrorDisplay   from '#lib/components/common/ErrorDisplay.svelte';
  import DocAttachInput from '#lib/components/common/DocAttachInput.svelte';
  import { buildingAssetsStore } from '#lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { buildWalkComponentsFromScope } from '#lib/apps/inspection/utils/inspectionWalk.js';
  import { readSurveyWorkbook, checkSurvey, surveyDetails } from '#lib/apps/inspection/utils/surveyLoad.js';
  import { loadSurvey } from '#lib/apps/inspection/public.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { fmtDateOnly } from '#lib/utils/dates.js';
  import { policy } from '#lib/utils/policies.js';

  const dispatch = createEventDispatcher();

  /** Planned obligations (all of them; the file names its own). */
  export let obligations = [];

  /** @type {File|null} */ let file = null;
  /** @type {File|null} */ let report = null;
  /** @type {any} */ let checked = null;
  /** @type {any} */ let details = null;
  /** @type {any} */ let done = null;
  let working = '';
  let error   = '';

  $: maxBytes = policy('documentMaxMb') * 1024 * 1024;
  // A new file means a new check.
  $: if (file !== checkedFile) { checked = null; details = null; }
  /** @type {File|null} */ let checkedFile = null;

  async function check() {
    error = '';
    try {
      working = 'Reading the components…';
      if (!get(buildingAssetsStore).floors.length) await buildingAssetsStore.load();
      // Read afresh every time: a copy loaded earlier in the page is stale after a load
      // or an undo, and the preview would then predict the statuses wrongly (2026-11-08).
      await buildingAssetsStore.loadComponents();
      const bas = get(buildingAssetsStore);
      if (!bas.components.length) throw new Error(bas.error || 'the components could not be read');

      working = 'Reading the file…';
      const read = await readSurveyWorkbook(await file.arrayBuffer());
      const typeOf = (/** @type {any} */ c) => bas.types.find((t) => t.code === c.type_code);
      const ctx = { types: bas.types, attrDefs: bas.attrDefs, componentAttrs: bas.componentAttrs, inspections: bas.inspections };
      checked = checkSurvey(read, {
        obligations,
        scopeIdsFor: (o) => new Set(buildWalkComponentsFromScope(bas.components, o.scope ?? {}, ctx).map((c) => c.id)),
        componentById: new Map(bas.components.map((c) => [c.id, c])),
        defsFor: (c) => bas.attrDefs[typeOf(c)?.id] ?? [],
        componentAttrs: bas.componentAttrs,
      });
      details = surveyDetails(read.survey);
      checkedFile = file;
    } catch (/** @type {any} */ err) {
      error = `The file could not be read: ${errMessage(err)}. Is it a survey template from the portal?`;
    } finally {
      working = '';
    }
  }

  async function load() {
    error = '';
    try {
      working = 'Uploading the report and the file, then loading the results…';
      done = await loadSurvey({ file, report, details, rows: checked.rows });
      dispatch('loaded');
    } catch (/** @type {any} */ err) {
      error = `Nothing was loaded: ${errMessage(err)}`;
    } finally {
      working = '';
    }
  }

  $: s = checked?.summary;
  $: changes = Object.entries(s?.statusChanges ?? {});
  // The preview's figure: a status that stays the same but gains a date is not a change.
  $: changedCount = changes.reduce((n, [, k]) => n + Number(k), 0);
  $: canLoad = checked && !checked.refusals.length && checked.rows.length && report && !working && !done;
</script>

<Modal show title="Load a survey" size="large" on:close={() => dispatch('close')}>
  <div class="space-y-4 text-sm">
    {#if done}
      <p class="text-green-300">
        Loaded {done.rows} result{done.rows === 1 ? '' : 's'} from {details.firm}{details.reference ? ` (${details.reference})` : ''}.
        {changedCount} component status{changedCount === 1 ? '' : 'es'} changed.
        The survey shows in the list below as one session per survey day, and the report is attached to it.
      </p>
      <div class="flex justify-end"><Button variant="primary" on:click={() => dispatch('close')}>Close</Button></div>
    {:else}
      <p class="text-slate-300">
        Load a contractor's survey that has been converted into the portal's survey template. Every row is
        checked and shown here first; nothing is saved until you press <strong>Load</strong>. The contractor's own
        report is attached as the evidence.
      </p>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <p class="mb-1 text-slate-400">The filled-in survey template (.xlsx)</p>
          <DocAttachInput bind:file accept=".xlsx" {maxBytes} />
        </div>
        <div>
          <p class="mb-1 text-slate-400">The contractor's report</p>
          <DocAttachInput bind:file={report} {maxBytes} />
        </div>
      </div>

      {#if file && !checked}
        <div class="flex justify-end"><Button variant="primary" disabled={!!working} on:click={check}>Check the file</Button></div>
      {/if}

      {#if checked}
        {#if checked.obligation}
          <div class="rounded border border-slate-700 bg-slate-800/50 p-3 space-y-1">
            <p class="font-semibold text-white">{checked.obligation.name}</p>
            <p class="text-slate-300">
              {details.firm || 'No firm'}{details.reference ? ` · ${details.reference}` : ''}{details.lead_surveyor ? ` · ${details.lead_surveyor}` : ''}
              {#if details.report_file}· report: {details.report_file}{/if}
            </p>
            {#if s}
              <p class="text-slate-300">
                {s.rows} result{s.rows === 1 ? '' : 's'} over {s.days} day{s.days === 1 ? '' : 's'}
                {#if s.firstSeen}({fmtDateOnly(s.firstSeen)}{s.lastSeen !== s.firstSeen ? ` to ${fmtDateOnly(s.lastSeen)}` : ''}){/if}:
                {s.seen} seen, {s.noAccess} no access only. {s.notInFile} of the {s.inScope} covered {s.notInFile === 1 ? 'has' : 'have'} no row.
              </p>
              {#if changes.length}
                <p class="text-slate-300">Status changes: {changes.map(([k, n]) => `${n} ${k}`).join(' · ')}</p>
              {:else}
                <p class="text-slate-400">No component status would change.</p>
              {/if}
            {/if}
          </div>
        {/if}

        {#if checked.refusals.length}
          <div class="rounded border border-red-700/60 bg-red-900/20 p-3">
            <p class="font-semibold text-red-300">This file cannot be loaded. Correct it and check it again:</p>
            <ul class="mt-1 list-disc pl-5 text-red-200 max-h-60 overflow-y-auto">
              {#each checked.refusals as r}
                <li>{r.sheet ? `${r.sheet} row ${r.row}: ` : ''}{r.text}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if checked.warnings.length}
          <div class="rounded border border-amber-700/60 bg-amber-900/20 p-3">
            <p class="font-semibold text-amber-300">Check these before loading:</p>
            <ul class="mt-1 list-disc pl-5 text-amber-100 max-h-60 overflow-y-auto">
              {#each checked.warnings as w}<li>{w}</li>{/each}
            </ul>
          </div>
        {/if}

        {#if !checked.refusals.length && !report}
          <p class="text-amber-300">Attach the contractor's report before loading.</p>
        {/if}
      {/if}

      {#if error}<ErrorDisplay message={error} onDismiss={() => error = ''} />{/if}
      {#if working}<p class="text-slate-400">{working}</p>{/if}

      <div class="flex justify-end gap-2">
        <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
        <Button variant="primary" disabled={!canLoad} on:click={load}>
          {checked?.rows?.length ? `Load ${checked.rows.length} result${checked.rows.length === 1 ? '' : 's'}` : 'Load'}
        </Button>
      </div>
    {/if}
  </div>
</Modal>
