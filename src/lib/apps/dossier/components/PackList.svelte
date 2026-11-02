<!-- src/lib/apps/dossier/components/PackList.svelte -->
<!-- The Pack list — the app's landing surface, in two sections: TEMPLATES (made by an
     administrator, readable by everyone with the Dossier grant) and the person's own
     DOSSIERS. Each section is a tree of folders and packs (PackSection). Archived
     packs show as a flat list. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher } from 'svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner  from '#lib/components/common/LoadingSpinner.svelte';
  import { permissions } from '#lib/stores/permissions.js';
  import { dossierStore } from '../stores/dossierStore.js';
  import PackSection from './PackSection.svelte';

  export let packs   = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  let showArchived = false;
  /** The folder selected in each section, so "new" files into it. */
  let templateFolderId = null;
  let dossierFolderId = null;

  $: isAdmin = $permissions.isAdmin;
  $: canModify = $permissions.isAdmin || $permissions.canModify;
  $: inView = (p) => (showArchived ? p.status === 'archived' : p.status !== 'archived');
  $: templates = packs.filter(p => p.is_template && inView(p));
  $: dossiers  = packs.filter(p => !p.is_template && inView(p));
  $: templateFolders = $dossierStore.packFolders.filter(f => f.kind === 'template');
  $: dossierFolders  = $dossierStore.packFolders.filter(f => f.kind === 'dossier');
  $: archivedCount = packs.filter(p => p.status === 'archived').length;
  $: titleOf = (id) => packs.find(p => p.id === id)?.title ?? 'a template';
  $: nothing = templates.length === 0 && dossiers.length === 0;

  // Section events are passed up with the folder the new thing should go in.
  const up = (name) => (e) => dispatch(name, e.detail);
</script>

<div class="flex flex-col h-full">

  <!-- Toolbar -->
  <div class="flex items-center gap-3 px-5 py-3 border-b border-slate-700 shrink-0">
    <p class="text-sm font-semibold text-white">
      {showArchived ? 'Archived' : 'Packs'}
      {#if !loading}<span class="text-slate-500 font-normal">({templates.length + dossiers.length})</span>{/if}
    </p>

    <div class="flex-1"></div>

    {#if archivedCount > 0 || showArchived}
      <Button variant="tertiary" size="xs" on:click={() => showArchived = !showArchived}>{showArchived ? '← Back to active' : `Archived (${archivedCount})`}</Button>
    {/if}

    <!-- Not a filter on this list: it shows PUBLICATIONS, of which one pack can
         have several, and the question it answers spans every pack. -->
    <Button variant="tertiary" size="xs" title="Every link issued from every pack" on:click={() => dispatch('showPublished')}>Published links</Button>

    {#if isAdmin}
      <Button admin size="small" title="A template other people start their dossiers from" on:click={() => dispatch('newTemplate', { folderId: showArchived ? null : templateFolderId })}>+ New Template</Button>
    {/if}

    <ProtectedButton action="modify" variant="secondary" size="small" title="Build a whole pack from a script and the files it names" on:click={() => dispatch('importScript', { folderId: showArchived ? null : dossierFolderId })}>
      Import script…
    </ProtectedButton>

    <ProtectedButton action="modify" variant="primary" size="small" on:click={() => dispatch('new', { folderId: showArchived ? null : dossierFolderId })}>
      + New Pack
    </ProtectedButton>
  </div>

  <!-- Body -->
  <div class="flex-1 min-h-0 overflow-y-auto p-4">
    {#if loading}
      <div class="flex items-center justify-center py-16">
        <LoadingSpinner size="large" text="Loading packs…" />
      </div>

    {:else if nothing && !isAdmin && dossierFolders.length === 0}
      <div class="text-center py-16 px-4">
        <p class="text-slate-400 text-sm">
          {showArchived ? 'Nothing archived.' : 'No packs yet.'}
        </p>
        {#if !showArchived}
          <p class="text-slate-500 text-xs mt-2 max-w-md mx-auto">
            A pack is a briefing you assemble for someone outside the portal —
            a narrative, a chronology and the evidence behind it.
          </p>
        {/if}
      </div>

    {:else}
      {#if templates.length || (isAdmin && !showArchived)}
        <PackSection
          kind="template" label="Templates"
          note="Starting points. A dossier made from one copies its pages and tables and can use its files."
          folders={templateFolders} packs={templates} flat={showArchived}
          {isAdmin} canFolders={isAdmin} {titleOf}
          bind:selectedId={templateFolderId}
          on:open={up('open')} on:edit={up('edit')} on:archive={up('archive')} on:delete={up('delete')}
          on:useTemplate={(e) => dispatch('useTemplate', { template: e.detail, folderId: dossierFolderId })}
        />
      {/if}
      <PackSection
        kind="dossier" label="Dossiers" note=""
        folders={dossierFolders} packs={dossiers} flat={showArchived}
        {isAdmin} canFolders={canModify} {titleOf}
        bind:selectedId={dossierFolderId}
        on:open={up('open')} on:edit={up('edit')} on:archive={up('archive')} on:delete={up('delete')}
        on:duplicate={up('duplicate')}
      />
    {/if}
  </div>
</div>
