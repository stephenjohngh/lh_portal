<!-- src/lib/apps/dossier/DossierApp.svelte -->
<!-- Dossier — author briefing Packs for people outside the portal.
     P0: internal authoring only. Nothing published, nothing leaves the portal.
     Plan: docs/requirements/build_plans/Dossier_P0_Build_Plan.md -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { errMessage } from '#lib/utils/errors.js';
  import { onMount, onDestroy } from 'svelte';
  import { auth }        from '#lib/stores/auth.js';
  import { permissions } from '#lib/stores/permissions.js';
  import ErrorDisplay    from '#lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog   from '#lib/components/common/ConfirmDialog.svelte';

  import { dossierStore } from './stores/dossierStore.js';
  import PackList         from './components/PackList.svelte';
  import PackFormModal    from './components/PackFormModal.svelte';
  import PackWorkspace    from './components/PackWorkspace.svelte';
  import DuplicatePackModal from './components/DuplicatePackModal.svelte';
  import PublishedPacksList from './components/PublishedPacksList.svelte';
  import { copyTitle }    from './utils/packCopy.js';

  /** A caught value is `unknown`; narrow it without asserting a type. */

  let appError      = '';
  let showPackModal = false;
  let editingPack   = null;
  let creatingTemplate = false;   // the form is making a template, not a dossier
  let startTemplateId  = '';      // a template to start the new dossier from
  let newFolderId      = null;    // the folder the new pack or template goes into
  let packModalRef;

  // null = the pack list; set = the authoring workspace for that pack.
  let openPackId = null;

  /**
   * The cross-pack Published view. A peer of the pack list, not a pack: the
   * question it answers — what is reachable from outside the portal — cuts
   * across every pack, and the per-pack Links panel cannot see past its own.
   */
  let publishedView = false;
  let loadingPublished = false;

  async function showPublished() {
    publishedView = true;
    loadingPublished = true;
    try {
      await dossierStore.loadAllPublications();
    } catch (err) {
      appError = errMessage(err);
    } finally {
      loadingPublished = false;
    }
  }

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

  // The pack list reads as loading until the packs have been read. Before
  // that the store is empty because it has not been read, and "No packs yet"
  // would be untrue for the moment it showed.
  let ready = false;

  onMount(async () => {
    try {
      await permissions.init($auth.user.id, 'dossier');
      try {
        await Promise.all([dossierStore.loadPacks(), dossierStore.loadPackFolders()]);
      } catch (err) {
        appError = errMessage(err);
      }
    } finally {
      ready = true;
    }
  });

  // ── Pack CRUD ─────────────────────────────────────────────────────────────

  function openNewPack(templateId = '', folderId = null) { editingPack = null; creatingTemplate = false; startTemplateId = templateId; newFolderId = folderId; showPackModal = true; }
  function openNewTemplate(folderId = null) { editingPack = null; creatingTemplate = true; startTemplateId = ''; newFolderId = folderId; showPackModal = true; }
  function openEditPack(p)   { editingPack = p; creatingTemplate = false; startTemplateId = ''; newFolderId = null; showPackModal = true; }

  async function handlePackSave(e) {
    // Capture before the await — Svelte 5 flushes effects synchronously, so
    // `editingPack` may have changed by the time this resolves.
    const target = editingPack;
    const data   = e.detail;
    const userId = $auth.user.id;
    try {
      if (target) {
        await dossierStore.updatePack(target.id, data, userId);
      } else if (data.isTemplate) {
        await dossierStore.createPack({ ...data, is_template: true, folder_id: newFolderId }, userId);
      } else if (data.templateId) {
        // One-off copy of the template's pages and tables; its files are READ,
        // not copied. Later changes to the template do not reach this dossier.
        const template = packs.find(p => p.id === data.templateId);
        if (!template) throw new Error('That template is no longer available.');
        const { pack } = await dossierStore.duplicatePack(
          template, { title: data.title, fromTemplate: true, folderId: newFolderId }, userId);
        await dossierStore.updatePack(pack.id, { title: pack.title, description: data.description ?? null }, userId);
      } else {
        await dossierStore.createPack({ ...data, folder_id: newFolderId }, userId);
      }
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

  // ── Duplicating a pack (the template workflow) ────────────────────────────

  let duplicateSource   = null;
  let duplicateContents = null;
  let duplicateLoading  = false;
  let showDuplicate     = false;
  let duplicateModalRef;
  let duplicateNotice   = '';

  $: duplicateTitle = duplicateSource
    ? copyTitle(duplicateSource.title, packs.map(p => p.title))
    : '';

  async function requestDuplicate(pack) {
    duplicateSource   = pack;
    duplicateContents = null;
    duplicateLoading  = true;
    showDuplicate     = true;
    duplicateNotice   = '';
    try {
      // Read the source up front so the dialog can state what the copy will
      // contain — the counts are the whole point of asking before doing it.
      duplicateContents = await dossierStore.readPackContents(pack.id);
    } catch (err) {
      duplicateModalRef?.fail(errMessage(err));
    } finally {
      duplicateLoading = false;
    }
  }

  async function handleDuplicate(e) {
    const source  = duplicateSource;      // capture before the await
    const options = e.detail;
    const userId  = $auth.user.id;
    try {
      const { pack, plan, skippedFiles } =
        await dossierStore.duplicatePack(source, options, userId);
      showDuplicate   = false;
      duplicateSource = null;

      // Say what did not come across. A gap the author knows about is a choice;
      // one they find later, in a published pack, is a fault.
      const notes = [];
      if (skippedFiles?.length) {
        notes.push(`${skippedFiles.length} file${skippedFiles.length === 1 ? '' : 's'} ` +
          `could not be copied (${skippedFiles[0].reason})`);
      }
      if (plan?.dropped?.files) {
        notes.push(`${plan.dropped.files} reference${plan.dropped.files === 1 ? '' : 's'} ` +
          'to a file now shows a gap');
      }
      duplicateNotice = notes.length
        ? `"${pack.title}" created — ${notes.join('; ')}.`
        : '';
    } catch (err) {
      duplicateModalRef?.fail(errMessage(err));
    }
  }

  /**
   * A template can be deleted once no dossier is based on it. While any is, say
   * which — they are made from it, so deleting it first would break their pictures.
   * (The database refuses too; this is the explanation, not the guard.)
   */
  async function requestDelete(pack) {
    if (pack.is_template) {
      try {
        const users = await dossierStore.templateUsers(pack.id);
        if (users.length) {
          appError = `“${pack.title}” cannot be deleted yet: ${users.length} dossier${users.length === 1 ? ' is' : 's are'} based on it ` +
            `(${users.slice(0, 5).map(u => u.title).join(', ')}${users.length > 5 ? ', …' : ''}). Delete ${users.length === 1 ? 'it' : 'them'} first.`;
          return;
        }
      } catch (err) { appError = errMessage(err); return; }
    }
    pendingDelete = pack;
  }

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
    publishedView = false;
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

  <!-- App header. Hidden once a pack is open: the workspace header directly
       below already carries "← Packs" and the pack's title, so this row is pure
       repetition at exactly the moment vertical space is scarcest. -->
  {#if !openPack}
    <div class="flex items-center gap-3 px-5 py-3 border-b border-slate-700
                bg-slate-800/50 shrink-0">
      <h1 class="text-lg font-bold text-white">Dossier</h1>
      <span class="text-xs text-slate-500">Briefing packs</span>
    </div>
  {/if}

  {#if appError}
    <div class="px-4 pt-3">
      <ErrorDisplay message={appError} onDismiss={() => appError = ''} />
    </div>
  {/if}

  {#if duplicateNotice}
    <div class="px-4 pt-3">
      <div class="flex items-start gap-2 p-3 rounded border border-amber-500/40
                  bg-amber-500/10">
        <p class="text-xs text-amber-200 flex-1">{duplicateNotice}</p>
        <Button variant="tertiary" size="xs" on:click={() => duplicateNotice = ''}>Dismiss</Button>
      </div>
    </div>
  {/if}

  <div class="flex-1 min-h-0">
    {#if openPack}
      <PackWorkspace pack={openPack} on:back={backToPacks} />
    {:else if publishedView}
      <PublishedPacksList
        publications={$dossierStore.allPublications}
        {packs}
        loading={loadingPublished}
        on:openPack={(e) => handleOpen({ id: e.detail })}
        on:back={() => (publishedView = false)}
      />
    {:else}
      <PackList
        {packs}
        loading={!ready || $dossierStore.loading}
        on:new={(e) => openNewPack('', e.detail?.folderId ?? null)}
        on:newTemplate={(e) => openNewTemplate(e.detail?.folderId ?? null)}
        on:useTemplate={(e) => openNewPack(e.detail.template.id, e.detail.folderId ?? null)}
        on:open={(e)    => handleOpen(e.detail)}
        on:edit={(e)    => openEditPack(e.detail)}
        on:archive={(e) => handleArchive(e.detail)}
        on:duplicate={(e) => requestDuplicate(e.detail)}
        on:delete={(e)  => requestDelete(e.detail)}
        on:showPublished={showPublished}
      />
    {/if}
  </div>
</div>

<PackFormModal
  bind:this={packModalRef}
  bind:show={showPackModal}
  pack={editingPack}
  isTemplate={creatingTemplate}
  templates={packs.filter(p => p.is_template && p.status !== 'archived')}
  {startTemplateId}
  on:save={handlePackSave}
  on:close={() => showPackModal = false}
/>

<DuplicatePackModal
  bind:this={duplicateModalRef}
  bind:show={showDuplicate}
  pack={duplicateSource}
  contents={duplicateContents}
  loading={duplicateLoading}
  suggestedTitle={duplicateTitle}
  on:duplicate={handleDuplicate}
  on:close={() => { showDuplicate = false; duplicateSource = null; }}
/>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete pack?"
  message={pendingDelete
    ? (pendingDelete.is_template
        ? `The template "${pendingDelete.title}", its pages, tables and every file in it will be permanently deleted. No dossier is based on it. This cannot be undone.`
        : `"${pendingDelete.title}", every document inside it and its attached files will be permanently deleted, and any link sent from it will stop working. This cannot be undone.`)
    : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
