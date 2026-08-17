<!-- src/lib/apps/info/InfoApp.svelte -->
<!-- Info repository: section-organised notes with document attachments. -->
<script>
  import { onMount }      from 'svelte';
  import { get }          from 'svelte/store';
  import { getPref, setPref } from '$lib/utils/prefs';
  import { auth }         from '$lib/stores/auth';
  import { permissions }  from '$lib/stores/permissions';
  import { getLogger }    from '$lib/utils/logger';
  import { logAudit }     from '$lib/utils/auditLogger';
  import ErrorDisplay     from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog    from '$lib/components/common/ConfirmDialog.svelte';
  import LoadingSpinner   from '$lib/components/common/LoadingSpinner.svelte';

  import { infoStore }    from './stores/infoStore.js';
  import { isPublished }  from './utils/infoHelpers.js';
  import SectionSidebar   from './components/SectionSidebar.svelte';
  import NoteList         from './components/NoteList.svelte';
  import NoteView         from './components/NoteView.svelte';
  import PublishedList    from './components/PublishedList.svelte';
  import SectionFormModal from './components/modals/SectionFormModal.svelte';
  import NoteFormModal    from './components/modals/NoteFormModal.svelte';

  const logger = getLogger('InfoApp');

  // Remember the last-viewed section + note per browser, restored on re-entry
  // (same pattern as Building Assets' Plan View floor/plan memory).
  const LS_SECTION = 'info:lastSectionId';
  const LS_NOTE    = 'info:lastNoteId';

  // ── State ─────────────────────────────────────────────────────────────────

  let selectedSectionId = null;   // null = All Notes
  let viewingNoteId     = null;   // null = list view

  // Modal state
  let showSectionModal  = false;
  let editingSection    = null;
  let showNoteModal     = false;
  let editingNote       = null;
  let appError          = '';

  // Refs to modal instances for done/fail callbacks
  let sectionModalRef;
  let noteModalRef;

  $: sections     = $infoStore.sections;
  $: notes        = $infoStore.notes;
  $: selectedNote = $infoStore.selectedNote;
  $: selectedSection = selectedSectionId
    ? (sections.find(s => s.id === selectedSectionId) ?? null)
    : null;

  // Note counts per section (for sidebar badges)
  $: noteCounts = notes.reduce((acc, n) => {
    if (n.status !== 'archived') {
      acc[n.section_id] = (acc[n.section_id] ?? 0) + 1;
    }
    return acc;
  }, {});

  // ── Boot ──────────────────────────────────────────────────────────────────

  onMount(async () => {
    await permissions.init($auth.user.id, 'info');
    try {
      await infoStore.loadSections();
      await infoStore.loadNotes(null);

      // Restore last-viewed section + note (read from the store directly — the
      // reactive `sections`/`notes` may not have flushed yet post-await).
      const state = get(infoStore);
      const savedSection = getPref(LS_SECTION);
      if (savedSection && state.sections.some(s => s.id === savedSection)) {
        selectedSectionId = savedSection;
      }
      const savedNote = getPref(LS_NOTE);
      if (savedNote) {
        const n = state.notes.find(x => x.id === savedNote);
        if (n) await selectNote(n);
      }
    } catch (err) {
      appError = err.message;
    }
  });

  // Section selection is a client-side filter — all notes stay loaded so the
  // sidebar counts (derived from the full `notes` array) remain correct.
  /**
   * The Published view is a peer of a section, not one of them: it cuts
   * across every section, so it cannot be expressed as a selectedSectionId.
   */
  let publishedView = false;

  function showPublished() {
    publishedView = true;
    viewingNoteId = null;
    infoStore.clearNote();
    setPref(LS_NOTE, null);
  }

  function selectSection(sectionId) {
    publishedView = false;
    selectedSectionId = sectionId;
    viewingNoteId     = null;
    infoStore.clearNote();
    setPref(LS_SECTION, sectionId);
    setPref(LS_NOTE, null);
  }

  // Notes shown in the list: filtered to the selected section (or all).
  $: visibleNotes = selectedSectionId
    ? notes.filter(n => n.section_id === selectedSectionId)
    : notes;

  // ── Note selection ────────────────────────────────────────────────────────

  async function selectNote(note) {
    viewingNoteId = note.id;
    setPref(LS_NOTE, note.id);
    try {
      await infoStore.loadNote(note.id);
    } catch (err) {
      appError = err.message;
    }
  }

  function backToList() {
    viewingNoteId = null;
    setPref(LS_NOTE, null);
    infoStore.clearNote();
  }

  // ── Section CRUD ──────────────────────────────────────────────────────────

  function openNewSection()   { editingSection = null; showSectionModal = true; }
  function openEditSection(s) { editingSection = s;    showSectionModal = true; }

  async function handleSectionSave(e) {
    const data = e.detail;
    try {
      if (editingSection) {
        await infoStore.updateSection(editingSection.id, data, $auth.user.id);
      } else {
        await infoStore.createSection(data, $auth.user.id);
      }
      showSectionModal = false;
      sectionModalRef?.done();
    } catch (err) {
      sectionModalRef?.fail(err.message);
    }
  }

  async function handleSectionDelete(section) {
    try {
      await infoStore.deleteSection(section.id, section.name);
      if (selectedSectionId === section.id) selectSection(null);
      // The section's notes were cascade-deleted in the DB — refresh the full set.
      await infoStore.loadNotes(null);
    } catch (err) {
      appError = err.message;
    }
  }

  // ── Note CRUD ─────────────────────────────────────────────────────────────

  function openNewNote()    { editingNote = null; showNoteModal = true; }
  function openEditNote(n)  { editingNote = n;    showNoteModal = true; }

  async function handleNoteSave(e) {
    const data = e.detail;
    try {
      if (editingNote) {
        await infoStore.updateNote(editingNote.id, data, $auth.user.id);
        // If currently viewing this note, reload full detail
        if (viewingNoteId === editingNote.id) {
          await infoStore.loadNote(editingNote.id);
        }
      } else {
        const note = await infoStore.createNote(data, $auth.user.id);
        // Reload the full notes list so the new note appears with joins (and
        // section counts stay correct — we always hold all notes).
        await infoStore.loadNotes(null);
        // Navigate to the new note
        await selectNote(note);
      }
      showNoteModal = false;
      noteModalRef?.done();
    } catch (err) {
      noteModalRef?.fail(err.message);
    }
  }

  async function handleNoteDelete(note) {
    try {
      await infoStore.deleteNote(note.id, note.title);
      viewingNoteId = null;
      setPref(LS_NOTE, null);
    } catch (err) {
      appError = err.message;
    }
  }

  async function handleTogglePin(note) {
    try {
      await infoStore.togglePin(note.id, note.is_pinned);
    } catch (err) {
      appError = err.message;
    }
  }

  /**
   * Archiving a PUBLISHED note also takes it off the internet, so that one is
   * asked about first. Archiving an internal note is an everyday tidy-up and
   * gets no dialog — a confirmation on the common case is how people learn to
   * click through confirmations without reading them.
   */
  let pendingArchive = null;
  let archiving = false;

  async function handleArchive(note) {
    const archiving_ = note.status !== 'archived';
    if (archiving_ && isPublished(note)) { pendingArchive = note; return; }
    await runArchive(note, archiving_);
  }

  async function runArchive(note, archived) {
    archiving = true;
    try {
      await infoStore.setArchived(note, archived);
      pendingArchive = null;
    } catch (err) {
      appError = err.message;
    } finally {
      archiving = false;
    }
  }

  // ── Document attachments ────────────────────────────────────────────────────
  // The AttachedDocuments panel (in NoteView) owns the document I/O; here we
  // just audit-log its uploaded/deleted events.

  function handleDocUploaded(e) {
    const doc = e.detail;
    logAudit('create', 'info_document', doc.id, doc.display_name || doc.filename,
      { appId: 'info', eventCategory: 'info', severity: 'info',
        afterData: { note_id: viewingNoteId, filename: doc.filename } });
  }

  function handleDocDeleted(e) {
    const doc = e.detail;
    logAudit('delete', 'info_document', doc.id, doc.display_name || doc.filename,
      { appId: 'info', eventCategory: 'info', severity: 'info' });
  }
</script>

<!-- ── Root layout ───────────────────────────────────────────────────────── -->
<div class="flex flex-col h-full">

  <!-- App header -->
  <div class="flex items-center gap-3 px-5 py-3 border-b border-slate-700
              bg-slate-800/50 shrink-0">
    <h1 class="text-lg font-bold text-white">Info</h1>
    <span class="text-xs text-slate-500">Building information repository</span>
  </div>

  {#if appError}
    <div class="px-4 pt-3">
      <ErrorDisplay message={appError} onDismiss={() => appError = ''} />
    </div>
  {/if}

  {#if $infoStore.loadingSections}
    <div class="flex-1 flex items-center justify-center">
      <LoadingSpinner size="large" />
    </div>

  {:else}
    <div class="flex flex-1 min-h-0">

      <!-- Sidebar -->
      <SectionSidebar
        {sections}
        selectedId={selectedSectionId}
        {noteCounts}
        {notes}
        openNoteId={viewingNoteId}
        {publishedView}
        on:select={(e) => selectSection(e.detail)}
        on:selectNote={(e) => selectNote(e.detail)}
        on:showPublished={showPublished}
        on:newSection={openNewSection}
        on:edit={(e) => openEditSection(e.detail)}
        on:delete={(e) => handleSectionDelete(e.detail)}
      />

      <!-- Main content -->
      <div class="flex-1 min-w-0 flex flex-col">
        {#if viewingNoteId}
          <NoteView
            note={selectedNote}
            loading={$infoStore.loadingNote}
            on:back={backToList}
            on:edit={(e)       => openEditNote(e.detail)}
            on:delete={(e)     => handleNoteDelete(e.detail)}
            on:togglePin={(e)  => handleTogglePin(e.detail)}
            on:archive={(e)    => handleArchive(e.detail)}
            on:docUploaded={handleDocUploaded}
            on:docDeleted={handleDocDeleted}
          />
        {:else if publishedView}
          <PublishedList
            {notes}
            loading={$infoStore.loadingNotes}
            on:select={(e) => selectNote(e.detail)}
          />
        {:else}
          <NoteList
            notes={visibleNotes}
            loading={$infoStore.loadingNotes}
            showSection={selectedSectionId === null}
            section={selectedSection}
            on:select={(e) => selectNote(e.detail)}
            on:new={openNewNote}
            on:editSection={(e) => openEditSection(e.detail)}
          />
        {/if}
      </div>

    </div>
  {/if}
</div>

<!-- ── Modals ─────────────────────────────────────────────────────────────── -->

<SectionFormModal
  bind:this={sectionModalRef}
  bind:show={showSectionModal}
  section={editingSection}
  on:save={handleSectionSave}
  on:close={() => showSectionModal = false}
/>

<NoteFormModal
  bind:this={noteModalRef}
  bind:show={showNoteModal}
  note={editingNote}
  {sections}
  sectionId={selectedSectionId}
  on:save={handleNoteSave}
  on:close={() => showNoteModal = false}
/>

<!-- Archiving something the public can read is not the same act as archiving a
     note, so it says what will actually happen to a reader rather than asking
     "are you sure?". -->
<ConfirmDialog
  show={!!pendingArchive}
  danger={true}
  processing={archiving}
  title="Archive and unpublish?"
  message={pendingArchive
    ? `"${pendingArchive.title}" is currently readable outside the portal`
      + (pendingArchive.visibility === 'public'
          ? ` by anyone, at /info/${pendingArchive.slug ?? ''}`
          : ' by signed-in users with the Info permission')
      + '. Archiving it will also unpublish it, so that address stops working '
      + 'and anyone who has linked to it will get a not-found page. '
      + 'Restoring the note later will NOT put it back online — you would '
      + 'publish it again yourself, and it would keep the same address.'
    : ''}
  confirmText="Archive and unpublish"
  on:confirm={() => runArchive(pendingArchive, true)}
  on:cancel={() => pendingArchive = null}
/>
