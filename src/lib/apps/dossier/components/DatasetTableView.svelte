<!-- src/lib/apps/dossier/components/DatasetTableView.svelte -->
<!-- A table, read-only — for the published reader and anywhere else a table is
     shown rather than edited.

     Renders through renderDatasetTableHtml(), the same function the editor's
     embedded-table node view and the read-mode block renderer call. Three
     surfaces, one definition of what a chronology looks like (merge doc D10). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { renderDatasetTableHtml } from '../utils/datasetRender.js';
  import '../dataset-table.css';

  export let dataset;
  export let records = [];
  /** The dataset title is usually already a page heading; off by default here. */
  export let heading = false;

  /**
   * Where a row's reference points. Supplying these draws a Detail column;
   * omitting them renders the table exactly as before.
   *
   * Without this a published pack silently dropped every row reference: the
   * author points a chronology entry at the page holding the detail, and the
   * recipient sees text with nothing to follow.
   */
  export let docs = [];
  export let files = [];
  export let assetBase = '';

  const dispatch = createEventDispatcher();

  // Every value is escaped inside the renderer — these are author-typed cells.
  $: html = renderDatasetTableHtml(dataset, records, {
    heading,
    links: { docs, files, assetBase },
  });

  /**
   * A page reference is an in-pack navigation, not a URL, so the anchor is a
   * placeholder and the click is caught here by delegation — the table is
   * injected as HTML and has no components to bind handlers to.
   */
  function handleClick(event) {
    const anchor = event.target instanceof Element
      ? event.target.closest('a[data-doc-id]') : null;
    if (!anchor) return;
    event.preventDefault();
    dispatch('openDoc', anchor.getAttribute('data-doc-id'));
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="dossier-prose" on:click={handleClick}>{@html html}</div>
