<!-- src/lib/apps/dossier/DossierApp.svelte -->
<!-- Dossier — author briefing Packs for people outside the portal.
     P0: internal authoring only. Nothing published, nothing leaves the portal.
     Plan: docs/requirements/Dossier_P0_Build_Plan.md -->
<script>
  import { onMount }     from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';

  import { dossierStore } from './stores/dossierStore.js';
  import PackList         from './components/PackList.svelte';
  import PackFormModal    from './components/PackFormModal.svelte';
  import PackWorkspace    from './components/PackWorkspace.svelte';

  let appError      = '';
  let showPackModal = false;
  let editingPack   = null;
  let packModalRef;

  // null = the pack list; set = the authoring workspace for that pack.
  let openPackId = null;

  // Pending destructive action (house pattern — never confirm()).
  let pendingDelete = null;
  let deletingId    = null;

  $: packs    = $dossierStore.packs;
  $: openPack = openPackId ? (packs.find(p => p.id === openPackId) ?? null) : null;

  onMount(async () => {
    await permissions.init($auth.user.id, 'dossier');
    try {
      await dossierStore.loadPacks();
    } catch (err) {
      appError = err.message;
    }
  });

  // ── Pack CRUD ─────────────────────────────────────────────────────────────

  function openNewPack()     { editingPack = null; showPackModal = true; }
  function openEditPack(p)   { editingPack = p;    showPackModal = true; }

  async function handlePackSave(e) {
    // Capture before the await — Svelte 5 flushes effects synchronously, so
    // `editingPack` may have changed by the time this resolves.
    const target = editingPack;
    const data   = e.detail;
    const userId = $auth.user.id;
    try {
      if (target) await dossierStore.updatePack(target.id, data, userId);
      else        await dossierStore.createPack(data, userId);
      showPackModal = false;
      packModalRef?.done();
    } catch (err) {
      packModalRef?.fail(err.message);
    }
  }

  async function handleArchive(pack) {
    const { id, status } = pack;
    try {
      await dossierStore.setArchived(id, status !== 'archived', $auth.user.id);
    } catch (err) {
      appError = err.message;
    }
  }

  function requestDelete(pack) { pendingDelete = pack; }

  async function confirmDelete() {
    const { id, title } = pendingDelete;
    deletingId = id;
    try {
      await dossierStore.deletePack(id, title);
      pendingDelete = null;
    } catch (err) {
      appError = err.message;
    } finally {
      deletingId = null;
    }
  }

  async function handleOpen(pack) {
    const packId = pack.id;          // capture before the await
    openPackId = packId;
    try {
      await dossierStore.loadDocs(packId);
    } catch (err) {
      appError = err.message;
    }
  }

  function backToPacks() {
    openPackId = null;
    dossierStore.closePack();
  }
</script>

<div class="flex flex-col h-full">

  <!-- App header -->
  <div class="flex items-center gap-3 px-5 py-3 border-b border-slate-700
              bg-slate-800/50 shrink-0">
    <h1 class="text-lg font-bold text-white">Dossier</h1>
    <span class="text-xs text-slate-500">Briefing packs</span>
  </div>

  {#if appError}
    <div class="px-4 pt-3">
      <ErrorDisplay message={appError} onDismiss={() => appError = ''} />
    </div>
  {/if}

  <div class="flex-1 min-h-0">
    {#if openPack}
      <PackWorkspace pack={openPack} on:back={backToPacks} />
    {:else}
      <PackList
        {packs}
        loading={$dossierStore.loading}
        on:new={openNewPack}
        on:open={(e)    => handleOpen(e.detail)}
        on:edit={(e)    => openEditPack(e.detail)}
        on:archive={(e) => handleArchive(e.detail)}
        on:delete={(e)  => requestDelete(e.detail)}
      />
    {/if}
  </div>
</div>

<PackFormModal
  bind:this={packModalRef}
  bind:show={showPackModal}
  pack={editingPack}
  on:save={handlePackSave}
  on:close={() => showPackModal = false}
/>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete pack?"
  message={pendingDelete
    ? `"${pendingDelete.title}" and every document inside it will be permanently deleted. This cannot be undone.`
    : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
