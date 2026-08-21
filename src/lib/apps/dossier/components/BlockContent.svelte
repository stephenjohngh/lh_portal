<!-- src/lib/apps/dossier/components/BlockContent.svelte -->
<!-- The shared renderer (merge doc §11, decision D10).
     ONE definition of how blocks look, used by both the authoring editor and
     the read-only view — so what the author sees is what the recipient gets.

     mode='edit'  → renders an empty host element for the caller to attach a
                    Tiptap Editor to (bind:host).
     mode='read'  → generates static, sanitised HTML from stored JSON.

     Both paths share this component's stylesheet and the `.dossier-prose`
     class, which is the whole point: the styles live here, once. When P3 adds
     the public reader it renders <BlockContent mode="read"> and inherits every
     rule below with no duplication. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { renderBlocksToHtml } from '../utils/blockRender.js';
  import { isEmptyDoc }         from '../utils/blockSchema.js';
  // Table styling is shared with DatasetTableView and the editor's node view,
  // so it lives in its own stylesheet rather than in this component's styles.
  import '../dataset-table.css';
  import '../block-reveal.css';

  /** Stored ProseMirror JSON (dossier_docs.blocks). Ignored in edit mode. */
  export let blocks = null;
  /** 'read' | 'edit' */
  export let mode = 'read';
  /** Edit mode only: bound to the element the caller attaches the Editor to. */
  export let host = null;
  /** The pack's pages — needed to resolve transclusions. Read mode only. */
  export let docs = [];
  /** The pack's shelf — lets a reference to a deleted file show as such. */
  export let files = [];
  /** The pack's tables and rows, so an embedded table renders in read mode. */
  export let datasets = [];
  export let records  = [];
  /**
   * Where a file's bytes come from. Empty means this app's own media proxy —
   * the authoring default. The published reader passes its token-scoped path,
   * so a recipient's asset request is checked against the publication manifest
   * instead of reaching the portal-wide proxy.
   */
  export let assetBase = '';

  const dispatch = createEventDispatcher();

  /**
   * A table row can reference another page. The table is injected as HTML, so
   * there is nothing to bind a handler to — the click is caught by delegation
   * and turned into an event the surrounding reader can navigate on. In the
   * editor no such anchors are rendered, so this never fires.
   */
  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const anchor = target.closest('a[data-doc-id], a[data-doc-slug]');
    if (anchor) {
      event.preventDefault();
      // The id where there is one; otherwise the slug, resolved against this
      // pack. A link pasted as markdown has only a slug — it cannot know an id
      // it has never seen — and a slug is a durable address here anyway, since
      // a page's slug deliberately survives a rename.
      const id = anchor.getAttribute('data-doc-id')
        ?? docs.find(d => d.slug === anchor.getAttribute('data-doc-slug'))?.id;
      if (id) dispatch('openDoc', id);
      return;
    }

    // A collapsible section. The author sets its state in the editor, which is
    // the DEFAULT the reader arrives at — but the reader must still be able to
    // open one, or a section the author happened to leave closed is content
    // nobody can reach. Deliberately NOT written back: this is how one reader
    // is looking at the page, not a change to the page.
    const summary = target.closest('div[data-toggle-summary]');
    const toggle = summary?.closest('div[data-toggle]');
    if (toggle) {
      toggle.setAttribute(
        'data-open', toggle.getAttribute('data-open') === 'false' ? 'true' : 'false');
    }
  }

  $: html = mode === 'read'
    ? renderBlocksToHtml(blocks, { docs, files, datasets, records, assetBase })
    : '';
  // Distinguish "nothing written yet" from "stored JSON we could not render".
  $: broken = mode === 'read' && html === '' && !isEmptyDoc(blocks);
</script>

{#if mode === 'edit'}
  <div bind:this={host}></div>
{:else if broken}
  <p class="text-sm text-amber-400/90">
    This page could not be displayed. Its content is stored but is not in a
    format this version can render.
  </p>
{:else if html === ''}
  <p class="text-sm text-slate-500">This page is empty.</p>
{:else}
  <!-- Sanitised in renderBlocksToHtml() with a Dossier-specific allow-list. -->
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="dossier-prose" on:click={handleClick}>{@html html}</div>
{/if}

<style>
  /* ProseMirror renders its own DOM, which Tailwind classes cannot reach —
     hence :global. Mirrors the approach in common/RichTextEditor.svelte.
     These rules are shared by BOTH modes; do not duplicate them elsewhere. */
  :global(.dossier-prose) {
    outline: none;
    color: #e2e8f0;              /* slate-200 */
    font-size: 0.9375rem;
    line-height: 1.7;
  }
  /* Edit mode only: a tall writing surface, so there is always somewhere to
     click below the last block. Read mode must NOT have this — a short page in
     a revision preview or a published pack should not carry 60vh of blank. */
  :global(.dossier-prose-editing) { min-height: 60vh; }

  :global(.dossier-prose p) { margin: 0 0 0.75rem 0; }
  /* A deliberate blank line must survive into read mode and onto paper.
     While editing, ProseMirror puts a trailing <br> inside an empty paragraph,
     so it occupies a line; generateHTML emits a bare <p></p>, which has no
     height and whose margins collapse with its neighbours' — so every blank
     line the author put in vanished from the preview and from the published
     pack. Giving it one line of height is what makes the two agree. */
  :global(.dossier-prose p:empty) { min-height: 1.7em; }
  :global(.dossier-prose h1) {
    font-size: 1.5rem; font-weight: 700; color: #fff;
    margin: 1.5rem 0 0.75rem; line-height: 1.3;
  }
  :global(.dossier-prose h2) {
    font-size: 1.2rem; font-weight: 650; color: #fff;
    margin: 1.25rem 0 0.5rem; line-height: 1.35;
  }
  :global(.dossier-prose h3) {
    font-size: 1.02rem; font-weight: 600; color: #f1f5f9;
    margin: 1rem 0 0.4rem;
  }
  :global(.dossier-prose h1:first-child),
  :global(.dossier-prose h2:first-child),
  :global(.dossier-prose h3:first-child) { margin-top: 0; }

  :global(.dossier-prose ul) { list-style: disc;    padding-left: 1.5rem; margin: 0 0 0.75rem; }
  :global(.dossier-prose ol) { list-style: decimal; padding-left: 1.5rem; margin: 0 0 0.75rem; }
  :global(.dossier-prose li) { margin: 0.15rem 0; }
  :global(.dossier-prose li p) { margin: 0; }

  :global(.dossier-prose blockquote) {
    border-left: 3px solid var(--lh-accent, #3c9683);
    padding-left: 0.9rem;
    margin: 0 0 0.75rem;
    color: #cbd5e1;              /* slate-300 */
    font-style: italic;
  }
  /* A table written INTO a page — pasted from markdown, or built in the editor.
     Distinct from .dossier-dataset, which is a whole stored table embedded by
     reference; this one is the page's own content and is styled to match it
     rather than to look like an embed.

     Scrolls rather than crushes, for the reason dataset-table.css explains at
     length: a table wider than its column has nowhere to go, and the browser
     squeezes the undeclared columns to nothing. */
  :global(.dossier-prose table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 1rem;
    font-size: 0.85rem;
    display: block;
    overflow-x: auto;
  }
  :global(.dossier-prose th),
  :global(.dossier-prose td) {
    border: 1px solid #334155;   /* slate-700 */
    padding: 0.4rem 0.6rem;
    text-align: left;
    vertical-align: top;
  }
  :global(.dossier-prose th) {
    background: #1e293b;         /* slate-800 */
    color: #f1f5f9;              /* slate-100 */
    font-weight: 600;
  }
  :global(.dossier-prose td) { color: #cbd5e1; }
  /* Cells hold paragraphs; their bottom margin would double every row's
     height. */
  :global(.dossier-prose th > p:last-child),
  :global(.dossier-prose td > p:last-child) { margin-bottom: 0; }
  /* ProseMirror's own cell-selection overlay — without a colour it is
     invisible, and a multi-cell selection looks like nothing happened. */
  :global(.dossier-prose .selectedCell:after) {
    background: rgb(var(--lh-accent-rgb, 60 150 131) / 0.18);
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2;
  }
  :global(.dossier-prose td),
  :global(.dossier-prose th) { position: relative; }

  :global(.dossier-prose hr) {
    border: 0;
    border-top: 1px solid #334155;   /* slate-700 */
    margin: 1.5rem 0;
  }
  :global(.dossier-prose code) {
    background: #1e293b; border-radius: 3px;
    padding: 0.1em 0.35em; font-size: 0.875em;
  }
  :global(.dossier-prose pre) {
    background: #0f172a; border: 1px solid #1e293b; border-radius: 6px;
    padding: 0.75rem 0.9rem; margin: 0 0 0.75rem; overflow-x: auto;
  }
  :global(.dossier-prose pre code) { background: none; padding: 0; }
  :global(.dossier-prose a) { color: var(--lh-accent, #3c9683); text-decoration: underline; }

  /* ── Callout ───────────────────────────────────────────────────────────── */
  /* The icon is drawn here from data-variant, so the node itself stays a plain
     declarative spec that the read mode renders without any editor code. */
  :global(.dossier-prose div[data-callout]) {
    position: relative;
    border-radius: 6px;
    border: 1px solid;
    padding: 0.7rem 0.9rem 0.7rem 2.4rem;
    margin: 0 0 0.85rem;
  }
  :global(.dossier-prose div[data-callout]::before) {
    position: absolute;
    left: 0.8rem;
    top: 0.65rem;
    font-size: 0.95rem;
    line-height: 1.3;
  }
  :global(.dossier-prose div[data-callout] > :last-child) { margin-bottom: 0; }

  :global(.dossier-prose div[data-variant='info']) {
    background: rgb(59 130 246 / 0.08);
    border-color: rgb(59 130 246 / 0.35);
  }
  :global(.dossier-prose div[data-variant='info']::before)    { content: 'ℹ'; }

  :global(.dossier-prose div[data-variant='warning']) {
    background: rgb(245 158 11 / 0.08);
    border-color: rgb(245 158 11 / 0.35);
  }
  :global(.dossier-prose div[data-variant='warning']::before) { content: '⚠'; }

  :global(.dossier-prose div[data-variant='success']) {
    background: rgb(34 197 94 / 0.08);
    border-color: rgb(34 197 94 / 0.35);
  }
  :global(.dossier-prose div[data-variant='success']::before) { content: '✅'; }

  /* ── Toggle ────────────────────────────────────────────────────────────── */
  :global(.dossier-prose .dossier-toggle),
  :global(.dossier-prose div[data-toggle]) {
    position: relative;
    padding-left: 1.4rem;
    margin: 0 0 0.75rem;
  }
  :global(.dossier-prose .dossier-toggle-chevron) {
    position: absolute;
    left: 0;
    top: 0.28rem;
    width: 1.1rem;
    height: 1.1rem;
    font-size: 0.6rem;
    line-height: 1;
    color: #94a3b8;                  /* slate-400 */
    background: none;
    border: 0;
    cursor: pointer;
    user-select: none;
  }
  :global(.dossier-prose .dossier-toggle-chevron:hover) { color: #e2e8f0; }

  :global(.dossier-prose div[data-toggle-summary]) {
    font-weight: 600;
    color: #f1f5f9;
    min-height: 1.5rem;
  }
  /* Collapsed hides only the body — the summary line stays visible. In read
     mode there is no node view, so the marker sits on the node's own element. */
  :global(.dossier-prose .dossier-toggle[data-open='false'] div[data-toggle-body]),
  :global(.dossier-prose div[data-toggle][data-open='false'] div[data-toggle-body]) {
    display: none;
  }
  :global(.dossier-prose div[data-toggle-body]) {
    margin-top: 0.35rem;
    border-left: 1px solid #334155;  /* slate-700 */
    padding-left: 0.75rem;
  }
  :global(.dossier-prose div[data-toggle-body] > :last-child) { margin-bottom: 0; }

  /* ── Cross-links ───────────────────────────────────────────────────────── */
  /* Visually distinct from an external link: a reference to another page in the
     same pack is navigation, not a departure. */
  :global(.dossier-prose a.dossier-doclink) {
    color: #e2e8f0;                  /* slate-200 */
    text-decoration: none;
    border-bottom: 1px solid rgb(var(--lh-accent-rgb, 60 150 131) / 0.6);
    padding-bottom: 1px;
    cursor: pointer;
  }
  :global(.dossier-prose a.dossier-doclink:hover) {
    color: #fff;
    border-bottom-color: var(--lh-accent, #3c9683);
  }
  :global(.dossier-prose a.dossier-doclink::before) {
    content: '¶';
    font-size: 0.75em;
    color: var(--lh-accent, #3c9683);
    margin-right: 0.15em;
    vertical-align: 0.05em;
  }

  /* ── Embedded pages ────────────────────────────────────────────────────── */
  /* Visibly a quotation of another page, not part of this one — otherwise a
     reader cannot tell whose words they are looking at. */
  :global(.dossier-prose .dossier-embed) {
    border: 1px solid #334155;       /* slate-700 */
    border-left: 3px solid var(--lh-accent, #3c9683);
    border-radius: 6px;
    padding: 0.7rem 0.9rem;
    margin: 0 0 0.9rem;
    background: rgb(15 23 42 / 0.35); /* slate-900 */
  }
  :global(.dossier-prose .dossier-embed-title) {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #94a3b8;                  /* slate-400 */
    margin-bottom: 0.4rem;
  }
  :global(.dossier-prose .dossier-embed-body > :last-child) { margin-bottom: 0; }
  :global(.dossier-prose .dossier-embed-summary) {
    font-size: 0.875rem;
    color: #cbd5e1;                  /* slate-300 */
  }
  :global(.dossier-prose .dossier-embed-note) {
    font-size: 0.8rem;
    color: #fbbf24;                  /* amber-400 */
  }
  /* An embed that could not be expanded reads as a warning, not as content. */
  :global(.dossier-prose .dossier-embed[data-embed-note]) {
    border-left-color: #f59e0b;      /* amber-500 */
  }
  /* Nested embeds step back so depth is legible at a glance. */
  :global(.dossier-prose .dossier-embed .dossier-embed) {
    background: transparent;
  }
  /* The editor's stand-in, which states what is embedded rather than showing it. */
  :global(.dossier-prose .dossier-embed-stub) {
    position: relative;
    user-select: none;
  }

  /* ── Spreadsheet previews ──────────────────────────────────────────────── */
  /* A bounded window onto a file, sitting above its card. Visually quieter
     than an embedded table: that IS the pack's content, this is a look at
     something that lives elsewhere. */
  :global(.dossier-prose .dossier-sheet) {
    border: 1px solid #334155;         /* slate-700 */
    border-radius: 6px 6px 0 0;
    border-bottom: 0;
    overflow-x: auto;                  /* a wide sheet scrolls itself */
  }
  :global(.dossier-prose .dossier-sheet-table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    white-space: nowrap;               /* a preview row stays one line */
  }
  :global(.dossier-prose .dossier-sheet-table th) {
    text-align: left;
    font-weight: 600;
    color: #94a3b8;                    /* slate-400 */
    background: #1e293b;               /* slate-800 */
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid #334155;
  }
  :global(.dossier-prose .dossier-sheet-table td) {
    padding: 0.3rem 0.6rem;
    color: #cbd5e1;                    /* slate-300 */
    border-bottom: 1px solid #1e293b;
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  :global(.dossier-prose .dossier-sheet-table tr:last-child td) { border-bottom: 0; }
  /* The line saying what is NOT shown. Not decoration — a reader who mistakes
     a 12-row window for the whole file may draw a conclusion it cannot carry. */
  :global(.dossier-prose .dossier-sheet-note) {
    padding: 0.35rem 0.6rem;
    font-size: 0.6875rem;
    color: #94a3b8;                    /* slate-400 */
    background: #0f172a;               /* slate-900 */
    border-top: 1px solid #1e293b;
    position: sticky;
    left: 0;                           /* stays put while the table scrolls */
  }

  /* ── Assets ────────────────────────────────────────────────────────────── */
  :global(.dossier-prose .dossier-asset) { margin: 0 0 0.9rem; }
  /* The card under a sheet preview joins onto it rather than floating free. */
  :global(.dossier-prose [data-kind='sheet'] .dossier-asset-card) {
    border-top-left-radius: 0;
    border-top-right-radius: 0;
  }

  :global(.dossier-prose .dossier-asset-image) {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    border: 1px solid #334155;       /* slate-700 */
  }
  /* Author-chosen preview width, as a share of the text column so it renders
     the same in the editor, in Preview and in a published pack. */
  :global(.dossier-prose [data-width='small']  .dossier-asset-image) { max-width: 25%; }
  :global(.dossier-prose [data-width='medium'] .dossier-asset-image) { max-width: 50%; }
  :global(.dossier-prose [data-width='large']  .dossier-asset-image) { max-width: 75%; }
  /* The uploader's own words about the file, under it. Distinct from the
     filename line, which says what it is called rather than what it is. */
  :global(.dossier-prose .dossier-asset-description) {
    font-size: 0.8125rem;
    color: #cbd5e1;                  /* slate-300 */
    margin-top: 0.3rem;
    line-height: 1.5;
  }
  :global(.dossier-prose .dossier-asset-caption) {
    font-size: 0.75rem;
    color: #94a3b8;                  /* slate-400 */
    margin-top: 0.35rem;
  }
  :global(.dossier-prose .dossier-asset-card) {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid #334155;
    border-radius: 6px;
    background: rgb(30 41 59 / 0.5); /* slate-800/50 */
  }
  :global(.dossier-prose .dossier-asset-icon) { font-size: 1.05rem; line-height: 1; }
  :global(.dossier-prose .dossier-asset-name) {
    font-size: 0.85rem;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  :global(.dossier-prose .dossier-asset-action) {
    font-size: 0.8rem;
    white-space: nowrap;
    color: var(--lh-accent, #3c9683);
    text-decoration: underline;
  }
  /* A reference whose file has gone. Reads as a warning, not as content. */
  :global(.dossier-prose .dossier-asset-gone) {
    border-color: rgb(245 158 11 / 0.4);
    background: rgb(245 158 11 / 0.07);
  }
  :global(.dossier-prose .dossier-asset-gone .dossier-asset-name) {
    color: #fbbf24;                  /* amber-400 */
  }
  :global(.dossier-prose .dossier-asset-missing) {
    color: #94a3b8;                  /* slate-400 */
    text-decoration: none;
    font-style: italic;
  }

  /* Edit-mode only: the node view wraps the preview so it can offer a remove
     button. An atom has no text cursor, so without a visible control the only
     way to delete one is to know to click-select it and press Backspace — and
     a click lands inside the iframe or image instead. */
  :global(.dossier-prose .dossier-asset-host) {
    position: relative;
    margin: 0 0 0.9rem;
    /* An atom inside a contenteditable region. Without this, clicking it starts
       a native text selection and the browser paints the whole block
       highlighted — very obvious on a spreadsheet preview, which is a table
       full of text. The asset is one thing here and is selected as one; its
       text is read from the file itself. Editor only: `-host` exists just in
       the node view, so a recipient's copy stays selectable. */
    user-select: none;
  }
  :global(.dossier-prose .dossier-asset-host .dossier-asset) { margin: 0; }

  /* How many rows of a spreadsheet to show. A typed number rather than a few
     preset buttons — a schedule and a summary table want very different
     amounts, and the preset that fits is rarely one of four guesses. */
  :global(.dossier-prose .dossier-block-rows) {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.65rem;
    color: #94a3b8;                  /* slate-400 */
    /* The host sets user-select:none so a click cannot smear a highlight over
       the block; a field the author types into has to opt back in. */
    user-select: text;
  }
  :global(.dossier-prose .dossier-block-rows input) {
    width: 3rem;
    padding: 0.1rem 0.3rem;
    border-radius: 4px;
    border: 1px solid #334155;       /* slate-700 */
    background: rgb(15 23 42 / 0.9); /* slate-900 */
    color: #e2e8f0;                  /* slate-200 */
    font-size: 0.7rem;
    text-align: right;
  }
  :global(.dossier-prose .dossier-block-rows input:focus) {
    outline: none;
    border-color: var(--lh-accent, #3c9683);
  }

  /* The hover control strip: size buttons (images only) plus remove. */
  :global(.dossier-prose .dossier-block-controls) {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    z-index: 2;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s;
  }
  :global(.dossier-prose .dossier-asset-host:hover .dossier-block-controls),
  :global(.dossier-prose .dossier-block-controls:focus-within) {
    opacity: 1;
    pointer-events: auto;
  }

  /* Two segmented groups on the asset toolbar — image width, and what is shown
     under the file. Styled together deliberately: they are the same kind of
     control and reading as one row is what makes the toolbar legible. */
  :global(.dossier-prose .dossier-block-sizes),
  :global(.dossier-prose .dossier-block-shows) {
    display: flex;
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid #334155;       /* slate-700 */
    background: rgb(15 23 42 / 0.85);
  }
  :global(.dossier-prose .dossier-block-sizes[hidden]),
  :global(.dossier-prose .dossier-block-shows[hidden]) { display: none; }
  :global(.dossier-prose .dossier-block-sizes button),
  :global(.dossier-prose .dossier-block-shows button) {
    min-width: 1.5rem;
    height: 1.5rem;
    padding: 0 0.3rem;
    font-size: 0.65rem;
    line-height: 1;
    color: #94a3b8;                  /* slate-400 */
    background: none;
    border: 0;
    cursor: pointer;
  }
  :global(.dossier-prose .dossier-block-shows button[hidden]) { display: none; }
  :global(.dossier-prose .dossier-block-sizes button:hover),
  :global(.dossier-prose .dossier-block-shows button:hover) { color: #fff; }
  :global(.dossier-prose .dossier-block-sizes button.is-active),
  :global(.dossier-prose .dossier-block-shows button.is-active) {
    background: #475569;             /* slate-600 */
    color: #fff;
  }

  /* The remove control, shared by asset and embedded-page blocks. Both are
     atoms with no text cursor, so without it the only way to delete one is to
     know to click-select it and press Backspace. */
  :global(.dossier-prose .dossier-block-remove) {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 4px;
    border: 1px solid #334155;       /* slate-700 */
    background: rgb(15 23 42 / 0.85);/* slate-900 */
    color: #94a3b8;                  /* slate-400 */
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
  }
  /* The embed stub has no control strip — its remove button positions itself. */
  :global(.dossier-prose .dossier-embed-stub .dossier-block-remove) {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    z-index: 2;
    /* Not clickable while invisible: an unseen button in the corner of every
       block would delete it on a stray click. */
    pointer-events: none;
  }
  :global(.dossier-prose .dossier-embed-stub:hover .dossier-block-remove),
  :global(.dossier-prose .dossier-embed-stub .dossier-block-remove:focus) {
    opacity: 1;
    pointer-events: auto;
  }
  /* An embedded TABLE gets the same treatment as an embedded page. Without
     these it inherited only the `opacity: 0` base rule and was permanently
     invisible — the only way to remove a table from a page was to select the
     node and press Delete, which is not discoverable and (being a bare
     keypress on a contentEditable=false node) does not reliably land in the
     editor's undo history either. Exactly the bug already fixed once for
     .dossier-embed-stub. */
  :global(.dossier-prose .dossier-dataset-embed-host) {
    position: relative;
    /* The node is an atom with contentEditable=false sitting inside a
       contenteditable region. Without this, clicking it starts a native text
       selection and the browser paints EVERY cell highlighted — which looks
       like a bug and hides the actual ProseMirror node selection. The table is
       a unit here; it is selected as one, and its text is read (and copied)
       from the table's own view, not from inside a page. */
    user-select: none;
  }
  /* What being selected should actually look like — the same treatment an
     asset gets, so an atom reads as an atom wherever it appears. */
  :global(.dossier-prose .dossier-dataset-embed-host.ProseMirror-selectednode),
  :global(.dossier-prose .ProseMirror-selectednode > .dossier-dataset-embed-host) {
    outline: 2px solid var(--lh-accent, #3c9683);
    outline-offset: 2px;
    border-radius: 6px;
  }
  :global(.dossier-prose .dossier-dataset-embed-host .dossier-block-remove) {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
    z-index: 2;
    /* Not clickable while invisible — an unseen button in the corner of every
       block would delete it on a stray click. */
    pointer-events: none;
  }
  :global(.dossier-prose .dossier-dataset-embed-host:hover .dossier-block-remove),
  :global(.dossier-prose .dossier-dataset-embed-host .dossier-block-remove:focus) {
    opacity: 1;
    pointer-events: auto;
  }

  :global(.dossier-prose .dossier-block-controls .dossier-block-remove) {
    opacity: 1;
    border: 1px solid #334155;
    background: rgb(15 23 42 / 0.85);
  }
  :global(.dossier-prose .dossier-block-remove:hover) { color: #f87171; }  /* red-400 */

  /* An asset selected in the editor — ProseMirror marks atoms with this class.
     It lands on the NODE VIEW's outer element, which is .dossier-asset-host;
     .dossier-asset is the inner one, so that selector alone never matched in
     edit mode and the outline has been invisible. Both are listed rather than
     just swapped, because renderHTML (no node view) puts the class on
     .dossier-asset directly. */
  :global(.dossier-prose .dossier-asset-host.ProseMirror-selectednode),
  :global(.dossier-prose .dossier-asset.ProseMirror-selectednode) {
    outline: 2px solid var(--lh-accent, #3c9683);
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* Read mode has no chevron button, so mark the collapsed state visibly. */
  :global(.dossier-prose div[data-toggle]:not(.dossier-toggle)::before) {
    content: '▾';
    position: absolute;
    left: 0.15rem;
    top: 0.3rem;
    font-size: 0.6rem;
    color: #94a3b8;
  }
  :global(.dossier-prose div[data-toggle][data-open='false']:not(.dossier-toggle)::before) {
    content: '▸';
  }
  /* Read mode: the summary line opens and closes the section, so it has to look
     like something you can click. The editor has its own chevron button and is
     excluded. */
  :global(.dossier-prose div[data-toggle]:not(.dossier-toggle) div[data-toggle-summary]) {
    cursor: pointer;
  }
  :global(.dossier-prose div[data-toggle]:not(.dossier-toggle) div[data-toggle-summary]:hover) {
    color: #fff;
  }
</style>
