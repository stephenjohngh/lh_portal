<!-- src/lib/apps/dossier/components/PackSection.svelte -->
<!-- One section of the pack list — TEMPLATES or DOSSIERS — as a tree of folders and
     packs. Folder rows only SELECT; one toolbar acts on the selected folder (the same
     pattern as the page and file trees). The tree is flattened to one list of rows,
     because a pack row is large and a recursive component would have to forward it. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { dossierStore } from '../stores/dossierStore.js';
  import { currentUserId } from '#lib/utils/currentUser.js';
  import { errMessage } from '#lib/utils/errors.js';
  import { fmtDate } from '#lib/utils/dates.js';
  import Button from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormSelect from '#lib/components/common/FormSelect.svelte';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay from '#lib/components/common/ErrorDisplay.svelte';
  import Icon from '#lib/components/icons/Icon.svelte';
  import {
    buildPackTree, flattenPackTree, packsUnder, folderMoveTargets, folderNameProblem,
    descendantFolderIds, folderLabel,
  } from '../utils/packTree.js';

  /** @type {'template'|'dossier'} */
  export let kind;
  export let label = '';
  export let note = '';
  /** This section's folders, and its packs (already filtered to what is shown). */
  export let folders = [];
  export let packs = [];
  /** Archived view: no folders, just the packs. */
  export let flat = false;
  export let isAdmin = false;
  /** May this person make and change folders here? (admin for templates) */
  export let canFolders = false;
  /** Title lookup for "from <template>". */
  export let titleOf = () => '';
  /** The selected folder — bound out so the toolbar's "new" buttons can file into it. */
  export let selectedId = null;

  const dispatch = createEventDispatcher();

  let collapsed = {};
  /** @type {'' | 'new' | 'rename' | 'move' | 'movePack'} */
  let mode = '';
  let nameValue = '';
  let moveValue = '';
  let movingPack = null;
  let error = '';
  let busy = false;
  let pendingDelete = null;

  $: tree = buildPackTree(folders, packs);
  $: rows = flat
    ? packs.map(pack => ({ type: 'pack', pack, depth: 0 }))
    : flattenPackTree(tree, collapsed);
  $: selected = folders.find(f => f.id === selectedId) ?? null;
  $: if (selectedId && !folders.some(f => f.id === selectedId)) selectedId = null;

  $: moveChoices = selected
    ? folderMoveTargets(folders, selected.id).map(id => ({ value: id ?? '', label: id ? folderLabel(folders, id) : 'Top level' }))
    : [];
  // A dossier can only go in a folder of ITS owner (an admin moving someone else's pack).
  $: packChoices = movingPack
    ? [{ value: '', label: 'Top level' },
       ...folders.filter(f => kind === 'template' || f.created_by === movingPack.created_by)
         .map(f => ({ value: f.id, label: folderLabel(folders, f.id) }))
         .sort((a, b) => a.label.localeCompare(b.label, 'en-GB', { numeric: true }))]
    : [];

  function setMode(m) {
    error = '';
    mode = mode === m ? '' : m;
    if (mode === 'new') nameValue = '';
    if (mode === 'rename') nameValue = selected?.name ?? '';
    if (mode === 'move') moveValue = selected?.parent_id ?? '';
  }
  function startMovePack(pack) {
    error = ''; movingPack = pack; moveValue = pack.folder_id ?? ''; mode = 'movePack';
  }
  async function run(fn) {
    busy = true; error = '';
    try { await fn(); } catch (/** @type {any} */ err) { error = errMessage(err); } finally { busy = false; }
  }

  const createFolder = () => run(async () => {
    const parentId = selected?.id ?? null;
    const problem = folderNameProblem(folders, parentId, nameValue);
    if (problem) throw new Error(problem);
    const f = await dossierStore.createPackFolder({ kind, parentId, name: nameValue }, await currentUserId());
    if (parentId) collapsed = { ...collapsed, [parentId]: false };
    selectedId = f.id; mode = '';
  });
  const rename = () => run(async () => {
    const problem = folderNameProblem(folders, selected.parent_id, nameValue, selected.id);
    if (problem) throw new Error(problem);
    await dossierStore.renamePackFolder(selected.id, nameValue, await currentUserId());
    mode = '';
  });
  const moveFolder = () => run(async () => {
    const to = moveValue || null;
    const problem = folderNameProblem(folders, to, selected.name, selected.id);
    if (problem) throw new Error(problem);
    await dossierStore.movePackFolder(selected.id, to, await currentUserId());
    if (to) collapsed = { ...collapsed, [to]: false };
    mode = '';
  });
  const movePackTo = () => run(async () => {
    await dossierStore.movePack(movingPack.id, moveValue || null, await currentUserId());
    if (moveValue) collapsed = { ...collapsed, [moveValue]: false };
    movingPack = null; mode = '';
  });

  $: deleteMessage = pendingDelete ? deleteText(pendingDelete) : '';
  function deleteText(f) {
    const inside = descendantFolderIds(folders, f.id).length;
    const node = findNode(tree.folders, f.id);
    const n = node ? packsUnder(node) : 0;
    return `Delete the folder '${f.name}'${inside ? ` and the ${inside} folder${inside === 1 ? '' : 's'} inside it` : ''}? ` +
      (n ? `Its ${n} ${kind === 'template' ? 'template' : 'dossier'}${n === 1 ? '' : 's'} will NOT be deleted — ${n === 1 ? 'it goes' : 'they go'} to the top level.` : 'It is empty.');
  }
  function findNode(nodes, id) {
    for (const n of nodes) { if (n.id === id) return n; const hit = findNode(n.children, id); if (hit) return hit; }
    return null;
  }
  const confirmDelete = () => run(async () => {
    const f = pendingDelete;
    await dossierStore.deletePackFolder(f.id, f.name);
    selectedId = null; mode = '';
  }).finally(() => { pendingDelete = null; });
</script>

<div class="mb-5" data-testid="section-{kind}s">
  <div class="flex flex-wrap items-center gap-2">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}
      <span class="text-slate-500 font-normal normal-case tracking-normal">({packs.length})</span></p>

    {#if canFolders && !flat}
      <div class="flex flex-wrap items-center gap-0.5 ml-auto" role="toolbar" aria-label="{label} folders" data-testid="folder-toolbar-{kind}">
        <Button variant="tertiary" size="xs" admin={kind === 'template'} title={selected ? `New folder in ${selected.name}` : 'New folder'} on:click={() => setMode('new')}>+ Folder</Button>
        <Button variant="tertiary" size="xs" admin={kind === 'template'} disabled={!selected} on:click={() => setMode('rename')}>✎ Rename</Button>
        <Button variant="tertiary" size="xs" admin={kind === 'template'} disabled={!selected} on:click={() => setMode('move')}>Move…</Button>
        <Button variant="tertiary" size="xs" admin={kind === 'template'} disabled={!selected} on:click={() => selected && (pendingDelete = selected)}>× Delete folder</Button>
      </div>
    {/if}
  </div>
  {#if note}<p class="text-xs text-slate-500 mb-2">{note}</p>{:else}<div class="mb-2"></div>{/if}

  <ErrorDisplay message={error} onDismiss={() => error = ''} />

  {#if mode === 'new'}
    <div class="mb-2 max-w-md rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
      <FormInput label={selected ? `New folder in ${selected.name}` : 'New folder'} bind:value={nameValue} placeholder="e.g. Roof surveys" disabled={busy} />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="small" loading={busy} on:click={createFolder}>Create folder</Button>
      </div>
    </div>
  {:else if mode === 'rename' && selected}
    <div class="mb-2 max-w-md rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
      <FormInput label="Folder name" bind:value={nameValue} disabled={busy} />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="small" loading={busy} on:click={rename}>Save</Button>
      </div>
    </div>
  {:else if mode === 'move' && selected}
    <div class="mb-2 max-w-md rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
      <FormSelect label="Move folder to" bind:value={moveValue} options={moveChoices} disabled={busy} />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="small" on:click={() => mode = ''} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="small" loading={busy} on:click={moveFolder}>Move</Button>
      </div>
    </div>
  {:else if mode === 'movePack' && movingPack}
    <div class="mb-2 max-w-md rounded border border-slate-700 bg-slate-800/40 p-2 space-y-2">
      <FormSelect label="Move “{movingPack.title}” to" bind:value={moveValue} options={packChoices} disabled={busy} />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="small" on:click={() => { mode = ''; movingPack = null; }} disabled={busy}>Cancel</Button>
        <Button variant="primary" size="small" loading={busy} on:click={movePackTo}>Move</Button>
      </div>
    </div>
  {/if}

  <div class="space-y-1.5">
    {#each rows as row (row.type === 'folder' ? 'f' + row.node.id : 'p' + row.pack.id)}
      {#if row.type === 'folder'}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-700/50 transition-colors
                 {selectedId === row.node.id ? 'bg-slate-700' : ''}"
          style="margin-left: {row.depth * 16}px"
          data-testid="folder-row"
          on:click={() => { selectedId = row.node.id; mode = ''; }}
        >
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <span class="w-4 shrink-0 text-[10px] text-slate-500 text-center"
                title={collapsed[row.node.id] ? 'Expand' : 'Collapse'}
                on:click|stopPropagation={() => collapsed = { ...collapsed, [row.node.id]: !collapsed[row.node.id] }}>{collapsed[row.node.id] ? '▶' : '▼'}</span>
          <span class="shrink-0">📁</span>
          <span class="flex-1 min-w-0 truncate text-sm {selectedId === row.node.id ? 'text-white' : 'text-slate-300'}">{row.node.name}</span>
          <span class="text-[10px] text-slate-500 shrink-0">{packsUnder(row.node)}</span>
        </div>
      {:else}
        {@const pack = row.pack}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="group flex items-start gap-3 p-4 rounded-lg border border-slate-700
                 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600
                 cursor-pointer transition-colors"
          style="margin-left: {row.depth * 16}px"
          data-testid="pack-row"
          on:click={() => dispatch('open', pack)}
        >
          <div class="text-slate-500 mt-0.5 shrink-0"><Icon name="book" size={18} /></div>

          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">{pack.title}
              {#if pack.is_template}<span class="ml-2 rounded bg-purple-900/50 border border-purple-700/60 px-1.5 py-0.5 text-[10px] font-normal text-purple-200 align-middle">Template</span>{/if}
            </p>
            {#if pack.description}<p class="text-xs text-slate-400 mt-1 line-clamp-2">{pack.description}</p>{/if}
            <p class="text-xs text-slate-500 mt-1.5">
              Updated {fmtDate(pack.updated_at ?? pack.created_at)}
              {#if pack.template_id} · from {titleOf(pack.template_id)}{/if}
              {#if flat && pack.folder_id} · in {folderLabel($dossierStore.packFolders, pack.folder_id)}{/if}
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-1 shrink-0">
            {#if pack.is_template}
              <ProtectedButton action="modify" variant="primary" size="small"
                      title="Start a new dossier from this template"
                      on:click={(e) => { e.stopPropagation(); dispatch('useTemplate', pack); }}>Use</ProtectedButton>
            {/if}
            {#if !pack.is_template || isAdmin}
              <ProtectedButton action="modify" variant="secondary" size="small"
                      on:click={(e) => { e.stopPropagation(); dispatch('edit', pack); }}>Edit</ProtectedButton>
            {/if}
            {#if !pack.is_template}
              <ProtectedButton action="modify" variant="secondary" size="small"
                      title="Make an independent copy of this dossier"
                      on:click={(e) => { e.stopPropagation(); dispatch('duplicate', pack); }}>Duplicate</ProtectedButton>
            {/if}
            {#if !flat && (canFolders && (kind === 'dossier' || isAdmin))}
              <ProtectedButton action="modify" variant="secondary" size="small"
                      title="Move this pack to another folder"
                      on:click={(e) => { e.stopPropagation(); startMovePack(pack); }}>Move…</ProtectedButton>
            {/if}
            {#if !pack.is_template || isAdmin}
              <ProtectedButton action="modify" variant="secondary" size="small"
                      on:click={(e) => { e.stopPropagation(); dispatch('archive', pack); }}>{pack.status === 'archived' ? 'Restore' : 'Archive'}</ProtectedButton>
            {/if}
            <ProtectedButton requireAdmin={true} variant="danger" size="small"
                    title={pack.is_template ? 'Delete this template — only once no dossier is based on it' : 'Delete this pack and everything in it'}
                    on:click={(e) => { e.stopPropagation(); dispatch('delete', pack); }}>Delete</ProtectedButton>
          </div>
        </div>
      {/if}
    {/each}

    {#if rows.length === 0}
      <p class="text-xs text-slate-600 italic py-1">{kind === 'template' ? 'No templates yet.' : 'No dossiers yet.'}</p>
    {/if}
  </div>
</div>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={busy}
  title="Delete folder"
  message={deleteMessage}
  confirmText="Delete folder"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
