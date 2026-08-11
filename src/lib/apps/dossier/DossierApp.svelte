<!-- src/lib/apps/dossier/DossierApp.svelte -->
<!-- Dossier — author briefing Packs for people outside the portal.
     P0: internal authoring only. Nothing published, nothing leaves the portal.
     Plan: docs/requirements/Dossier_P0_Build_Plan.md -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';

  import { dossierStore } from './stores/dossierStore.js';
  import PackList         from './components/PackList.svelte';
  import PackFormModal    from './components/PackFormModal.svelte';
  import PackWorkspace    from './components/PackWorkspace.svelte';

  /** A caught value is `unknown`; narrow it without asserting a type. */
  const errMessage = (err) => (err instanceof Error ? err.message : String(err));

  let appError      = '';
  let showPackModal = false;
  let editingPack   = null;
  let packModalRef;

  // null = the pack list; set = the authoring workspace for that pack.
  let openPackId = null;

  // ── Bounding the app's height ─────────────────────────────────────────────
  // The portal shell is `min-h-screen` with a sticky nav, so the DOCUMENT
  // scrolls and no ancestor has a fixed height. Dossier is a two-pane editor
  // and needs the opposite: a bounded box whose panes scroll internally, or the
  // toolbar and page tree scroll off the top as soon as a page gets long.
  //
  // Measured rather than a calc() against the shell's nav height and padding —
  // those are someone else's numbers and would break silently if they changed.
  let shellEl;
  let shellStyle = '';

  function measure() {
    if (!shellEl) return;
    const top = shellEl.getBoundingClientRect().top + window.scrollY;
    // The shell's <main> has bottom padding below us; without subtracting it the
    // box overruns the viewport and the whole page drifts by that much.
    const parent = shellEl.parentElement;
    const padBottom = parent
      ? parseFloat(window.getComputedStyle(parent).paddingBottom) || 0
      : 0;
    shellStyle = `height: calc(100vh - ${Math.max(0, Math.round(top + padBottom))}px)`;
  }

  onMount(() => {
    // After layout has settled, or the measurement reads a pre-style position.
    requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') window.removeEventListener('resize', measure);
  });

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
      appError = errMessage(err);
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
      packModalRef?.fail(errMessage(err));
    }
  }

  async function handleArchive(pack) {
    const { id, status } = pack;
    try {
      await dossierStore.setArchived(id, status !== 'archived', $auth.user.id);
    } catch (err) {
      appError = errMessage(err);
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
      appError = errMessage(err);
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
      appError = errMessage(err);
    }
  }

  function backToPacks() {
    openPackId = null;
    dossierStore.closePack();
  }
</script>

<div class="flex flex-col overflow-hidden" bind:this={shellEl} style={shellStyle}>

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
