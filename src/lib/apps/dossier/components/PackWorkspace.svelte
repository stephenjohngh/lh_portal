<!-- src/lib/apps/dossier/components/PackWorkspace.svelte -->
<!-- The two-pane authoring shell: doc tree | editor.
     P0 step 4 fills the tree; the editor pane lands with the Tiptap step. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { getPref, setPref } from '$lib/utils/prefs';
  import { logAudit }    from '$lib/utils/auditLogger';
  import AttachedDocuments from '$lib/components/common/documents/AttachedDocuments.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';

  import { dossierStore } from '../stores/dossierStore.js';
  import {
    buildTree, descendantIds, planReorder, planIndent, planOutdent,
  } from '../utils/docTree.js';
  import DocTree      from './DocTree.svelte';
  import DocFormModal from './DocFormModal.svelte';
  import DocEditor    from './DocEditor.svelte';
  import BlockContent from './BlockContent.svelte';
  import RevisionHistoryModal from './RevisionHistoryModal.svelte';
  import AssetPickerModal     from './AssetPickerModal.svelte';
  import PagePickerModal     from './PagePickerModal.svelte';
  import { assetAttrsFromDocument } from '../utils/assetPreview.js';
  import { findBrokenReferences, describeBrokenReferences } from '../utils/brokenRefs.js';
  import { extractAllLinks } from '../utils/docLinks.js';

  export let pack;

  const dispatch = createEventDispatcher();

  let selectedId  = null;
  let collapsed   = {};
  let notice      = '';       // soft feedback (depth warning, refused move)
  let treeError   = '';

  // Doc modal
  let showDocModal = false;
  let editingDoc   = null;    // set = rename
  let newDocParent = null;    // set = create under this doc
  let docModalRef;

  // Delete confirmation
  let pendingDelete = null;
  let deletingId    = null;

  $: docs        = $dossierStore.docs;
  // Load the shelf once per pack; the picker needs it whether or not the Files
  // panel has ever been opened.
  $: if (pack?.id) dossierStore.loadPackFiles(pack.id);
  $: tree        = buildTree(docs);
  $: selectedDoc = docs.find(d => d.id === selectedId) ?? null;
  $: canEdit     = $permissions.isAdmin || $permissions.canModify;

  // How many pages a delete would take with it.
  $: pendingSubtree = pendingDelete ? descendantIds(docs, pendingDelete.id) : [];

  // ── Structural moves ──────────────────────────────────────────────────────

  const PLANNERS = {
    up:      (list, id) => planReorder(list, id, -1),
    down:    (list, id) => planReorder(list, id, +1),
    indent:  planIndent,
    outdent: planOutdent,
  };

  const REFUSALS = {
    cycle: 'A page cannot be moved inside itself.',
    depth: 'That would nest the page too deeply.',
  };

  async function handleMove(e) {
    const { node, kind } = e.detail;
    notice = '';
    const plan = PLANNERS[kind](docs, node.id);

    if (!plan.ok) {
      // 'not-found' here means "already at the edge" — a no-op, not an error.
      notice = REFUSALS[plan.reason] ?? '';
      return;
    }
    if (plan.warning === 'deep') {
      notice = 'This page is getting deeply nested — readers may struggle to find it.';
    }
    try {
      await dossierStore.applyMove(plan, $auth.user.id);
    } catch (err) {
      treeError = err.message;
    }
  }

  // ── Doc CRUD ──────────────────────────────────────────────────────────────

  function openNewDoc(parent = null) {
    editingDoc = null; newDocParent = parent; showDocModal = true;
  }
  function openRename(doc) {
    editingDoc = doc; newDocParent = null; showDocModal = true;
  }

  async function handleDocSave(e) {
    // Snapshot before the await — Svelte 5 flushes effects synchronously.
    const target  = editingDoc;
    const parent  = newDocParent;
    const { title } = e.detail;
    const userId  = $auth.user.id;
    const current = docs;

    try {
      if (target) {
        await dossierStore.renameDoc(target.id, title, userId);
      } else {
        const doc = await dossierStore.createDoc(
          { packId: pack.id, parentId: parent?.id ?? null, title }, userId, current);
        selectedId = doc.id;
        if (parent) collapsed = { ...collapsed, [parent.id]: false };
      }
      showDocModal = false;
      docModalRef?.done();
    } catch (err) {
      docModalRef?.fail(err.message);
    }
  }

  /** Autosave sink for DocEditor. Errors propagate so it can show "Not saved". */
  async function handleSaveBlocks(docId, blocks) {
    await dossierStore.saveDocBlocks(docId, blocks, $auth.user.id);
  }

  // ── Pack file shelf ───────────────────────────────────────────────────────
  // Files belong to the PACK, not to a page: blocks will reference rows on this
  // shelf by document_id (P1 step 2), and P3 must be able to enumerate exactly
  // what a publication exposes — an orphan file uploaded straight into a block
  // would be invisible to that walk.

  const LS_FILES = 'dossier:filesOpen';
  let filesOpen = getPref(LS_FILES) === '1';

  function toggleFiles() {
    filesOpen = !filesOpen;
    setPref(LS_FILES, filesOpen ? '1' : '0');
  }

  // The picker reads the shelf from the store; AttachedDocuments keeps its own
  // copy for the panel, so both are refreshed when a file is added or removed.
  let showAssetPicker = false;
  $: files = $dossierStore.files;

  function handlePickAsset(file) {
    editorRef?.insertAsset(assetAttrsFromDocument(file));
  }

  // ── Cross-links ───────────────────────────────────────────────────────────

  let showPagePicker = false;
  let pickerPurpose  = 'link';   // 'link' | 'embed'

  function handlePickPage({ doc, mode }) {
    if (pickerPurpose === 'embed') editorRef?.insertDocEmbed(doc, mode);
    else                           editorRef?.applyDocLink(doc);
  }

  function openPicker(purpose) {
    pickerPurpose = purpose;
    showPagePicker = true;
  }

  /**
   * Follow a cross-link. Delegated from the editor surface rather than bound
   * per link, so it works for links the author has only just typed and for the
   * read-only renderer alike.
   *
   * In edit mode a plain click must still place the caret — otherwise the link
   * text becomes uneditable — so following requires Ctrl/Cmd. In read mode a
   * plain click follows.
   */
  function handleContentClick(event) {
    const anchor = event.target?.closest?.('a.dossier-doclink');
    if (!anchor) return;
    if (canEdit && !(event.ctrlKey || event.metaKey)) return;

    const targetId = anchor.getAttribute('data-doc-id');
    event.preventDefault();
    if (targetId && docs.some(d => d.id === targetId)) {
      selectedId = targetId;
      notice = '';
    } else {
      notice = 'That page no longer exists.';
    }
  }

  // ── Broken references ─────────────────────────────────────────────────────
  // Recomputed whenever the pages or the shelf change, so a deletion surfaces
  // immediately rather than at some later audit.

  let showBroken = false;

  // Derived straight from the pages and the shelf, so a deleted file shows up
  // the instant the shelf reloads.
  $: broken = findBrokenReferences(extractAllLinks(docs), docs, files);

  // ── Backlinks ─────────────────────────────────────────────────────────────

  let backlinks = [];

  // Reload whenever the selected page changes. Cheap, and it must reflect edits
  // made on other pages since this one was opened.
  $: refreshBacklinks(selectedId);

  async function refreshBacklinks(docId) {
    if (!docId) { backlinks = []; return; }
    try {
      backlinks = await dossierStore.loadBacklinks(docId);
    } catch {
      backlinks = [];      // non-fatal: the page is still perfectly editable
    }
  }

  function auditDoc(action, doc) {
    dossierStore.loadPackFiles(pack.id);
    logAudit(action, 'dossier_file', doc.id, doc.display_name || doc.filename, {
      appId: 'dossier', eventCategory: 'dossier',
      severity: action === 'delete' ? 'warning' : 'info',
      afterData: { pack_id: pack.id, filename: doc.filename },
    });
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  // The editor can only show an embed as a placeholder — a Tiptap node cannot
  // reach the other pages. Preview renders through the SAME read-mode renderer
  // a recipient will get, so transclusions, cycles and depth limits are all
  // visible before anything is published.

  let previewing = false;

  async function togglePreview() {
    if (!previewing) await editorRef?.flushNow();   // preview the saved state
    previewing = !previewing;
  }

  // Leaving a page always returns to editing.
  $: if (selectedId) previewing = previewing && true;

  // ── Version history ───────────────────────────────────────────────────────

  let showHistory      = false;
  let revisions        = [];
  let loadingRevisions = false;
  let historyModalRef;
  let editorRef;

  async function openHistory() {
    const docId = selectedId;
    if (!docId) return;
    // Flush any pending autosave first, or the newest edits are missing from
    // the comparison the user is about to make.
    await editorRef?.flushNow();
    showHistory = true;
    loadingRevisions = true;
    try {
      revisions = await dossierStore.loadRevisions(docId);
    } catch (err) {
      treeError = err.message;
    } finally {
      loadingRevisions = false;
    }
  }

  async function handleRestore(e) {
    const revision = e.detail;
    const docId    = selectedId;
    try {
      await dossierStore.restoreRevision(docId, revision, $auth.user.id);
      revisions = await dossierStore.loadRevisions(docId);
      historyModalRef?.done();
      showHistory = false;
    } catch (err) {
      historyModalRef?.fail(err.message);
    }
  }

  async function saveVersion() {
    const docId = selectedId;
    if (!docId) return;
    await editorRef?.flushNow();
    const current = docs.find(d => d.id === docId);
    try {
      await dossierStore.saveVersion(
        docId, current?.blocks, $auth.user.id, 'Saved by hand');
      notice = 'Version saved.';
    } catch (err) {
      treeError = err.message;
    }
  }

  function requestDelete(doc) { pendingDelete = doc; }

  async function confirmDelete() {
    const { id, title } = pendingDelete;
    const subtree = descendantIds(docs, id);
    deletingId = id;
    try {
      await dossierStore.deleteDoc(id, title, subtree);
      if (id === selectedId || subtree.includes(selectedId)) selectedId = null;
      pendingDelete = null;
    } catch (err) {
      treeError = err.message;
    } finally {
      deletingId = null;
    }
  }
</script>

<div class="flex flex-col h-full">

  <!-- Workspace header -->
  <div class="flex items-center gap-3 px-4 py-2.5 border-b border-slate-700 shrink-0">
    <Button variant="secondary" size="small" on:click={() => dispatch('back')}>
      ← Packs
    </Button>
    <p class="text-sm font-semibold text-white truncate" title={pack.title}>{pack.title}</p>
    {#if pack.status === 'archived'}
      <span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Archived</span>
    {/if}

    <div class="flex-1"></div>

    {#if broken.length}
      <!-- A pack about to be handed to someone outside the portal should not
           contain references that go nowhere. -->
      <button
        class="text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-300
               hover:bg-amber-500/25 transition-colors shrink-0"
        title="Show which references no longer resolve"
        on:click={() => showBroken = !showBroken}
      >⚠ {describeBrokenReferences(broken)}</button>
    {/if}
  </div>

  {#if showBroken && broken.length}
    <div class="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5 shrink-0">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0 space-y-1">
          {#each broken as ref}
            <p class="text-xs text-slate-300">
              <button
                class="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                on:click={() => { selectedId = ref.from_doc_id; showBroken = false; }}
              >{ref.from_doc_title}</button>
              <span class="text-slate-500">
                {ref.kind === 'doc' ? 'links to' : 'shows'}
              </span>
              <span class="text-slate-400">{ref.label}</span>
            </p>
          {/each}
        </div>
        <button class="text-xs text-slate-500 hover:text-slate-300 shrink-0"
                on:click={() => showBroken = false}>Hide</button>
      </div>
    </div>
  {/if}

  {#if treeError}
    <div class="px-4 pt-3">
      <ErrorDisplay message={treeError} onDismiss={() => treeError = ''} />
    </div>
  {/if}

  <div class="flex flex-1 min-h-0">

    <!-- ── Doc tree ── -->
    <div class="w-72 shrink-0 border-r border-slate-700 flex flex-col min-h-0">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 shrink-0">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-1">Pages</p>
        {#if canEdit}
          <button class="text-xs text-slate-400 hover:text-white px-1"
                  title="New top-level page" on:click={() => openNewDoc(null)}>+ New</button>
        {/if}
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-1.5">
        {#if $dossierStore.loadingDocs}
          <div class="flex justify-center py-8"><LoadingSpinner /></div>
        {:else if tree.length === 0}
          <p class="text-xs text-slate-500 px-2 py-6 text-center">
            No pages yet. Start with an overview page, then add a chronology.
          </p>
        {:else}
          <DocTree
            nodes={tree}
            {selectedId}
            bind:collapsed
            on:select={(e)   => { selectedId = e.detail.id; notice = ''; }}
            on:move={handleMove}
            on:newChild={(e) => openNewDoc(e.detail)}
            on:rename={(e)   => openRename(e.detail)}
            on:delete={(e)   => requestDelete(e.detail)}
          />
        {/if}
      </div>

      {#if notice}
        <div class="px-3 py-2 border-t border-slate-700/50 shrink-0">
          <p class="text-xs text-amber-400/90">{notice}</p>
        </div>
      {/if}

      <!-- ── Files: the pack's evidence shelf ── -->
      <!-- Conditional class rather than class:flex-1 + shrink-0 — those two are
           the same specificity, so which wins would depend on CSS order. -->
      <div class="border-t border-slate-700 flex flex-col min-h-0
                  {filesOpen ? 'flex-1' : 'shrink-0'}">
        <!-- When open, AttachedDocuments supplies its own "FILES (n)" heading,
             so this button carries the label only while collapsed. -->
        <button
          class="flex items-center gap-2 w-full px-3 py-2 text-left shrink-0
                 hover:bg-slate-700/40 transition-colors"
          aria-label={filesOpen ? 'Hide files' : 'Show files'}
          aria-expanded={filesOpen}
          on:click={toggleFiles}
        >
          <span class="text-[10px] text-slate-500 w-2">{filesOpen ? '▼' : '▶'}</span>
          {#if !filesOpen}
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-1">
              Files
            </span>
          {/if}
        </button>

        {#if filesOpen}
          <div class="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
            <AttachedDocuments
              entityType="dossier_pack"
              entityId={pack.id}
              canEdit={canEdit}
              canDelete={$permissions.isAdmin}
              folderPath="Dossier Packs"
              title="Files"
              on:uploaded={(e) => auditDoc('create', e.detail)}
              on:deleted={(e)  => auditDoc('delete', e.detail)}
            />
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Editor pane ── -->
    <div class="flex-1 min-w-0 flex flex-col">
      {#if selectedDoc}
        <div class="flex items-start gap-3 px-6 py-3 border-b border-slate-700/50 shrink-0">
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-semibold text-white truncate">{selectedDoc.title}</h2>
            <p class="text-xs text-slate-500 mt-0.5 font-mono">{selectedDoc.slug}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            {#if canEdit}
              <Button variant="secondary" size="small" on:click={saveVersion}>
                Save version
              </Button>
            {/if}
            <Button variant="secondary" size="small"
                    on:click={togglePreview}>
              {previewing ? 'Edit' : 'Preview'}
            </Button>
            <Button variant="secondary" size="small" on:click={openHistory}>
              History
            </Button>
          </div>
        </div>

        {#if backlinks.length}
          <!-- Which pages point here. The answer to "why is this page in the
               pack?", and the first thing to check before deleting one. -->
          <div class="flex items-start gap-2 px-6 py-2 border-b border-slate-700/50
                      bg-slate-800/30 shrink-0 text-xs">
            <span class="text-slate-500 shrink-0 pt-0.5">Referenced from</span>
            <div class="flex flex-wrap gap-x-3 gap-y-1 min-w-0">
              {#each backlinks as link (link.doc_id)}
                <button
                  class="text-slate-300 hover:text-white underline underline-offset-2"
                  title="Go to {link.title}"
                  on:click={() => { selectedId = link.doc_id; notice = ''; }}
                >{link.title}</button>
              {/each}
            </div>
          </div>
        {/if}
        <!-- One long-lived editor instance across page switches: DocEditor
             flushes the outgoing page's pending save itself, which a {#key}
             remount would not do reliably. -->
        <div class="flex-1 min-h-0">
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="h-full" on:click={handleContentClick}>
            {#if previewing}
              <div class="h-full overflow-y-auto">
                <div class="max-w-3xl mx-auto px-8 py-6">
                  <BlockContent blocks={selectedDoc.blocks} mode="read" {docs} {files} />
                </div>
              </div>
            {:else}
            <DocEditor bind:this={editorRef}
                       doc={selectedDoc} editable={canEdit} onSave={handleSaveBlocks}
                       on:pickAsset={() => showAssetPicker = true}
                       on:pickPage={() => openPicker('link')}
                       on:pickEmbed={() => openPicker('embed')} />
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex-1 flex items-center justify-center p-8">
          <p class="text-sm text-slate-500 text-center max-w-sm">
            Select a page from the left, or create one to start building this pack.
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<DocFormModal
  bind:this={docModalRef}
  bind:show={showDocModal}
  doc={editingDoc}
  parent={newDocParent}
  on:save={handleDocSave}
  on:close={() => showDocModal = false}
/>

<PagePickerModal
  bind:show={showPagePicker}
  {docs}
  currentDocId={selectedId}
  purpose={pickerPurpose}
  on:pick={(e) => handlePickPage(e.detail)}
  on:close={() => showPagePicker = false}
/>

<AssetPickerModal
  bind:show={showAssetPicker}
  {files}
  on:pick={(e) => handlePickAsset(e.detail)}
  on:close={() => showAssetPicker = false}
/>

<RevisionHistoryModal
  bind:this={historyModalRef}
  bind:show={showHistory}
  doc={selectedDoc}
  {revisions}
  {docs}
  {files}
  loading={loadingRevisions}
  {canEdit}
  on:restore={handleRestore}
  on:close={() => showHistory = false}
/>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete page?"
  message={pendingDelete
    ? (pendingSubtree.length
        ? `"${pendingDelete.title}" and its ${pendingSubtree.length} sub-page${pendingSubtree.length === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`
        : `"${pendingDelete.title}" will be permanently deleted. This cannot be undone.`)
    : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
