<!-- src/lib/apps/dossier/components/PackWorkspace.svelte -->
<!-- The two-pane authoring shell: doc tree | editor.
     P0 step 4 fills the tree; the editor pane lands with the Tiptap step. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
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
    <p class="text-sm font-semibold text-white truncate">{pack.title}</p>
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
    <div class="w-64 shrink-0 border-r border-slate-700 flex flex-col min-h-0">
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
    </div>

    <!-- ── Editor pane ── -->
    <div class="flex-1 min-w-0 flex flex-col">
      {#if selectedDoc}
        <div class="px-6 py-3 border-b border-slate-700/50 shrink-0">
          <h2 class="text-base font-semibold text-white">{selectedDoc.title}</h2>
          <p class="text-xs text-slate-500 mt-0.5 font-mono">{selectedDoc.slug}</p>
        </div>
        <!-- One long-lived editor instance across page switches: DocEditor
             flushes the outgoing page's pending save itself, which a {#key}
             remount would not do reliably. -->
        <div class="flex-1 min-h-0">
          <DocEditor doc={selectedDoc} editable={canEdit} onSave={handleSaveBlocks} />
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
