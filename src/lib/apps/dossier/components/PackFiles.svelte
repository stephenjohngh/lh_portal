<!-- src/lib/apps/dossier/components/PackFiles.svelte -->
<!-- A pack's files as a TREE of folders. Where a file sits is its category, so
     there is no Category field. One toolbar acts on the selected folder or file
     (the same pattern as the page tree — per-row buttons covered every name).
     State lives in dossierStore; this component only talks to it and to the
     document API, and tells the host what changed so it can audit it. -->
<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { getPref, setPref } from '#lib/utils/prefs.js';
  import { get } from 'svelte/store';
  import { dossierStore } from '../stores/dossierStore.js';
  import * as docApi from '#lib/utils/documentApi.js';
  import { fileViewUrl } from '#lib/utils/driveUtils.js';
  import { currentUserId } from '#lib/utils/currentUser.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { fmtBytes } from '#lib/utils/files.js';
  import Button from '#lib/components/common/Button.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormSelect from '#lib/components/common/FormSelect.svelte';
  import DocAttachInput from '#lib/components/common/DocAttachInput.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import FileTreeNode from './FileTreeNode.svelte';
  import { desiredFolderPath, filesOutOfStep, filesUnderFolder } from '../utils/fileSync.js';
  import {
    buildFileTree, folderLabel, folderMoveTargets, folderNameProblem,
    descendantFolderIds, placementMap, filesUnder,
  } from '../utils/fileTree.js';

  /** @type {{ id: string, title: string }} */
  export let pack;
  export let canEdit = false;
  export let isAdmin = false;
  /** The template this dossier was made from ('' for none). Its files are shown read-only. */
  export let templateTitle = '';

  const dispatch = createEventDispatcher();
  // "Top level" needs a value of its own: an empty one is the select's placeholder.
  const TOP = '__top';

  $: folders = $dossierStore.folders;
  $: files = $dossierStore.files;
  $: placements = $dossierStore.placements;
  $: tree = buildFileTree(folders, files, placements);
  $: inheritedTree = buildFileTree($dossierStore.inheritedFolders, $dossierStore.inheritedFiles, $dossierStore.inheritedPlacements);
  $: hasInherited = $dossierStore.inheritedFiles.length > 0 || $dossierStore.inheritedFolders.length > 0;
  let tplSelected = null;
  let tplCollapsed = {};
  // The template's folders start CLOSED (only the top-level names show), once per pack
  // once they have loaded. Keyed on a primitive so later re-renders do not re-close them.
  let tplClosedFor = '';
  $: if (pack?.id && !$dossierStore.inheritedLoading && $dossierStore.inheritedFolders.length && tplClosedFor !== pack.id) {
    tplClosedFor = pack.id;
    tplCollapsed = Object.fromEntries($dossierStore.inheritedFolders.map(f => [f.id, true]));
  }
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
  let progress = '';

  // Pictures beside image files — remembered on this browser, off by default
  // (a big tree would otherwise fetch every picture on opening).
  let thumbnails = getPref('dossier.fileThumbnails') === '1';
  function toggleThumbs() { thumbnails = !thumbnails; setPref('dossier.fileThumbnails', thumbnails ? '1' : '0'); }
  $: imageCount = files.filter(f => String(f.mime_type || '').startsWith('image/')).length;

  // ── Keeping Drive in step with the tree ────────────────────────────────────
  // The tree is the truth; Drive is a best-effort mirror. A file whose recorded storage
  // folder is not where the tree puts it is "not yet moved" — judged from data, so it
  // survives a reload. Moves and renames bring the files they affect into step at once;
  // the button does the rest, and nothing writes to Drive merely because a pack was opened.
  let syncing = false;
  let syncNote = '';
  /** Files whose storage cannot be rearranged (not counted as out of step). */
  let unmirrorable = new Set();
  $: outOfStep = filesOutOfStep(pack, files, folders, placements).filter(f => !unmirrorable.has(f.id));

  /** Move these files in Drive to match the tree. Never throws; says what happened. */
  async function mirror(list) {
    const ids = list.map(f => f.id);
    if (!ids.length) return;
    syncing = true; syncNote = '';
    try {
      const r = await dossierStore.syncFiles(pack.id, ids);
      unmirrorable = new Set([...unmirrorable, ...r.skipped.map(x => x.document_id)]);
      if (r.failed.length) {
        syncNote = `${r.failed.length} file${r.failed.length === 1 ? '' : 's'} could not be moved in Drive` +
          `${r.failed[0].reason ? ` (${r.failed[0].reason})` : ''}. They still open from here; press Sync Drive to try again.`;
      }
    } catch (/** @type {any} */ err) {
      syncNote = `Drive could not be brought into step: ${errMessage(err)}`;
    } finally {
      syncing = false;
    }
  }
  /** After a change to the tree: the files now under a folder (read from the latest state). */
  function mirrorUnder(folderId) {
    const s = get(dossierStore);
    return mirror(filesUnderFolder(s.folders, s.placements, s.files, folderId));
  }

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
  $: moveChoices = moveOptions.map(id => ({ value: id ?? TOP, label: id ? folderLabel(folders, id) : 'Top level' }))
    .sort((a, b) => (a.value === TOP ? -1 : b.value === TOP ? 1 : a.label.localeCompare(b.label, 'en-GB', { numeric: true })));

  function choose(e) {
    selected = e.detail; mode = ''; error = '';
  }
  function setMode(m) {
    error = '';
    mode = mode === m ? '' : m;
    if (mode === 'newFolder') { nameValue = ''; newParent = targetFolderId ?? TOP; }
    if (mode === 'rename') { nameValue = selFolder?.name ?? selFile?.display_name ?? selFile?.filename ?? ''; descValue = selFile?.description ?? ''; }
    if (mode === 'move') moveValue = selFolder ? (selFolder.parent_id ?? TOP) : (placementMap(placements).get(selFile?.id) ?? TOP);
  }

  async function run(fn) {
    busy = true; error = '';
    try { await fn(); } catch (/** @type {any} */ err) { error = errMessage(err); } finally { busy = false; }
  }

  // ── Folders ──────────────────────────────────────────────────────────────
  let newParent = TOP;
  $: newParentChoices = [{ value: TOP, label: 'Top level' }, ...folders.map(f => ({ value: f.id, label: folderLabel(folders, f.id) }))]
    .sort((a, b) => (a.value === TOP ? -1 : b.value === TOP ? 1 : a.label.localeCompare(b.label, 'en-GB', { numeric: true })));
  const newFolder = () => run(async () => {
    const parentId = newParent === TOP ? null : newParent;
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
      mirrorUnder(id);
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
    const to = moveValue && moveValue !== TOP ? moveValue : null;
    const user = await currentUserId();
    if (selFolder) {
      await dossierStore.moveFolder(selFolder.id, to, user);
      mirrorUnder(selFolder.id);
    } else if (selFile) {
      await dossierStore.placeFile(selFile.id, pack.id, to, user);
      mirror([selFile]);
    }
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
      const s = get(dossierStore);
      const affected = filesUnderFolder(s.folders, s.placements, s.files, target.id);   // before they go to the top
      await dossierStore.deleteFolder(target.id, target.name);
      mirror(affected);
    } else {
      await docApi.deleteDocument(target.id);
      dossierStore.removeFile(target.id);
      dispatch('changed', { action: 'delete', doc: target.doc });
    }
    pendingDelete = null; selected = null; mode = '';
  }).finally(() => { pendingDelete = null; });

  // ── Upload ───────────────────────────────────────────────────────────────
  const MAX_BYTES = 50 * 1024 * 1024;

  /** Each file is its own document, placed in `folderId`. Returns the files that failed, and why. */
  async function uploadBatch(batch, folderId, description) {
    const path = desiredFolderPath(pack, folders, folderId);
    const failed = [];
    let lastError = '';
    const user = await currentUserId();
    let n = 0;
    for (const f of batch) {
      progress = `Uploading ${++n} of ${batch.length}…`;
      try {
        const doc = await docApi.uploadDocument(f, {
          entity_type: 'dossier_pack', entity_id: pack.id, display_name: f.name,
          folder_path: path, description: description.trim() || undefined,
        });
        dossierStore.addFile(doc);
        if (folderId) await dossierStore.placeFile(doc.id, pack.id, folderId, user);
        dispatch('changed', { action: 'create', doc });
      } catch (/** @type {any} */ err) {
        failed.push(f); lastError = errMessage(err);
      }
    }
    progress = '';
    return { failed, lastError };
  }

  /** The upload form: files that fail stay listed to retry. */
  async function upload() {
    if (!toUpload.length) return;
    busy = true; error = '';
    const batch = [...toUpload];
    const { failed, lastError } = await uploadBatch(batch, targetFolderId, uploadDescription);   // folder captured before the awaits
    busy = false;
    if (!failed.length) { cancelUpload(); return; }
    toUpload = failed;
    error = failed.length === batch.length
      ? lastError
      : `${batch.length - failed.length} of ${batch.length} uploaded. Not uploaded: ${failed.map(f => f.name).join(', ')} — ${lastError}`;
  }

  // ── Dropping files straight onto the tree ────────────────────────────────
  const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  /** The folder a drop lands in: the folder row under the pointer, or the folder holding the file row under it, else the selection. */
  function dropFolderFor(e) {
    const el = /** @type {HTMLElement|null} */ (e.target instanceof Element ? e.target.closest('[data-folder-id],[data-file-id]') : null);
    if (el?.dataset.folderId) return el.dataset.folderId;
    if (el?.dataset.fileId) return placementMap(placements).get(el.dataset.fileId) ?? null;
    return targetFolderId;
  }
  let dropFolder;            // undefined = not dragging; null = top level; id = a folder
  $: dropLabel = dropFolder ? folderLabel(folders, dropFolder) : 'the top level';
  function onTreeDragOver(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (!canEdit || busy) { if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; dropFolder = undefined; return; }
    dropFolder = dropFolderFor(e);
  }
  function onTreeDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) dropFolder = undefined;
  }
  async function onTreeDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    const folderId = dropFolderFor(e);
    dropFolder = undefined;
    if (!canEdit || busy) return;
    const all = Array.from(e.dataTransfer?.files ?? []);
    const tooBig = all.filter(f => f.size > MAX_BYTES);
    const batch = all.filter(f => f.size <= MAX_BYTES);
    error = tooBig.length ? `Too large (maximum ${fmtBytes(MAX_BYTES)}): ${tooBig.map(f => f.name).join(', ')}` : '';
    if (!batch.length) return;
    // Open the upload form with these files, aimed at the folder they were dropped on,
    // so the description can be entered before they go (one for all; Edit does it per file).
    selected = folderId ? { kind: 'folder', id: folderId } : null;
    if (folderId) collapsed = { ...collapsed, [folderId]: false };
    const have = mode === 'upload' ? toUpload : [];
    toUpload = [...have, ...batch.filter(f => !have.some(x => x.name === f.name && x.size === f.size))];
    mode = 'upload';
  }

  // A file dropped anywhere that does not take it would make the browser open it
  // and leave the app. Swallow those drops; the places that do take files have
  // already handled theirs.
  onMount(() => {
    const guard = (e) => { if (hasFiles(e) && !e.defaultPrevented) e.preventDefault(); };
    window.addEventListener('drop', guard);
    window.addEventListener('dragover', guard);
    return () => { window.removeEventListener('drop', guard); window.removeEventListener('dragover', guard); };
  });
  function cancelUpload() { mode = ''; toUpload = []; uploadDescription = ''; attachRef?.reset?.(); }
</script>

<div data-testid="pack-files">
  <ErrorDisplay message={error} onDismiss={() => error = ''} />

  {#if canEdit}
    <div class="flex flex-wrap items-center gap-0.5 mb-2" role="toolbar" aria-label="File actions" data-testid="file-toolbar">
      <Button variant="tertiary" size="xs" title="Upload files into {targetLabel}" on:click={() => setMode('upload')}>⬆ Upload</Button>
      {#if imageCount}<Button variant="tertiary" size="xs" title="Show a small picture beside each image file" on:click={toggleThumbs}>{thumbnails ? 'Hide pictures' : 'Show pictures'}</Button>{/if}
      <Button variant="tertiary" size="xs" title="New folder in {targetLabel}" on:click={() => setMode('newFolder')}>+ Folder</Button>
      <span class="w-px h-4 bg-slate-700 mx-1"></span>
      <Button variant="tertiary" size="xs" disabled={!selected} title="Edit the description shown under the file, or its name" on:click={() => setMode('rename')}>✎ Edit</Button>
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
        <FormSelect label="Create in" bind:value={newParent} options={newParentChoices} disabled={busy} />
        <FormInput label="Folder name" bind:value={nameValue} placeholder="e.g. Old plans" disabled={busy} />
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="small" loading={busy} on:click={newFolder}>Create folder</Button>
        </div>
      </div>
    {:else if mode === 'rename'}
      <div class="mb-2 rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
        {#if selFile}<FormInput label="Description — shown under the file on pages" bind:value={descValue} placeholder="What this file is, in a sentence" disabled={busy} />{/if}
        <FormInput label={selFolder ? 'Folder name' : 'Name — as listed here; pages placed later use it'} bind:value={nameValue} disabled={busy} />
        {#if selFile}<p class="text-[10px] text-slate-500">Changing the name does not change the file in Drive or cards already on pages.</p>{/if}
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
        {#if progress}<p class="text-[11px] text-slate-400" data-testid="upload-progress">{progress}</p>{/if}
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="small" on:click={cancelUpload} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="small" loading={busy} disabled={busy || !toUpload.length}
                  on:click={upload}>{toUpload.length > 1 ? `Upload ${toUpload.length} files` : 'Upload'}</Button>
        </div>
      </div>
    {/if}
  {/if}

  {#if canEdit && (syncing || syncNote || outOfStep.length)}
    <div class="mb-2 rounded border border-slate-700/70 bg-slate-800/30 px-2 py-1.5 text-[11px]" data-testid="drive-status">
      {#if syncing}
        <p class="text-slate-400">Moving files in Drive to match…</p>
      {:else}
        {#if syncNote}<p class="text-amber-400">{syncNote}</p>{/if}
        {#if outOfStep.length}
          <p class="text-slate-400">
            {outOfStep.length} file{outOfStep.length === 1 ? ' is' : 's are'} not yet in the matching Drive folder.
            They open as normal.
            <Button variant="tertiary" size="xs" title="Move these files into the Drive folders that match the tree" on:click={() => mirror(outOfStep)}>Sync Drive</Button>
          </p>
        {/if}
      {/if}
    </div>
  {/if}

  {#if files.length === 0 && folders.length === 0}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="rounded {dropFolder !== undefined ? 'ring-1 ring-purple-400 bg-purple-900/10' : ''}"
         on:dragover={onTreeDragOver} on:dragleave={onTreeDragLeave} on:drop={onTreeDrop}>
      <p class="text-xs text-slate-600 italic py-2">{dropFolder !== undefined ? 'Drop to upload into the top level' : canEdit ? 'No files yet. Drop files here to add them.' : 'No files yet.'}</p>
    </div>
  {:else}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div data-testid="file-tree-box" class="rounded {dropFolder !== undefined ? 'ring-1 ring-purple-400 bg-purple-900/10' : ''}"
         on:dragover={onTreeDragOver} on:dragleave={onTreeDragLeave} on:drop={onTreeDrop}>
      {#if dropFolder !== undefined}<p class="px-1 py-0.5 text-[11px] text-purple-300" data-testid="drop-hint">Drop to upload into {dropLabel}</p>{/if}
      <FileTreeNode folders={tree.folders} files={tree.rootFiles} {selected} {thumbnails} bind:collapsed on:select={choose} />
    </div>
  {/if}

  {#if pack.template_id}
    <!-- The template's files: read-only here. A dossier uses them but never changes
         or deletes them; its own files are separate and sit above. -->
    <div class="mt-3 border-t border-slate-700/60 pt-2" data-testid="template-files">
      <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">From the template{templateTitle ? ` · ${templateTitle}` : ''}</p>
      {#if $dossierStore.inheritedError}
        <p class="text-xs text-amber-400 mt-1">{$dossierStore.inheritedError}</p>
      {:else if $dossierStore.inheritedLoading}
        <p class="text-xs text-slate-500 italic py-1">Loading the template’s files…</p>
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
