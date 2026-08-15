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
  import Modal           from '$lib/components/common/Modal.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import FormInput       from '$lib/components/common/FormInput.svelte';
  import { editorExtensions, EMPTY_DOC } from '../utils/blockSchema.js';
  import { CALLOUT_VARIANTS } from '../utils/calloutNode.js';
  import BlockContent from './BlockContent.svelte';

  /** The dossier_docs row being edited. */
  export let doc;
  export let editable = true;
  /** @type {(docId: string, blocks: object) => Promise<any>} */
  export let onSave = async () => {};
  /** The pack's shelf. Asset blocks watch it so a deleted file marks itself. */
  export let files = [];
  /** The pack's pages — an embedded table names the page a row points at. */
  export let docs = [];
  /** The pack's tables and their rows, so an embedded table renders live. */
  export let datasets = [];
  export let records  = [];

  // The editor is created once, so a plain prop would be a snapshot. Mirroring
  // into a store gives the asset node view something live to subscribe to.
  const filesStore = writable(files);
  $: filesStore.set(files);

  // Same bridge for tables: the embedded table repaints as rows are added,
  // rather than going stale until the page is reopened. `docs` and `files`
  // ride along so a row's reference renders here exactly as it does for the
  // recipient — without them the editor showed a bare table and the reader
  // showed a Detail column.
  const dataStore = writable({ datasets, records, docs, files });
  $: dataStore.set({ datasets, records, docs, files });

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
      extensions: editorExtensions({
        filesProvider: filesStore,
        dataProvider: dataStore,
        onOpenDoc: (id) => dispatch('openDoc', id),
        onSheetRows: (documentId, rows) => dispatch('sheetRows', { documentId, rows }),
      }),
      content: doc?.blocks ?? EMPTY_DOC,
      editable,
      // The editing class gives the ProseMirror element itself a tall minimum,
      // so it owns the empty space below the last block and places the cursor
      // at the NEAREST line on click rather than always jumping to the end.
      editorProps: { attributes: { class: 'dossier-prose dossier-prose-editing' } },
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

  /**
   * Attach a spreadsheet snapshot to blocks referencing a file.
   *
   * The block is inserted immediately and the preview arrives after, so a slow
   * read never leaves the author staring at a picker that has closed with
   * nothing to show for it. Only blocks that have no snapshot yet are touched,
   * so re-inserting the same file cannot wipe an existing one.
   */
  export function setSheetPreview(documentId, preview, rows = null) {
    if (!editor || !documentId || !preview) return;
    const positions = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'asset' || node.attrs.document_id !== documentId) return;
      // With a row count this is a REPLACEMENT the author asked for, so it
      // applies to blocks that already have a preview. Without one it is the
      // first fill after an insert, and must not overwrite an existing choice.
      if (rows == null && node.attrs.sheet_preview) return;
      positions.push(pos);
    });
    if (!positions.length) return;

    // Attribute-only changes, so earlier positions stay valid as we go.
    const tr = editor.state.tr;
    for (const pos of positions) {
      tr.setNodeAttribute(pos, 'sheet_preview', preview);
      if (rows != null) tr.setNodeAttribute(pos, 'sheet_rows', rows);
    }
    editor.view.dispatch(tr);
  }

  /** Insert one of the pack's tables. */
  export function insertDatasetEmbed(dataset) {
    editor?.chain().focus().insertDatasetEmbed({
      dataset_id: dataset.id, dataset_title: dataset.title,
    }).run();
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

  // ── External links ────────────────────────────────────────────────────────
  // 🔗 links to another PAGE in this pack. A link out to the web is a different
  // thing and had no control at all: the only way to make one was to paste a
  // URL and let the editor autolink it.

  let showUrlModal = false;
  let urlValue = '';
  let urlError = '';

  function openUrlModal() {
    // Offer whatever is already there, so the control edits as well as adds.
    urlValue = editor?.getAttributes('link')?.href ?? '';
    urlError = '';
    showUrlModal = true;
  }

  function applyUrl() {
    const raw = urlValue.trim();
    if (!raw) {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      showUrlModal = false;
      return;
    }
    // A bare `example.com` is what people type. Left alone the browser reads it
    // as a relative path and the link lands inside the portal.
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    // Only http(s) and mailto. `javascript:` in an author's document would
    // execute in a recipient's browser — the sanitiser would strip it on the
    // way out, but it has no business being stored in the first place.
    if (!/^(https?|mailto):/i.test(href)) {
      urlError = 'Only web addresses and mailto: links can be used here.';
      return;
    }
    editor?.chain().focus().extendMarkRange('link')
      .setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
    showUrlModal = false;
  }

  const isActive = (a) => (a.is ? (editor?.isActive(a.is, a.attrs) ?? false) : false);

  /**
   * Clicking the empty space below the last block puts the cursor at the end.
   *
   * That space sits OUTSIDE ProseMirror's own DOM, so without this a click
   * there does nothing at all — the author has to find the last line and click
   * exactly on it to carry on writing.
   */
  function focusEnd(event) {
    if (!editable) return;
    // Only when the click landed on the padding itself, never on content.
    if (event.target !== event.currentTarget) return;
    editor?.commands.focus('end');
  }
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
        title="Link to a web address"
        class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400
               hover:bg-slate-700 hover:text-white transition-colors
               {editor?.isActive('link') ? 'bg-slate-700 text-white' : ''}"
        on:click={openUrlModal}
      >🌐</button>
      <button
        type="button"
        title="Show another page's content inside this one"
        class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400
               hover:bg-slate-700 hover:text-white transition-colors"
        on:click={() => dispatch('pickEmbed')}
      >⧉</button>
      <button
        type="button"
        title="Show one of this pack's tables here"
        class="min-w-7 h-7 px-1.5 rounded text-xs text-slate-400
               hover:bg-slate-700 hover:text-white transition-colors"
        on:click={() => dispatch('pickTable')}
      >▦</button>

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
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div class="max-w-3xl mx-auto px-8 py-6 min-h-[60vh] {editable ? 'cursor-text' : ''}"
         on:click={focusEnd}>
      <!-- The editor attaches to BlockContent's host element so edit and read
           modes share one stylesheet — see BlockContent.svelte. -->
      <BlockContent mode="edit" bind:host={editorEl} />
    </div>
  </div>
</div>

<Modal bind:show={showUrlModal} title="Link to a web address" size="medium"
       on:close={() => showUrlModal = false}>
  <div class="space-y-2">
    <FormInput
      label="Address"
      bind:value={urlValue}
      placeholder="example.com or https://example.com"
      error={urlError}
    />
    <p class="text-xs text-slate-500">
      Select some text first and it becomes the link. Leave this empty to
      remove a link that is already there.
    </p>
  </div>

  <div slot="footer" class="flex justify-end gap-2">
    <Button variant="secondary" on:click={() => showUrlModal = false}>Cancel</Button>
    <Button variant="primary" on:click={applyUrl}>Apply</Button>
  </div>
</Modal>
