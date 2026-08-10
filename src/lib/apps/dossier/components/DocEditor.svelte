<!-- src/lib/apps/dossier/components/DocEditor.svelte -->
<!-- The block editor for one doc. Tiptap/ProseMirror JSON is stored verbatim as
     dossier_docs.blocks — see utils/blockSchema.js.

     Two correctness rules this component exists to enforce:
       1. A pending autosave is FLUSHED before switching page, so page A's
          content can never be written onto page B.
       2. Programmatic content loading never counts as an edit, so merely
          opening a page does not mark it dirty or trigger a write. -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { Editor }      from '@tiptap/core';
  import { fmtTime }     from '$lib/utils/dates';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import { buildExtensions, EMPTY_DOC } from '../utils/blockSchema.js';
  import { CALLOUT_VARIANTS } from '../utils/calloutNode.js';

  /** The dossier_docs row being edited. */
  export let doc;
  export let editable = true;
  /** @type {(docId: string, blocks: object) => Promise<any>} */
  export let onSave = async () => {};

  const SAVE_DEBOUNCE_MS = 800;

  let editorEl;
  let editor;
  let ready = false;

  let timer       = null;
  let pendingFor  = null;   // doc id the pending save belongs to
  let loadedDocId = null;
  let swapping    = false;  // true while content is loaded programmatically
  let saving      = false;
  let savedAt     = null;
  let dirty       = false;
  let saveError   = '';

  // ── Save ──────────────────────────────────────────────────────────────────

  function scheduleSave(docId) {
    if (!docId) return;
    pendingFor = docId;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  async function flush() {
    clearTimeout(timer);
    timer = null;
    const docId = pendingFor;
    if (!docId || !editor) return;

    pendingFor = null;
    const blocks = editor.getJSON();
    saving = true;
    saveError = '';
    try {
      await onSave(docId, blocks);
      savedAt = new Date();
      dirty = false;
    } catch (err) {
      saveError = err.message;
      // Re-arm so the next edit (or page switch) retries rather than dropping
      // the user's work on the floor.
      pendingFor = docId;
      dirty = true;
    } finally {
      saving = false;
    }
  }

  /** Called by the parent before it unmounts us or navigates away. */
  export async function flushNow() { await flush(); }

  // ── Doc switching ─────────────────────────────────────────────────────────

  $: if (ready && doc && doc.id !== loadedDocId) swapDoc(doc);
  $: editor?.setEditable(editable);

  async function swapDoc(next) {
    const nextId = next.id;
    // Flush the OUTGOING doc first, using its own id — never write A onto B.
    if (pendingFor && pendingFor !== nextId) await flush();

    swapping = true;
    loadedDocId = nextId;
    dirty = false;
    savedAt = null;
    saveError = '';
    editor.commands.setContent(next.blocks ?? EMPTY_DOC, { emitUpdate: false });
    // Belt and braces: `swapping` guards onUpdate regardless of how the
    // installed Tiptap version treats the emitUpdate option.
    swapping = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  onMount(() => {
    editor = new Editor({
      element: editorEl,
      extensions: buildExtensions(),
      content: doc?.blocks ?? EMPTY_DOC,
      editable,
      editorProps: { attributes: { class: 'dossier-prose' } },
      onUpdate: () => {
        if (swapping) return;
        scheduleSave(loadedDocId);
      },
      onTransaction: () => { editor = editor; },   // re-render toolbar state
    });
    loadedDocId = doc?.id ?? null;
    ready = true;
  });

  onDestroy(() => {
    // Fire any outstanding save without awaiting — losing the edit is worse
    // than an unobserved promise.
    if (pendingFor) flush();
    clearTimeout(timer);
    editor?.destroy();
  });

  // ── Toolbar ───────────────────────────────────────────────────────────────

  const run = (fn) => () => { fn(editor.chain().focus()).run(); };

  const ACTIONS = [
    { label: 'B',  title: 'Bold',           is: 'bold',       go: c => c.toggleBold(),   cls: 'font-bold' },
    { label: 'I',  title: 'Italic',         is: 'italic',     go: c => c.toggleItalic(), cls: 'italic' },
    { label: 'H1', title: 'Heading 1',      is: 'heading',    attrs: { level: 1 }, go: c => c.toggleHeading({ level: 1 }) },
    { label: 'H2', title: 'Heading 2',      is: 'heading',    attrs: { level: 2 }, go: c => c.toggleHeading({ level: 2 }) },
    { label: 'H3', title: 'Heading 3',      is: 'heading',    attrs: { level: 3 }, go: c => c.toggleHeading({ level: 3 }) },
    { label: '•',  title: 'Bulleted list',  is: 'bulletList',  go: c => c.toggleBulletList() },
    { label: '1.', title: 'Numbered list',  is: 'orderedList', go: c => c.toggleOrderedList() },
    { label: '❝',  title: 'Quote',          is: 'blockquote',  go: c => c.toggleBlockquote() },
    { label: '—',  title: 'Divider',        is: null,          go: c => c.setHorizontalRule() },
  ];

  // Callouts carry their variant, so each button reports active only for its own.
  const CALLOUT_ACTIONS = CALLOUT_VARIANTS.map(v => ({
    label: v.icon,
    title: v.label,
    is:    'callout',
    attrs: { variant: v.value },
    go:    c => c.toggleCallout(v.value),
  }));

  const STRUCTURE_ACTIONS = [
    { label: '▸', title: 'Collapsible section', is: 'toggle', go: c => c.setToggle() },
  ];

  const isActive = (a) => (a.is ? (editor?.isActive(a.is, a.attrs) ?? false) : false);
</script>

<div class="flex flex-col h-full min-h-0">

  <!-- Toolbar + save state -->
  <div class="flex items-center gap-1 px-4 py-1.5 border-b border-slate-700/50 shrink-0">
    {#if editable}
      {#each ACTIONS as a}
        <button
          type="button"
          title={a.title}
          class="min-w-7 h-7 px-1.5 rounded text-xs transition-colors {a.cls ?? ''}
                 {isActive(a) ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}"
          on:click={run(a.go)}
        >{a.label}</button>
      {/each}

      <span class="w-px h-4 bg-slate-700 mx-1"></span>

      {#each [...CALLOUT_ACTIONS, ...STRUCTURE_ACTIONS] as a}
        <button
          type="button"
          title={a.title}
          class="min-w-7 h-7 px-1.5 rounded text-xs transition-colors
                 {isActive(a) ? 'bg-slate-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}"
          on:click={run(a.go)}
        >{a.label}</button>
      {/each}

      <span class="w-px h-4 bg-slate-700 mx-1"></span>

      <button type="button" title="Undo"
              class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
              on:click={run(c => c.undo())}>↶</button>
      <button type="button" title="Redo"
              class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400 hover:bg-slate-700 hover:text-white"
              on:click={run(c => c.redo())}>↷</button>
    {/if}

    <div class="flex-1"></div>

    <span class="text-xs shrink-0 {saveError ? 'text-red-400' : 'text-slate-500'}">
      {#if saving}Saving…
      {:else if saveError}Not saved
      {:else if dirty}Unsaved changes
      {:else if savedAt}Saved {fmtTime(savedAt.toISOString())}
      {/if}
    </span>
  </div>

  {#if saveError}
    <div class="px-4 pt-2 shrink-0">
      <ErrorDisplay message={`Could not save: ${saveError}`} onDismiss={() => saveError = ''} />
    </div>
  {/if}

  <!-- Editor surface -->
  <div class="flex-1 min-h-0 overflow-y-auto">
    <div class="max-w-3xl mx-auto px-8 py-6" bind:this={editorEl}></div>
  </div>
</div>

<style>
  /* ProseMirror renders its own DOM, which Tailwind classes cannot reach —
     hence :global. Mirrors the approach in common/RichTextEditor.svelte. */
  :global(.dossier-prose) {
    outline: none;
    color: #e2e8f0;              /* slate-200 */
    font-size: 0.9375rem;
    line-height: 1.7;
    min-height: 60vh;
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
     declarative spec that the P3 reader can render without any editor code. */
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
  :global(.dossier-prose .dossier-toggle) {
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
  /* Collapsed hides only the body — the summary line stays visible. */
  :global(.dossier-prose .dossier-toggle[data-open='false'] div[data-toggle-body]) {
    display: none;
  }
  :global(.dossier-prose div[data-toggle-body]) {
    margin-top: 0.35rem;
    border-left: 1px solid #334155;  /* slate-700 */
    padding-left: 0.75rem;
  }
  :global(.dossier-prose div[data-toggle-body] > :last-child) { margin-bottom: 0; }
</style>
