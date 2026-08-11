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
  import { renderBlocksToHtml } from '../utils/blockRender.js';
  import { isEmptyDoc }         from '../utils/blockSchema.js';

  /** Stored ProseMirror JSON (dossier_docs.blocks). Ignored in edit mode. */
  export let blocks = null;
  /** 'read' | 'edit' */
  export let mode = 'read';
  /** Edit mode only: bound to the element the caller attaches the Editor to. */
  export let host = null;

  $: html = mode === 'read' ? renderBlocksToHtml(blocks) : '';
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
  <div class="dossier-prose">{@html html}</div>
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
  :global(.dossier-prose p) { margin: 0 0 0.75rem 0; }
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

  /* ── Assets ────────────────────────────────────────────────────────────── */
  :global(.dossier-prose .dossier-asset) { margin: 0 0 0.9rem; }

  :global(.dossier-prose .dossier-asset-image) {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    border: 1px solid #334155;       /* slate-700 */
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
  }
  :global(.dossier-prose .dossier-asset-host .dossier-asset) { margin: 0; }

  :global(.dossier-prose .dossier-asset-remove) {
    position: absolute;
    top: 0.35rem;
    right: 0.35rem;
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
    z-index: 2;
  }
  :global(.dossier-prose .dossier-asset-host:hover .dossier-asset-remove),
  :global(.dossier-prose .dossier-asset-remove:focus) { opacity: 1; }
  :global(.dossier-prose .dossier-asset-remove:hover) { color: #f87171; }  /* red-400 */

  /* An asset selected in the editor — Tiptap marks atoms with this class. */
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
</style>
