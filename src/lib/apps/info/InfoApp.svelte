<!-- src/lib/apps/info/InfoApp.svelte -->
<!-- Info repository: section-organised notes with document attachments. -->
<script>
  import { onMount }      from 'svelte';
  import { auth }         from '$lib/stores/auth';
  import { permissions }  from '$lib/stores/permissions';
  import { getLogger }    from '$lib/utils/logger';
  import ErrorDisplay     from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner   from '$lib/components/common/LoadingSpinner.svelte';

  import { infoStore }    from './stores/infoStore.js';
  import SectionSidebar   from './components/SectionSidebar.svelte';
  import NoteList         from './components/NoteList.svelte';
  import NoteView         from './components/NoteView.svelte';
  import SectionFormModal from './components/modals/SectionFormModal.svelte';
  import NoteFormModal    from './components/modals/NoteFormModal.svelte';
  import UploadDocModal   from './components/modals/UploadDocModal.svelte';

  const logger = getLogger('InfoApp');

  // ── State ─────────────────────────────────────────────────────────────────

  let selectedSectionId = null;   // null = All Notes
  let viewingNoteId     = null;   // null = list view

  // Modal state
  let showSectionModal  = false;
  let editingSection    = null;
  let showNoteModal     = false;
  let editingNote       = null;
  let showUploadModal   = false;
  let appError          = '';

  // Refs to modal instances for done/fail callbacks
  let sectionModalRef;
  let noteModalRef;
  let uploadModalRef;

  $: sections     = $infoStore.sections;
  $: notes        = $infoStore.notes;
  $: selectedNote = $infoStore.selectedNote;

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
    } catch (err) {
      appError = err.message;
    }
  });

  // Reload notes when selected section changes
  async function selectSection(sectionId) {
    selectedSectionId = sectionId;
    viewingNoteId     = null;
    infoStore.clearNote();
    try {
      await infoStore.loadNotes(sectionId);
    } catch (err) {
      appError = err.message;
    }
  }

  // ── Note selection ────────────────────────────────────────────────────────

  async function selectNote(note) {
    viewingNoteId = note.id;
    try {
      await infoStore.loadNote(note.id);
    } catch (err) {
      appError = err.message;
    }
  }

  function backToList() {
    viewingNoteId = null;
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
      if (selectedSectionId === section.id) {
        await selectSection(null);
      }
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
        // Reload notes list so the new note appears with joins
        await infoStore.loadNotes(selectedSectionId);
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

  async function handleArchive(note) {
    try {
      await infoStore.setArchived(note.id, note.status !== 'archived');
    } catch (err) {
      appError = err.message;
    }
  }

  // ── Document upload ────────────────────────────────────────────────────────

  function openUpload() { showUploadModal = true; }

  async function handleUpload(e) {
    const { file, description } = e.detail;
    try {
      await infoStore.uploadDocument(viewingNoteId, file, description, $auth.user.id);
      showUploadModal = false;
      uploadModalRef?.done();
    } catch (err) {
      uploadModalRef?.fail(err.message);
    }
  }

  async function handleDeleteDoc(doc) {
    try {
      await infoStore.deleteDocument(doc.id, doc.storage_path, viewingNoteId);
    } catch (err) {
      appError = err.message;
    }
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
        on:select={(e) => selectSection(e.detail)}
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
            on:uploadDoc={openUpload}
            on:deleteDoc={(e)  => handleDeleteDoc(e.detail)}
          />
        {:else}
          <NoteList
            {notes}
            loading={$infoStore.loadingNotes}
            showSection={selectedSectionId === null}
            on:select={(e) => selectNote(e.detail)}
            on:new={openNewNote}
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

<UploadDocModal
  bind:this={uploadModalRef}
  bind:show={showUploadModal}
  on:upload={handleUpload}
  on:close={() => showUploadModal = false}
/>
