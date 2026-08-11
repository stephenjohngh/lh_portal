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
  import RevisionHistoryModal from './RevisionHistoryModal.svelte';

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

  function auditDoc(action, doc) {
    logAudit(action, 'dossier_file', doc.id, doc.display_name || doc.filename, {
      appId: 'dossier', eventCategory: 'dossier',
      severity: action === 'delete' ? 'warning' : 'info',
      afterData: { pack_id: pack.id, filename: doc.filename },
    });
  }

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
  </div>

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
            <Button variant="secondary" size="small" on:click={openHistory}>
              History
            </Button>
          </div>
        </div>
        <!-- One long-lived editor instance across page switches: DocEditor
             flushes the outgoing page's pending save itself, which a {#key}
             remount would not do reliably. -->
        <div class="flex-1 min-h-0">
          <DocEditor bind:this={editorRef}
                     doc={selectedDoc} editable={canEdit} onSave={handleSaveBlocks} />
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

<RevisionHistoryModal
  bind:this={historyModalRef}
  bind:show={showHistory}
  doc={selectedDoc}
  {revisions}
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
