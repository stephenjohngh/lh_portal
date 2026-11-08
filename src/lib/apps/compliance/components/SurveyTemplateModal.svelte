<!-- src/lib/apps/compliance/components/SurveyTemplateModal.svelte
     Compliance → Inspection walks → Survey template (admin only).
     Downloads the spreadsheet an outside surveyor fills in for one planned
     obligation: one row ready for each component in its scope, columns from each
     type's own checks. docs/requirements/unbuilt/Survey_Load_Spec.md §4.
     Built in the browser, from what the page already holds. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import Modal        from '#lib/components/common/Modal.svelte';
  import Button       from '#lib/components/common/Button.svelte';
  import FormSelect   from '#lib/components/common/FormSelect.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import { buildingAssetsStore } from '#lib/apps/building_assets/stores/buildingAssetsStore.js';
  import { surveyTemplateModel, buildSurveyTemplateWorkbook, surveyTemplateFilename } from '#lib/apps/inspection/utils/surveyTemplate.js';
  import { downloadBlob } from '#lib/utils/download.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { today } from '#lib/utils/dates.js';

  const dispatch = createEventDispatcher();

  /** Walk-evidenced planned obligations, in display order. */
  export let obligations = [];

  let chosenId = obligations.length === 1 ? obligations[0].id : '';
  let working  = '';
  let error    = '';

  $: options = obligations.map((o) => ({ value: o.id, label: o.active ? o.name : `${o.name} (switched off)` }));

  async function download() {
    const obligation = obligations.find((o) => o.id === chosenId);
    error = '';
    try {
      working = 'Reading the components…';
      if (!get(buildingAssetsStore).floors.length) await buildingAssetsStore.load();
      // Read afresh every time: a copy loaded earlier in the page is stale after a load
      // or an undo, and the preview would then predict the statuses wrongly (2026-11-08).
      await buildingAssetsStore.loadComponents();
      const bas = get(buildingAssetsStore);
      if (!bas.components.length) throw new Error(bas.error || 'the components could not be read');

      const result = surveyTemplateModel({
        obligation, components: bas.components, types: bas.types, floors: bas.floors,
        attrDefs: bas.attrDefs, componentAttrs: bas.componentAttrs, inspections: bas.inspections,
      });
      if (!result.ok) { error = result.reason; return; }

      working = 'Building the spreadsheet…';
      const buffer = await buildSurveyTemplateWorkbook(result.model);
      downloadBlob(new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }), surveyTemplateFilename(result.model, today()));

      logAudit('export', 'survey_template', obligation.id, obligation.name, {
        appId: 'compliance', eventCategory: 'compliance', severity: 'info',
        afterData: { components: result.model.sheets.reduce((n, s) => n + s.rows.length, 0) },
      });
      dispatch('close');
    } catch (/** @type {any} */ err) {
      error = `The template could not be made: ${errMessage(err)}`;
    } finally {
      working = '';
    }
  }
</script>

<Modal show title="Survey template" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-4">
    <p class="text-sm text-slate-300">
      The spreadsheet a contractor's survey is converted into before it is loaded. It has one row ready
      for each component the planned obligation covers, and a column for each of its checks, worded as on
      a walk. Copy their findings across, then use <strong>Load a survey</strong>.
    </p>

    {#if obligations.length === 0}
      <p class="text-sm text-amber-300">No planned obligation is carried out by inspection walk, so there is nothing to make a template for.</p>
    {:else}
      <FormSelect label="Planned obligation" id="survey-template-obligation" bind:value={chosenId}
        {options} placeholder="Choose one…" />
    {/if}

    {#if error}<ErrorDisplay message={error} onDismiss={() => error = ''} />{/if}
    {#if working}<p class="text-sm text-slate-400">{working}</p>{/if}

    <div class="flex justify-end gap-2">
      <Button variant="secondary" on:click={() => dispatch('close')}>Cancel</Button>
      <Button variant="primary" icon="download" disabled={!chosenId || !!working} on:click={download}>
        Download template
      </Button>
    </div>
  </div>
</Modal>
