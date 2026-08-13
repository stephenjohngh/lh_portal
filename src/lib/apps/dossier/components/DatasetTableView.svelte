<!-- src/lib/apps/dossier/components/DatasetTableView.svelte -->
<!-- A table, read-only — for the published reader and anywhere else a table is
     shown rather than edited.

     Renders through renderDatasetTableHtml(), the same function the editor's
     embedded-table node view and the read-mode block renderer call. Three
     surfaces, one definition of what a chronology looks like (merge doc D10). -->
<script>
  import { renderDatasetTableHtml } from '../utils/datasetRender.js';
  import '../dataset-table.css';

  export let dataset;
  export let records = [];
  /** The dataset title is usually already a page heading; off by default here. */
  export let heading = false;

  // Every value is escaped inside the renderer — these are author-typed cells.
  $: html = renderDatasetTableHtml(dataset, records, { heading });
</script>

<div class="dossier-prose">{@html html}</div>
