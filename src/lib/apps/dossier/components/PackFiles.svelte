<!-- src/lib/apps/dossier/components/PackFiles.svelte -->
<!-- A pack's files as a TREE of folders. Where a file sits is its category, so
     there is no Category field. One toolbar acts on the selected folder or file
     (the same pattern as the page tree — per-row buttons covered every name).
     State lives in dossierStore; this component only talks to it and to the
     document API, and tells the host what changed so it can audit it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { dossierStore } from '../stores/dossierStore.js';
  import * as docApi from '#lib/utils/documentApi.js';
  import { fileViewUrl } from '#lib/utils/driveUtils.js';
  import { DOC_FOLDERS, entityFolderPath } from '#lib/utils/documentUtils.js';
  import { currentUserId } from '#lib/utils/currentUser.js';
  import { errMessage } from '#lib/utils/errors.js';
  import Button from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormSelect from '#lib/components/common/FormSelect.svelte';
  import DocAttachInput from '#lib/components/common/DocAttachInput.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import FileTreeNode from './FileTreeNode.svelte';
  import {
    buildFileTree, folderLabel, storageSegments, folderMoveTargets, folderNameProblem,
    descendantFolderIds, placementMap, filesUnder,
  } from '../utils/fileTree.js';

  /** @type {{ id: string, title: string }} */
  export let pack;
  export let canEdit = false;
  export let isAdmin = false;
  /** The template this dossier was made from ('' for none). Its files are shown read-only. */
  export let templateTitle = '';

  const dispatch = createEventDispatcher();

  $: folders = $dossierStore.folders;
  $: files = $dossierStore.files;
  $: placements = $dossierStore.placements;
  $: tree = buildFileTree(folders, files, placements);
  $: inheritedTree = buildFileTree($dossierStore.inheritedFolders, $dossierStore.inheritedFiles, $dossierStore.inheritedPlacements);
  $: hasInherited = $dossierStore.inheritedFiles.length > 0 || $dossierStore.inheritedFolders.length > 0;
  let tplSelected = null;
  let tplCollapsed = {};
  $: tplFile = tplSelected?.kind === 'file' ? $dossierStore.inheritedFiles.find(f => f.id === tplSelected.id) : null;

  /** @type {{ kind: 'folder'|'file', id: string }|null} */
  let selected = null;
  let collapsed = {};
  /** @type {'' | 'newFolder' | 'rename' | 'move' | 'upload'} */
  let mode = '';
  let error = '';
  let busy = false;

  // Forms
  let nameValue = '';
  let descValue = '';
  let moveValue = '';
  /** @type {File[]} */
  let toUpload = [];
  let uploadDescription = '';
  let attachRef;

  $: selFolder = selected?.kind === 'folder' ? folders.find(f => f.id === selected.id) : null;
  $: selFile = selected?.kind === 'file' ? files.find(f => f.id === selected.id) : null;
  // A selection that no longer exists (deleted elsewhere) is no selection.
  $: if (selected && !(selected.kind === 'folder' ? folders : files).some(x => x.id === selected.id)) { selected = null; mode = ''; }

  /** The folder an action applies to: the selected folder, or the selected file's folder, or the top level. */
  $: targetFolderId = selFolder?.id ?? (selFile ? (placementMap(placements).get(selFile.id) ?? null) : null);
  $: targetLabel = targetFolderId ? folderLabel(folders, targetFolderId) : 'the top level';

  $: moveOptions = selFolder
    ? folderMoveTargets(folders, selFolder.id)
    : selFile ? [null, ...folders.map(f => f.id)] : [];
  $: moveChoices = moveOptions.map(id => ({ value: id ?? '', label: id ? folderLabel(folders, id) : 'Top level' }))
    .sort((a, b) => (a.value === '' ? -1 : b.value === '' ? 1 : a.label.localeCompare(b.label, 'en-GB', { numeric: true })));

  function choose(e) {
    selected = e.detail; mode = ''; error = '';
  }
  function setMode(m) {
    error = '';
    mode = mode === m ? '' : m;
    if (mode === 'newFolder') nameValue = '';
    if (mode === 'rename') { nameValue = selFolder?.name ?? selFile?.display_name ?? selFile?.filename ?? ''; descValue = selFile?.description ?? ''; }
    if (mode === 'move') moveValue = selFolder ? (selFolder.parent_id ?? '') : (placementMap(placements).get(selFile?.id) ?? '');
  }

  async function run(fn) {
    busy = true; error = '';
    try { await fn(); } catch (/** @type {any} */ err) { error = errMessage(err); } finally { busy = false; }
  }

  // ── Folders ──────────────────────────────────────────────────────────────
  const newFolder = () => run(async () => {
    const parentId = targetFolderId;
    const problem = folderNameProblem(folders, parentId, nameValue);
    if (problem) throw new Error(problem);
    const f = await dossierStore.createFolder({ packId: pack.id, parentId, name: nameValue }, await currentUserId());
    if (parentId) collapsed = { ...collapsed, [parentId]: false };
    selected = { kind: 'folder', id: f.id };
    mode = '';
  });

  const rename = () => run(async () => {
    if (selFolder) {
      const id = selFolder.id;
      const problem = folderNameProblem(folders, selFolder.parent_id, nameValue, id);
      if (problem) throw new Error(problem);
      await dossierStore.renameFolder(id, nameValue, await currentUserId());
    } else if (selFile) {
      const id = selFile.id;
      const name = nameValue.trim();
      if (!name) throw new Error('Give the file a name.');
      const updated = await docApi.updateDocument(id, { display_name: name, description: descValue.trim() || null });
      dossierStore.patchFile(id, updated);
      dispatch('changed', { action: 'update', doc: updated });
    }
    mode = '';
  });

  const move = () => run(async () => {
    const to = moveValue || null;
    const user = await currentUserId();
    if (selFolder) await dossierStore.moveFolder(selFolder.id, to, user);
    else if (selFile) await dossierStore.placeFile(selFile.id, pack.id, to, user);
    if (to) collapsed = { ...collapsed, [to]: false };
    mode = '';
  });

  // ── Delete ───────────────────────────────────────────────────────────────
  let pendingDelete = null;
  $: deleteMessage = !pendingDelete ? '' : pendingDelete.kind === 'folder'
    ? folderDeleteMessage(pendingDelete.id)
    : `Delete '${pendingDelete.name}'? Any page that shows it will show a missing file.` +
      (pack.is_template ? ' Dossiers made from this template show it too, so they will lose it as well.' : '') +
      ' This cannot be undone.';

  function folderDeleteMessage(id) {
    const node = findNode(tree.folders, id);
    const inside = descendantFolderIds(folders, id).length;
    const n = node ? filesUnder(node) : 0;
    return `Delete the folder '${node?.name ?? ''}'${inside ? ` and the ${inside} folder${inside === 1 ? '' : 's'} inside it` : ''}? ` +
      (n ? `Its ${n} file${n === 1 ? '' : 's'} will NOT be deleted — they go to the top level.` : 'It is empty.');
  }
  function findNode(nodes, id) {
    for (const n of nodes) { if (n.id === id) return n; const hit = findNode(n.children, id); if (hit) return hit; }
    return null;
  }
  function askDelete() {
    if (selFolder) pendingDelete = { kind: 'folder', id: selFolder.id, name: selFolder.name };
    else if (selFile) pendingDelete = { kind: 'file', id: selFile.id, name: selFile.display_name || selFile.filename, doc: selFile };
  }
  const confirmDelete = () => run(async () => {
    const target = pendingDelete;
    if (target.kind === 'folder') {
      await dossierStore.deleteFolder(target.id, target.name);
    } else {
      await docApi.deleteDocument(target.id);
      dossierStore.removeFile(target.id);
      dispatch('changed', { action: 'delete', doc: target.doc });
    }
    pendingDelete = null; selected = null; mode = '';
  }).finally(() => { pendingDelete = null; });

  // ── Upload ───────────────────────────────────────────────────────────────
  function storagePath() {
    const base = entityFolderPath(DOC_FOLDERS.DOSSIER_PACKS, pack.title, pack.id);
    const segs = targetFolderId ? storageSegments(folders, targetFolderId) : [];
    return [base, ...segs].join('/');
  }

  /** Each file is its own document, placed in the target folder; any that fail stay listed to retry. */
  async function upload() {
    if (!toUpload.length) return;
    busy = true; error = '';
    const batch = [...toUpload];
    const folderId = targetFolderId;       // capture before the awaits
    const path = storagePath();
    const failed = [];
    let lastError = '';
    const user = await currentUserId();
    for (const f of batch) {
      try {
        const doc = await docApi.uploadDocument(f, {
          entity_type: 'dossier_pack', entity_id: pack.id, display_name: f.name,
          folder_path: path, description: uploadDescription.trim() || undefined,
        });
        dossierStore.addFile(doc);
        if (folderId) await dossierStore.placeFile(doc.id, pack.id, folderId, user);
        dispatch('changed', { action: 'create', doc });
      } catch (/** @type {any} */ err) {
        failed.push(f); lastError = errMessage(err);
      }
    }
    busy = false;
    if (!failed.length) { cancelUpload(); return; }
    toUpload = failed;
    error = failed.length === batch.length
      ? lastError
      : `${batch.length - failed.length} of ${batch.length} uploaded. Not uploaded: ${failed.map(f => f.name).join(', ')} — ${lastError}`;
  }
  function cancelUpload() { mode = ''; toUpload = []; uploadDescription = ''; attachRef?.reset?.(); }
</script>

<div data-testid="pack-files">
  <ErrorDisplay message={error} onDismiss={() => error = ''} />

  {#if canEdit}
    <div class="flex flex-wrap items-center gap-0.5 mb-2" role="toolbar" aria-label="File actions" data-testid="file-toolbar">
      <Button variant="tertiary" size="xs" title="Upload files into {targetLabel}" on:click={() => setMode('upload')}>⬆ Upload</Button>
      <Button variant="tertiary" size="xs" title="New folder in {targetLabel}" on:click={() => setMode('newFolder')}>+ Folder</Button>
      <span class="w-px h-4 bg-slate-700 mx-1"></span>
      <Button variant="tertiary" size="xs" disabled={!selected} on:click={() => setMode('rename')}>✎ Rename</Button>
      <Button variant="tertiary" size="xs" disabled={!selected} on:click={() => setMode('move')}>Move…</Button>
      {#if selFile}
        <a class="inline-flex items-center rounded border border-purple-700/50 px-2 py-0.5 text-xs text-purple-300 hover:bg-purple-900/20"
           href={fileViewUrl(selFile.web_view_url)} target="_blank" rel="noopener noreferrer">Open</a>
      {/if}
      {#if selFolder || (selFile && isAdmin)}
        <Button admin={selFile ? true : false} variant={selFile ? 'danger' : 'tertiary'} size="xs" on:click={askDelete}>× Delete</Button>
      {/if}
    </div>
    {#if !selected}<p class="-mt-1 mb-1 text-[10px] text-slate-500">Select a folder or file to act on it.</p>{/if}

    {#if mode === 'newFolder'}
      <div class="mb-2 rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
        <FormInput label="New folder in {targetLabel}" bind:value={nameValue} placeholder="e.g. Old plans" disabled={busy} />
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="small" loading={busy} on:click={newFolder}>Create folder</Button>
        </div>
      </div>
    {:else if mode === 'rename'}
      <div class="mb-2 rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
        <FormInput label={selFolder ? 'Folder name' : 'File name'} bind:value={nameValue} disabled={busy} />
        {#if selFile}<FormInput label="Description (optional)" bind:value={descValue} disabled={busy} />{/if}
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="small" loading={busy} on:click={rename}>Save</Button>
        </div>
      </div>
    {:else if mode === 'move'}
      <div class="mb-2 rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
        <FormSelect label="Move to" bind:value={moveValue} options={moveChoices} disabled={busy} />
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="small" loading={busy} on:click={move}>Move</Button>
        </div>
      </div>
    {:else if mode === 'upload'}
      <div class="mb-2 space-y-2 rounded border border-slate-700 bg-slate-800/40 p-2">
        <p class="text-[11px] text-slate-400">Into <span class="text-slate-200">{targetLabel}</span></p>
        <div class={busy ? 'opacity-50 pointer-events-none' : ''}>
          <DocAttachInput bind:this={attachRef} multiple bind:files={toUpload} />
        </div>
        <FormInput
          label={toUpload.length > 1 ? 'Description for all ' + toUpload.length + ' files (optional)' : 'Description (optional)'}
          bind:value={uploadDescription} disabled={busy} />
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="small" on:click={cancelUpload} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="small" loading={busy} disabled={busy || !toUpload.length}
                  on:click={upload}>{toUpload.length > 1 ? `Upload ${toUpload.length} files` : 'Upload'}</Button>
        </div>
      </div>
    {/if}
  {/if}

  {#if files.length === 0 && folders.length === 0}
    <p class="text-xs text-slate-600 italic py-2">No files yet.</p>
  {:else}
    <FileTreeNode folders={tree.folders} files={tree.rootFiles} {selected} bind:collapsed on:select={choose} />
  {/if}

  {#if pack.template_id}
    <!-- The template's files: read-only here. A dossier uses them but never changes
         or deletes them; its own files are separate and sit above. -->
    <div class="mt-3 border-t border-slate-700/60 pt-2" data-testid="template-files">
      <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">From the template{templateTitle ? ` · ${templateTitle}` : ''}</p>
      {#if $dossierStore.inheritedError}
        <p class="text-xs text-amber-400 mt-1">{$dossierStore.inheritedError}</p>
      {:else if !hasInherited}
        <p class="text-xs text-slate-600 italic py-1">The template has no files.</p>
      {:else}
        <p class="text-[10px] text-slate-500 mb-1">Read only. Insert them into a page from the file picker.</p>
        <FileTreeNode folders={inheritedTree.folders} files={inheritedTree.rootFiles} selected={tplSelected}
                      bind:collapsed={tplCollapsed} on:select={(e) => tplSelected = e.detail} />
        {#if tplFile}
          <a class="mt-1 inline-flex items-center rounded border border-purple-700/50 px-2 py-0.5 text-xs text-purple-300 hover:bg-purple-900/20"
             href={fileViewUrl(tplFile.web_view_url)} target="_blank" rel="noopener noreferrer">Open {tplFile.display_name || tplFile.filename}</a>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={busy}
  title={pendingDelete?.kind === 'folder' ? 'Delete folder' : 'Delete file'}
  message={deleteMessage}
  confirmText={pendingDelete?.kind === 'folder' ? 'Delete folder' : 'Delete file'}
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
