<!-- src/lib/apps/dossier/DossierApp.svelte -->
<!-- Dossier — author briefing Packs for people outside the portal.
     P0: internal authoring only. Nothing published, nothing leaves the portal.
     Plan: docs/requirements/Dossier_P0_Build_Plan.md -->
<script>
  import { onMount }     from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { getLogger }   from '$lib/utils/logger';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';

  import { dossierStore } from './stores/dossierStore.js';
  import PackList         from './components/PackList.svelte';
  import PackFormModal    from './components/PackFormModal.svelte';

  const logger = getLogger('DossierApp');

  let appError      = '';
  let showPackModal = false;
  let editingPack   = null;
  let packModalRef;

  // Pending destructive action (house pattern — never confirm()).
  let pendingDelete = null;
  let deletingId    = null;

  $: packs = $dossierStore.packs;

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

  // Opening a pack lands in the next build step (the doc tree + editor).
  function handleOpen(pack) {
    logger('open pack (workspace lands in the next step)', pack.id);
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
    <PackList
      {packs}
      loading={$dossierStore.loading}
      on:new={openNewPack}
      on:open={(e)    => handleOpen(e.detail)}
      on:edit={(e)    => openEditPack(e.detail)}
      on:archive={(e) => handleArchive(e.detail)}
      on:delete={(e)  => requestDelete(e.detail)}
    />
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
