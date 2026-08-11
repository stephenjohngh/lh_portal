<!-- src/lib/apps/dossier/components/DocEditor.svelte -->
<!-- The block editor for one doc. Tiptap/ProseMirror JSON is stored verbatim as
     dossier_docs.blocks — see utils/blockSchema.js.

     Two correctness rules this component exists to enforce:
       1. A pending autosave is FLUSHED before switching page, so page A's
          content can never be written onto page B.
       2. Programmatic content loading never counts as an edit, so merely
          opening a page does not mark it dirty or trigger a write. -->
<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { writable } from 'svelte/store';
  import { Editor }      from '@tiptap/core';
  import { fmtTime }     from '$lib/utils/dates';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import { buildExtensions, EMPTY_DOC } from '../utils/blockSchema.js';
  import { CALLOUT_VARIANTS } from '../utils/calloutNode.js';
  import BlockContent from './BlockContent.svelte';

  /** The dossier_docs row being edited. */
  export let doc;
  export let editable = true;
  /** @type {(docId: string, blocks: object) => Promise<any>} */
  export let onSave = async () => {};
  /** The pack's shelf. Asset blocks watch it so a deleted file marks itself. */
  export let files = [];

  // The editor is created once, so a plain prop would be a snapshot. Mirroring
  // into a store gives the asset node view something live to subscribe to.
  const filesStore = writable(files);
  $: filesStore.set(files);

  const dispatch = createEventDispatcher();

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
      extensions: buildExtensions({ filesProvider: filesStore }),
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

  /** Insert an asset block. The picker lives in the parent, which owns the shelf. */
  export function insertAsset(attrs) {
    editor?.chain().focus().insertAsset(attrs).run();
  }

  /** Insert a transclusion of another page. */
  export function insertDocEmbed(doc, mode = 'full') {
    editor?.chain().focus().insertDocEmbed({
      target_doc_id: doc.id, target_slug: doc.slug,
      target_title: doc.title, render_mode: mode,
    }).run();
  }

  /** Apply a cross-link to the current selection. */
  export function applyDocLink(doc) {
    editor?.chain().focus()
      .setDocLink({ target_doc_id: doc.id, target_slug: doc.slug })
      .run();
  }

  // A mark needs something to wrap, so the button is inert on an empty
  // selection — unless the cursor is already inside a link, where it removes it.
  $: selectionEmpty = editor ? editor.state.selection.empty : true;
  $: onExistingLink = editor?.isActive('docLink') ?? false;
  $: linkDisabled   = selectionEmpty && !onExistingLink;

  function handleLinkClick() {
    if (onExistingLink) {
      editor?.chain().focus().unsetDocLink().run();
      return;
    }
    dispatch('pickPage');
  }

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

      <button
        type="button"
        title="Insert a file from this pack"
        class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400
               hover:bg-slate-700 hover:text-white transition-colors"
        on:click={() => dispatch('pickAsset')}
      >📎</button>
      <button
        type="button"
        title={linkDisabled
          ? 'Select some text first, then link it to another page'
          : 'Link the selected text to another page'}
        disabled={linkDisabled}
        class="min-w-7 h-7 px-1.5 rounded text-xs transition-colors
               {editor?.isActive('docLink')
                 ? 'bg-slate-600 text-white'
                 : 'text-slate-400 hover:bg-slate-700 hover:text-white'}
               disabled:opacity-30 disabled:hover:bg-transparent"
        on:click={handleLinkClick}
      >🔗</button>
      <button
        type="button"
        title="Show another page's content inside this one"
        class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400
               hover:bg-slate-700 hover:text-white transition-colors"
        on:click={() => dispatch('pickEmbed')}
      >⧉</button>

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
    <!-- min-h gives a generous click target below the last block; it belongs
         to the editing surface, not to the shared prose styles. -->
    <div class="max-w-3xl mx-auto px-8 py-6 min-h-[60vh]">
      <!-- The editor attaches to BlockContent's host element so edit and read
           modes share one stylesheet — see BlockContent.svelte. -->
      <BlockContent mode="edit" bind:host={editorEl} />
    </div>
  </div>
</div>
