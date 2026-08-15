<!-- src/lib/apps/dossier/components/PackWorkspace.svelte -->
<!-- The two-pane authoring shell: doc tree | editor.
     P0 step 4 fills the tree; the editor pane lands with the Tiptap step. -->
<script>
  import { createEventDispatcher, tick } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { getPref, setPref } from '$lib/utils/prefs';
  import { logAudit }    from '$lib/utils/auditLogger';
  import AttachedDocuments from '$lib/components/common/documents/AttachedDocuments.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';

  import { dossierStore } from '../stores/dossierStore.js';
  import {
    buildTree, descendantIds, planReorder, planIndent, planOutdent,
  } from '../utils/docTree.js';
  import DocTree      from './DocTree.svelte';
  import PackSearch   from './PackSearch.svelte';
  import { pageShowingFile } from '../utils/packSearch.js';
  import { revealBlock }     from '../utils/revealBlock.js';
  import DocFormModal from './DocFormModal.svelte';
  import DocEditor    from './DocEditor.svelte';
  import BlockContent from './BlockContent.svelte';
  import RevisionHistoryModal from './RevisionHistoryModal.svelte';
  import AssetPickerModal     from './AssetPickerModal.svelte';
  import PagePickerModal     from './PagePickerModal.svelte';
  import DatasetTable        from './DatasetTable.svelte';
  import TablePickerModal    from './TablePickerModal.svelte';
  import EmailPasteModal     from './EmailPasteModal.svelte';
  import {
    DATASET_TEMPLATES, TEMPLATE_KEYS, describeRecord,
  } from '../utils/datasetTemplates.js';
  import {
    assetAttrsFromDocument, fileProxyUrl, fetchSheetPreview,
  } from '../utils/assetPreview.js';
  import { findBrokenReferences, describeBrokenReferences } from '../utils/brokenRefs.js';
  import { extractPackReferences } from '../utils/docLinks.js';
  import { unindexedFiles, shelfIndexRows } from '../utils/documentIndex.js';
  import PublishModal      from './PublishModal.svelte';
  import PublicationsPanel from './PublicationsPanel.svelte';
  import {
    buildSnapshot, buildManifest, describeInclusion, prepareAssets,
  } from '../utils/snapshot.js';
  import { expiryFromDays, publicationState } from '../utils/publicationState.js';
  import { MAX_PREVIEW_ROWS as DEFAULT_SHEET_ROWS } from '../utils/sheetPreview.js';

  export let pack;

  const dispatch = createEventDispatcher();

  let selectedId  = null;
  let collapsed   = {};
  let notice      = '';       // soft feedback (depth warning, refused move)
  let treeError   = '';

  // Doc modal
  let showDocModal = false;
  let editingDoc   = null;    // set = rename
  let newDocParent = null;    // set = create under this doc
  let docModalRef;

  // Delete confirmation
  let pendingDelete = null;
  let deletingId    = null;

  $: docs        = $dossierStore.docs;
  /**
   * Load the pack's shelf and tables ONCE per pack.
   *
   * Keyed on the id, not on `pack`: Svelte's safe_not_equal reports any object
   * as changed, so `$: if (pack?.id) …` re-fired on every store update and sent
   * a fresh pair of requests after every edit.
   */
  let loadedForPackId = null;
  $: if (pack?.id && pack.id !== loadedForPackId) {
    loadedForPackId = pack.id;
    dossierStore.loadPackFiles(pack.id);
    dossierStore.loadDatasets(pack.id);
  }
  $: tree        = buildTree(docs);
  $: selectedDoc = docs.find(d => d.id === selectedId) ?? null;
  $: canEdit     = $permissions.isAdmin || $permissions.canModify;

  // How many pages a delete would take with it.
  $: pendingSubtree = pendingDelete ? descendantIds(docs, pendingDelete.id) : [];

  // ── Structural moves ──────────────────────────────────────────────────────

  const PLANNERS = {
    up:      (list, id) => planReorder(list, id, -1),
    down:    (list, id) => planReorder(list, id, +1),
    indent:  planIndent,
    outdent: planOutdent,
  };

  const REFUSALS = {
    cycle: 'A page cannot be moved inside itself.',
    depth: 'That would nest the page too deeply.',
  };

  async function handleMove(e) {
    const { node, kind } = e.detail;
    notice = '';
    const plan = PLANNERS[kind](docs, node.id);

    if (!plan.ok) {
      // 'not-found' here means "already at the edge" — a no-op, not an error.
      notice = REFUSALS[plan.reason] ?? '';
      return;
    }
    if (plan.warning === 'deep') {
      notice = 'This page is getting deeply nested — readers may struggle to find it.';
    }
    try {
      await dossierStore.applyMove(plan, $auth.user.id);
    } catch (err) {
      treeError = err.message;
    }
  }

  // ── Doc CRUD ──────────────────────────────────────────────────────────────

  function openNewDoc(parent = null) {
    editingDoc = null; newDocParent = parent; showDocModal = true;
  }
  function openRename(doc) {
    editingDoc = doc; newDocParent = null; showDocModal = true;
  }

  async function handleDocSave(e) {
    // Snapshot before the await — Svelte 5 flushes effects synchronously.
    const target  = editingDoc;
    const parent  = newDocParent;
    const { title } = e.detail;
    const userId  = $auth.user.id;
    const current = docs;

    try {
      if (target) {
        await dossierStore.renameDoc(target.id, title, userId);
      } else {
        const doc = await dossierStore.createDoc(
          { packId: pack.id, parentId: parent?.id ?? null, title }, userId, current);
        selectedId = doc.id;
        if (parent) collapsed = { ...collapsed, [parent.id]: false };
      }
      showDocModal = false;
      docModalRef?.done();
    } catch (err) {
      docModalRef?.fail(err.message);
    }
  }

  /** Autosave sink for DocEditor. Errors propagate so it can show "Not saved". */
  async function handleSaveBlocks(docId, blocks) {
    await dossierStore.saveDocBlocks(docId, blocks, $auth.user.id);
  }

  // ── Pack file shelf ───────────────────────────────────────────────────────
  // Files belong to the PACK, not to a page: blocks will reference rows on this
  // shelf by document_id (P1 step 2), and P3 must be able to enumerate exactly
  // what a publication exposes — an orphan file uploaded straight into a block
  // would be invisible to that walk.

  const LS_FILES = 'dossier:filesOpen';
  let filesOpen = getPref(LS_FILES) === '1';

  function toggleFiles() {
    filesOpen = !filesOpen;
    setPref(LS_FILES, filesOpen ? '1' : '0');
  }

  // The picker reads the shelf from the store; AttachedDocuments keeps its own
  // copy for the panel, so both are refreshed when a file is added or removed.
  let showAssetPicker = false;
  $: files = $dossierStore.files;

  async function handlePickAsset(file) {
    // The same picker serves the editor and a table row; only one of them is
    // ever waiting.
    if (linkingRecord) { setRecordLink({ document_id: file.id, doc_id: null }); return; }

    const documentId = file.id;          // capture before the await
    const editor = editorRef;
    editor?.insertAsset(assetAttrsFromDocument(file));

    // A spreadsheet also carries a snapshot of its first rows, taken once here
    // so the renderer never has to fetch. It lands a moment after the block:
    // reading a large workbook is not instant, and an author should not watch
    // a closed picker wondering whether the click worked. Returns null for
    // anything that is not a spreadsheet, and for a read that fails — the
    // block then simply stays a card.
    const preview = await fetchSheetPreview(file);
    if (preview) editor?.setSheetPreview(documentId, preview, DEFAULT_SHEET_ROWS);
  }

  /**
   * The author changed how much of a spreadsheet to show.
   *
   * Re-read rather than stored in full and sliced: those rows travel in the
   * block and again in every revision of the page, so keeping fifty on hand to
   * display five would be paid for on every save.
   */
  async function handleSheetRows(e) {
    const { documentId, rows } = e.detail;
    const file = files.find(f => f.id === documentId);
    if (!file) return;
    const editor = editorRef;               // capture before the await
    const preview = await fetchSheetPreview(file, rows);
    if (preview) editor?.setSheetPreview(documentId, preview, rows);
  }

  // ── Datasets ──────────────────────────────────────────────────────────────
  // Selecting a table takes over the main pane, exactly as selecting a page
  // does — they are peers in the pack, not a panel bolted onto a page.

  let selectedDatasetId = null;

  $: datasets = $dossierStore.datasets;
  $: records  = $dossierStore.records;
  $: datasetRecords = records.filter(r => r.dataset_id === selectedDatasetId);
  $: selectedDataset = datasets.find(d => d.id === selectedDatasetId) ?? null;

  async function openDataset(dataset) {
    const id = dataset.id;      // capture before the await
    await editorRef?.flushNow();
    selectedDatasetId = id;
    selectedId = null;          // a table and a page cannot both be open
  }

  // ── Row references ────────────────────────────────────────────────────────
  // A row can point at the page or file holding the fuller story. Reuses the
  // same pickers as the editor.

  /** The record awaiting a target, while a picker is open. */
  let linkingRecord = null;

  function startLinkPage(record) {
    linkingRecord = record;
    openPicker('recordPage');
  }

  function startLinkFile(record) {
    linkingRecord = record;
    showAssetPicker = true;
  }

  async function setRecordLink(patch) {
    const record = linkingRecord;
    linkingRecord = null;
    if (!record) return;
    try {
      await dossierStore.updateRecord(selectedDataset, record.id, patch, $auth.user.id);
    } catch (err) { treeError = err.message; }
  }

  async function clearRecordLink(record) {
    try {
      await dossierStore.updateRecord(
        selectedDataset, record.id, { doc_id: null, document_id: null }, $auth.user.id);
    } catch (err) { treeError = err.message; }
  }

  /** Follow a row's reference — to the page, or by opening the file. */
  function openRecordTarget(record) {
    if (record.doc_id && docs.some(d => d.id === record.doc_id)) {
      selectPage(record.doc_id);
      return;
    }
    if (record.document_id) {
      const file = files.find(f => f.id === record.document_id);
      const url = file && fileProxyUrl(file.provider_file_id, file.mime_type);
      if (url) { window.open(url, '_blank', 'noopener'); return; }
    }
    notice = 'What this entry pointed at is no longer here.';
  }

  function selectPage(id) {
    selectedDatasetId = null;
    selectedId = id;
  }

  /**
   * Follow a search hit. Unlike the reader, the workspace CAN open a table on
   * its own — tables are peers of pages here — so a table hit goes straight to
   * it rather than to a page that happens to embed it.
   */
  async function goToSearchResult(result) {
    notice = '';
    if (result.kind === 'page') {
      await editorRef?.flushNow();
      selectPage(result.docId);
      // The same reveal the recipient gets. The editor's DOM carries `data-uid`
      // too — the BlockId extension writes it — so one helper serves both.
      // A tick is not enough here: the editor is re-created for the new page.
      if (result.blockUid) {
        await tick();
        requestAnimationFrame(() => revealBlock(result.blockUid));
      }
      return;
    }

    if (result.kind === 'file') {
      // A file has no view of its own, so go to where it is used. A file on the
      // shelf that nothing refers to is worth saying out loud — it is the shape
      // of "I uploaded it and forgot to put it in".
      const docId = pageShowingFile(result.documentId, docs, records);
      if (docId) { await editorRef?.flushNow(); selectPage(docId); }
      else notice = `“${result.title}” is on the shelf but no page or table refers to it yet.`;
      return;
    }

    const dataset = datasets.find(d => d.id === result.datasetId);
    if (dataset) await openDataset(dataset);
  }

  let showTablePicker = false;

  function handlePickTable(dataset) {
    editorRef?.insertDatasetEmbed(dataset);
  }

  async function addDataset(key) {
    try {
      const dataset = await dossierStore.createDataset(pack.id, key, $auth.user.id);
      await openDataset(dataset);
    } catch (err) {
      treeError = err.message;
    }
  }

  async function handleRecordCreate(e) {
    try {
      await dossierStore.createRecord(selectedDataset, e.detail.fields, $auth.user.id);
    } catch (err) { treeError = err.message; }
  }

  // Pasting a thread. The modal owns the preview and which rows survive it;
  // the write belongs here, like every other store call in this component.
  let showEmailPaste = false;
  let emailPasteRef;

  async function handleEmailPaste(e) {
    const dataset = selectedDataset;      // capture before the await
    try {
      await dossierStore.createRecords(
        dataset, e.detail.rows.map(fields => ({ fields })), $auth.user.id);
      emailPasteRef?.done();
    } catch (err) {
      emailPasteRef?.fail(err.message);
    }
  }

  async function handleAddFromShelf() {
    const dataset = selectedDataset;      // capture before the await
    const rows = shelfIndexRows(unindexedFiles(files, records.filter(
      r => r.dataset_id === dataset.id)));
    if (!rows.length) return;
    try {
      await dossierStore.createRecords(dataset, rows, $auth.user.id);
    } catch (err) { treeError = err.message; }
  }

  async function handleRecordUpdate(e) {
    const { id, fields } = e.detail;
    try {
      await dossierStore.updateRecord(selectedDataset, id, { fields }, $auth.user.id);
    } catch (err) { treeError = err.message; }
  }

  // Deleting a row goes through the same confirmation as a pack, a page or a
  // table. The dialog NAMES the entry: in a dense table the real risk is not
  // deleting deliberately, it is deleting the row next to the one you meant.
  let pendingRecordDelete = null;
  let deletingRecordId    = null;

  function requestRecordDelete(e) { pendingRecordDelete = e.detail; }

  async function confirmRecordDelete() {
    const record = pendingRecordDelete;
    deletingRecordId = record.id;
    try {
      await dossierStore.deleteRecord(record.id);
      pendingRecordDelete = null;
    } catch (err) {
      treeError = err.message;
    } finally {
      deletingRecordId = null;
    }
  }

  // Deleting a table takes every entry with it, so it goes through the same
  // confirmation as deleting a pack or a page (house pattern — never confirm()).
  let pendingDatasetDelete = null;
  let deletingDatasetId    = null;

  function requestDatasetDelete() {
    if (selectedDataset) pendingDatasetDelete = selectedDataset;
  }

  async function confirmDatasetDelete() {
    const { id, title } = pendingDatasetDelete;
    deletingDatasetId = id;
    try {
      await dossierStore.deleteDataset(id, title);
      selectedDatasetId = null;
      pendingDatasetDelete = null;
    } catch (err) {
      treeError = err.message;
    } finally {
      deletingDatasetId = null;
    }
  }

  // ── Cross-links ───────────────────────────────────────────────────────────

  let showPagePicker = false;
  let pickerPurpose  = 'link';   // 'link' | 'embed'

  function handlePickPage({ doc, mode }) {
    if (pickerPurpose === 'recordPage') { setRecordLink({ doc_id: doc.id, document_id: null }); return; }
    if (pickerPurpose === 'embed')      { editorRef?.insertDocEmbed(doc, mode); return; }
    editorRef?.applyDocLink(doc);
  }

  function openPicker(purpose) {
    pickerPurpose = purpose;
    showPagePicker = true;
  }

  /**
   * Follow a cross-link. Delegated from the editor surface rather than bound
   * per link, so it works for links the author has only just typed and for the
   * read-only renderer alike.
   *
   * In edit mode a plain click must still place the caret — otherwise the link
   * text becomes uneditable — so following requires Ctrl/Cmd. In read mode a
   * plain click follows.
   */
  function handleContentClick(event) {
    const anchor = event.target?.closest?.('a.dossier-doclink');
    if (!anchor) return;
    if (canEdit && !(event.ctrlKey || event.metaKey)) return;

    const targetId = anchor.getAttribute('data-doc-id');
    event.preventDefault();
    if (targetId && docs.some(d => d.id === targetId)) {
      selectedId = targetId;
      notice = '';
    } else {
      notice = 'That page no longer exists.';
    }
  }

  // ── Broken references ─────────────────────────────────────────────────────
  // Recomputed whenever the pages or the shelf change, so a deletion surfaces
  // immediately rather than at some later audit.

  let showBroken = false;

  // Derived straight from the pages and the shelf, so a deleted file shows up
  // the instant the shelf reloads.
  // Pages AND table rows — a chronology entry pointing at a deleted page is
  // just as broken as a link in a paragraph.
  $: broken = findBrokenReferences(
    extractPackReferences(docs, datasets, records), docs, files, datasets);

  // ── Backlinks ─────────────────────────────────────────────────────────────

  let backlinks = [];

  // Reload whenever the selected page changes. Cheap, and it must reflect edits
  // made on other pages since this one was opened.
  $: refreshBacklinks(selectedId);

  async function refreshBacklinks(docId) {
    if (!docId) { backlinks = []; return; }
    try {
      backlinks = await dossierStore.loadBacklinks(docId);
    } catch {
      backlinks = [];      // non-fatal: the page is still perfectly editable
    }
  }

  function auditDoc(action, doc) {
    dossierStore.loadPackFiles(pack.id);
    logAudit(action, 'dossier_file', doc.id, doc.display_name || doc.filename, {
      appId: 'dossier', eventCategory: 'dossier',
      severity: action === 'delete' ? 'warning' : 'info',
      afterData: { pack_id: pack.id, filename: doc.filename },
    });
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  // The editor can only show an embed as a placeholder — a Tiptap node cannot
  // reach the other pages. Preview renders through the SAME read-mode renderer
  // a recipient will get, so transclusions, cycles and depth limits are all
  // visible before anything is published.

  let previewing = false;

  async function togglePreview() {
    if (!previewing) await editorRef?.flushNow();   // preview the saved state
    previewing = !previewing;
  }

  // Leaving a page always returns to editing.
  $: if (selectedId) previewing = previewing && true;

  // ── Version history ───────────────────────────────────────────────────────

  let showHistory      = false;
  let revisions        = [];
  let loadingRevisions = false;
  let historyModalRef;
  let editorRef;

  async function openHistory() {
    const docId = selectedId;
    if (!docId) return;
    // Flush any pending autosave first, or the newest edits are missing from
    // the comparison the user is about to make.
    await editorRef?.flushNow();
    showHistory = true;
    loadingRevisions = true;
    try {
      revisions = await dossierStore.loadRevisions(docId);
    } catch (err) {
      treeError = err.message;
    } finally {
      loadingRevisions = false;
    }
  }

  async function handleRestore(e) {
    const revision = e.detail;
    const docId    = selectedId;
    try {
      await dossierStore.restoreRevision(docId, revision, $auth.user.id);
      revisions = await dossierStore.loadRevisions(docId);
      historyModalRef?.done();
      showHistory = false;
    } catch (err) {
      historyModalRef?.fail(err.message);
    }
  }

  async function saveVersion() {
    const docId = selectedId;
    if (!docId) return;
    await editorRef?.flushNow();
    const current = docs.find(d => d.id === docId);
    try {
      await dossierStore.saveVersion(
        docId, current?.blocks, $auth.user.id, 'Saved by hand');
      notice = 'Version saved.';
    } catch (err) {
      treeError = err.message;
    }
  }

  // ── The offline archive ───────────────────────────────────────────────────
  // The author's own copy: pages as markdown, tables as CSV, and the shelf's
  // files. Fetched rather than linked so a failure can be explained — a plain
  // <a download> would navigate away on a 413 and leave a JSON error page.

  let archiving = false;

  async function downloadArchive() {
    if (archiving) return;
    const packId = pack.id;               // capture before the await
    archiving = true; treeError = '';
    try {
      await editorRef?.flushNow();        // a pending edit belongs in the archive
      const { authHeaders } = await import('$lib/utils/authHeaders');
      const res = await fetch(`/api/dossier/archive/${packId}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        treeError = (await res.json().catch(() => ({})))?.error
          ?? 'The archive could not be prepared just now.';
        return;
      }

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = filenameFrom(res.headers.get('content-disposition'))
        ?? `${pack.title || 'pack'}.zip`;
      a.click();
      // Revoked on a later turn: Safari has not begun the download when click()
      // returns, and revoking synchronously yields an empty file.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      treeError = err.message;
    } finally {
      archiving = false;
    }
  }

  /** The server's name for the file, preferring the RFC 5987 form. */
  function filenameFrom(header) {
    if (!header) return null;
    const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (star) { try { return decodeURIComponent(star[1]); } catch { /* fall through */ } }
    return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
  }

  // ── Publishing (P3) ───────────────────────────────────────────────────────

  let showPublish   = false;
  let publishReview = null;
  let preparing     = false;
  let publishRef;
  let pubBusyId     = null;
  let pendingRevoke = null;

  $: publications = $dossierStore.publications;
  $: liveLinks = publications.filter(p => publicationState(p) === 'live').length;

  /**
   * The snapshot the author is looking at.
   *
   * Built ONCE, when the review opens, and then carried through pinning and
   * persistence unchanged. Rebuilding it at publish time would mean the row
   * written is a different object from the list that was approved, and the file
   * pass takes seconds — long enough for a store update to change what goes
   * out without anyone seeing it.
   */
  let reviewedSnapshot = null;

  async function openPublish() {
    // Flush first: publishing something that does not include the sentence the
    // author just typed would be a quiet and serious bug.
    await editorRef?.flushNow();

    preparing = true;
    showPublish = true;

    // The review is pure — no server call, so it opens instantly. Files are
    // read once at PUBLISH instead (see handlePublish): pinning here would
    // leave an orphaned copy behind every time an author looked and thought
    // better of it.
    reviewedSnapshot = buildSnapshot({ pack, docs, datasets, records, files });
    publishReview = describeInclusion(
      reviewedSnapshot, buildManifest(reviewedSnapshot));
    preparing = false;
  }

  async function handlePublish(e) {
    const { title, recipientLabel, mode, expiryDays, passphrase, showContents } = e.detail;
    const snapshot = reviewedSnapshot;     // exactly what was on screen
    if (!snapshot) { publishRef?.fail('Nothing was reviewed. Please try again.'); return; }
    try {
      // One pass over the bytes: checksum every file, and PIN a copy when the
      // publication is a frozen one. Measured now, at publication — a checksum
      // taken later is a baseline for a file that may already have changed, and
      // a pin taken later is not the thing that was sent.
      const assets = await prepareAssets(snapshot.files, { pin: mode === 'snapshot' });

      const result = await dossierStore.createPublication({
        pack, snapshot, mode, title, recipientLabel, passphrase, showContents,
        expiresAt: expiryFromDays(expiryDays), checksums: assets,
      }, $auth.user.id);
      publishRef?.done(result);
    } catch (err) {
      publishRef?.fail(err.message);
    }
  }

  // ── Checking a publication's files ────────────────────────────────────────
  // "Has anything changed since I sent this?" — the author-facing half of
  // decision #5. For a pinned publication a changed source is information; for
  // a follow-latest one it is a warning.
  let verifyResult = null;
  let verifyingId  = null;

  async function handleVerify(publication) {
    const id = publication.id;
    verifyingId = id; verifyResult = null;
    try {
      const { postJson } = await import('$lib/utils/request');
      const body = await postJson(`/api/dossier/publications/${id}/verify`, {},
        'Could not check the files');
      verifyResult = { id, message: body.message };
    } catch (err) {
      treeError = err.message;
    } finally {
      verifyingId = null;
    }
  }

  async function handleRegenerate(publication) {
    const id = publication.id;
    pubBusyId = id;
    try {
      const result = await dossierStore.regeneratePublicationToken(id, $auth.user.id);
      // Straight into the same "copy it now" screen: a regenerated token is as
      // unrecoverable as the first one.
      showPublish = true;
      publishRef?.done(result);
    } catch (err) {
      treeError = err.message;
    } finally {
      pubBusyId = null;
    }
  }

  let pendingPubDelete = null;

  async function confirmPubDelete() {
    const publication = pendingPubDelete;
    pubBusyId = publication.id;
    try {
      await dossierStore.deletePublication(publication);
      pendingPubDelete = null;
    } catch (err) {
      treeError = err.message;
    } finally {
      pubBusyId = null;
    }
  }

  async function confirmRevoke() {
    const publication = pendingRevoke;
    pubBusyId = publication.id;
    try {
      await dossierStore.revokePublication(publication.id, $auth.user.id);
      pendingRevoke = null;
    } catch (err) {
      treeError = err.message;
    } finally {
      pubBusyId = null;
    }
  }

  const LS_PUBS = 'dossier:pubsOpen';
  let pubsOpen = getPref(LS_PUBS) === '1';

  function togglePubs() {
    pubsOpen = !pubsOpen;
    setPref(LS_PUBS, pubsOpen ? '1' : '0');
    // No load here: setting pubsOpen satisfies the reactive block below, which
    // is the single place that fetches. Doing both sent two identical queries.
  }

  // Loaded on open, and once up front only if the section is already expanded.
  let loadedPubsFor = null;
  $: if (pubsOpen && pack?.id && pack.id !== loadedPubsFor) {
    loadedPubsFor = pack.id;
    dossierStore.loadPublications(pack.id).catch(() => {});
  }

  function requestDelete(doc) { pendingDelete = doc; }

  async function confirmDelete() {
    const { id, title } = pendingDelete;
    const subtree = descendantIds(docs, id);
    deletingId = id;
    try {
      await dossierStore.deleteDoc(id, title, subtree);
      if (id === selectedId || subtree.includes(selectedId)) selectedId = null;
      pendingDelete = null;
    } catch (err) {
      treeError = err.message;
    } finally {
      deletingId = null;
    }
  }
</script>

<div class="flex flex-col h-full">

  <!-- Workspace header -->
  <div class="flex items-center gap-3 px-4 py-2 border-b border-slate-700 shrink-0">
    <Button variant="secondary" size="small" className="shrink-0"
            on:click={() => dispatch('back')}>
      ← Packs
    </Button>
    <p class="text-sm font-semibold text-white truncate" title={pack.title}>{pack.title}</p>
    {#if pack.status === 'archived'}
      <span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Archived</span>
    {/if}

    <div class="flex-1"></div>

    {#if broken.length}
      <!-- A pack about to be handed to someone outside the portal should not
           contain references that go nowhere. -->
      <button
        class="text-xs px-2 py-1 rounded bg-amber-500/15 text-amber-300
               hover:bg-amber-500/25 transition-colors shrink-0"
        title="Show which references no longer resolve"
        on:click={() => showBroken = !showBroken}
      >⚠ {describeBrokenReferences(broken)}</button>
    {/if}

    {#if canEdit}
      {#if liveLinks}
        <span class="text-xs text-slate-500 shrink-0"
              title="Links to this pack that currently work">
          {liveLinks} live link{liveLinks === 1 ? '' : 's'}
        </span>
      {/if}
      <!-- "Download", NOT "Archive": this app already uses that word for
           archiving a pack, so a button called Archive in the header reads as
           the soft-delete rather than as a zip you keep. -->
      <Button variant="secondary" size="small" className="shrink-0" disabled={archiving}
              title="Download this pack as a zip — pages, tables and files — to keep offline"
              on:click={downloadArchive}>
        {archiving ? 'Preparing…' : 'Download'}
      </Button>
      <Button variant="primary" size="small" className="shrink-0" on:click={openPublish}>
        Publish
      </Button>
    {/if}
  </div>

  {#if showBroken && broken.length}
    <div class="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5 shrink-0">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0 space-y-1">
          {#each broken as ref}
            <p class="text-xs text-slate-300">
              <button
                class="text-amber-300 hover:text-amber-200 underline underline-offset-2"
                on:click={() => {
                  // A broken reference lives on a page or in a table; open
                  // whichever it is rather than assuming a page.
                  if (ref.origin.type === 'table') {
                    const table = datasets.find(d => d.id === ref.origin.id);
                    if (table) openDataset(table);
                  } else {
                    selectPage(ref.origin.id);
                  }
                  showBroken = false;
                }}
              >{ref.origin.title}</button>
              <span class="text-slate-500">
                {ref.kind === 'doc' ? 'links to' : 'shows'}
              </span>
              <span class="text-slate-400">{ref.label}</span>
            </p>
          {/each}
        </div>
        <button class="text-xs text-slate-500 hover:text-slate-300 shrink-0"
                on:click={() => showBroken = false}>Hide</button>
      </div>
    </div>
  {/if}

  {#if treeError}
    <div class="px-4 pt-3">
      <ErrorDisplay message={treeError} onDismiss={() => treeError = ''} />
    </div>
  {/if}

  <div class="flex flex-1 min-h-0">

    <!-- ── Doc tree ── -->
    <div class="w-72 shrink-0 border-r border-slate-700 flex flex-col min-h-0">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 shrink-0">
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-1">Pages</p>
        {#if canEdit}
          <button class="text-xs text-slate-400 hover:text-white px-1"
                  title="New top-level page" on:click={() => openNewDoc(null)}>+ New</button>
        {/if}
      </div>

      <div class="px-2 py-2 border-b border-slate-700/50 shrink-0">
        <PackSearch
          content={{ docs, datasets, records, files: $dossierStore.files }}
          placeholder="Search pages, tables and files…"
          on:go={(e) => goToSearchResult(e.detail)}
        />
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-1.5">
        {#if $dossierStore.loadingDocs}
          <div class="flex justify-center py-8"><LoadingSpinner /></div>
        {:else if tree.length === 0}
          <p class="text-xs text-slate-500 px-2 py-6 text-center">
            No pages yet. Start with an overview page, then add a chronology.
          </p>
        {:else}
          <DocTree
            nodes={tree}
            {selectedId}
            bind:collapsed
            on:select={(e)   => { selectPage(e.detail.id); notice = ''; }}
            on:move={handleMove}
            on:newChild={(e) => openNewDoc(e.detail)}
            on:rename={(e)   => openRename(e.detail)}
            on:delete={(e)   => requestDelete(e.detail)}
          />
        {/if}
      </div>

      {#if notice}
        <div class="px-3 py-2 border-t border-slate-700/50 shrink-0">
          <p class="text-xs text-amber-400/90">{notice}</p>
        </div>
      {/if}

      <!-- ── Tables: the pack's structured lists ── -->
      <div class="border-t border-slate-700 shrink-0">
        <div class="px-3 py-2">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Tables
          </span>
        </div>

        {#if datasets.length}
          <div class="pb-1">
            {#each datasets as dataset (dataset.id)}
              <button
                class="flex items-center gap-2 w-full px-3 py-1 text-left text-sm
                       hover:bg-slate-700/50 transition-colors
                       {selectedDatasetId === dataset.id ? 'bg-slate-700 text-white' : 'text-slate-300'}"
                on:click={() => openDataset(dataset)}
              >
                <span class="text-slate-600 text-xs shrink-0">▦</span>
                <span class="truncate">{dataset.title}</span>
              </button>
            {/each}
          </div>
        {/if}

        {#if canEdit}
          <!-- The add buttons get their own wrapped row: on the label line they
               squeezed into two-word columns in a 288px sidebar. Only templates
               the pack does not already have are offered — two chronologies is
               a mistake, not a feature. -->
          {@const available = TEMPLATE_KEYS.filter(k => !datasets.some(d => d.key === k))}
          {#if available.length}
            <div class="flex flex-wrap gap-1 px-3 pb-2">
              {#each available as key}
                <button
                  class="text-xs px-1.5 py-0.5 rounded border border-slate-700
                         text-slate-500 hover:text-white hover:border-slate-600
                         transition-colors whitespace-nowrap"
                  title="Add a {DATASET_TEMPLATES[key].title.toLowerCase()} to this pack"
                  on:click={() => addDataset(key)}
                >+ {DATASET_TEMPLATES[key].title}</button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- ── Files: the pack's evidence shelf ── -->
      <!-- Conditional class rather than class:flex-1 + shrink-0 — those two are
           the same specificity, so which wins would depend on CSS order. -->
      <div class="border-t border-slate-700 flex flex-col min-h-0
                  {filesOpen ? 'flex-1' : 'shrink-0'}">
        <!-- When open, AttachedDocuments supplies its own "FILES (n)" heading,
             so this button carries the label only while collapsed. -->
        <button
          class="flex items-center gap-2 w-full px-3 py-2 text-left shrink-0
                 hover:bg-slate-700/40 transition-colors"
          aria-label={filesOpen ? 'Hide files' : 'Show files'}
          aria-expanded={filesOpen}
          on:click={toggleFiles}
        >
          <span class="text-[10px] text-slate-500 w-2">{filesOpen ? '▼' : '▶'}</span>
          {#if !filesOpen}
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-1">
              Files
            </span>
          {/if}
        </button>

        {#if filesOpen}
          <div class="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
            <AttachedDocuments
              entityType="dossier_pack"
              entityId={pack.id}
              canEdit={canEdit}
              canDelete={$permissions.isAdmin}
              folderPath="Dossier Packs"
              title="Files"
              on:uploaded={(e) => auditDoc('create', e.detail)}
              on:updated={(e)  => auditDoc('update', e.detail)}
              on:deleted={(e)  => auditDoc('delete', e.detail)}
            />
          </div>
        {/if}
      </div>

      <!-- Links issued to people outside the portal. Its own section, and
           collapsed by default: it is the one place a live external link is
           visible, and it should be looked at deliberately. -->
      <div class="border-t border-slate-700 shrink-0">
        <button
          class="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800/50
                 transition-colors text-left"
          aria-label={pubsOpen ? 'Hide links' : 'Show links'}
          aria-expanded={pubsOpen}
          on:click={togglePubs}
        >
          <span class="text-[10px] text-slate-500 w-2">{pubsOpen ? '▼' : '▶'}</span>
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-1">
            Links
          </span>
          {#if liveLinks}
            <span class="text-[10px] text-green-400">{liveLinks} live</span>
          {/if}
        </button>

        {#if pubsOpen}
          <div class="max-h-64 overflow-y-auto px-3 pb-3">
            <PublicationsPanel
              {publications}
              {canEdit}
              busyId={pubBusyId}
              on:regenerate={(e) => handleRegenerate(e.detail)}
              on:revoke={(e) => pendingRevoke = e.detail}
              on:verify={(e) => handleVerify(e.detail)}
              on:deletePublication={(e) => pendingPubDelete = e.detail}
              {verifyResult}
              {verifyingId}
            />
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Editor pane ── -->
    <!-- min-h-0 is load-bearing: a flex item defaults to min-height:auto and
         refuses to shrink below its content, so without it a long page grows
         this pane past the viewport instead of letting the editor's own scroll
         area take over — which scrolls the toolbar off screen with it. -->
    <div class="flex-1 min-w-0 min-h-0 flex flex-col">
      {#if selectedDataset}
        <DatasetTable
          dataset={selectedDataset}
          records={datasetRecords}
          {canEdit}
          {docs}
          {files}
          on:linkPage={(e)   => startLinkPage(e.detail)}
          on:linkFile={(e)   => startLinkFile(e.detail)}
          on:clearLink={(e)  => clearRecordLink(e.detail)}
          on:openTarget={(e) => openRecordTarget(e.detail)}
          on:createRecord={handleRecordCreate}
          on:pasteEmails={() => showEmailPaste = true}
          on:addFromShelf={handleAddFromShelf}
          on:updateRecord={handleRecordUpdate}
          on:deleteRecord={requestRecordDelete}
          on:deleteDataset={requestDatasetDelete}
        />
      {:else if selectedDoc}
        <!-- One row, not three. Title, address, backlinks and actions all live
             here: five stacked bars above the editor left very little room to
             actually write. -->
        <div class="flex items-center gap-3 px-6 py-2 border-b border-slate-700/50 shrink-0">
          <h2 class="text-sm font-semibold text-white truncate shrink min-w-0">
            {selectedDoc.title}
          </h2>
          <span class="text-xs text-slate-600 font-mono truncate hidden md:inline shrink-0"
                title="This page's address">{selectedDoc.slug}</span>

          {#if backlinks.length}
            <!-- Which pages point here — the answer to "why is this page in the
                 pack?", and the first thing to check before deleting one. -->
            <span class="hidden lg:flex items-center gap-1.5 text-xs min-w-0 shrink">
              <span class="text-slate-600 shrink-0">↩</span>
              {#each backlinks.slice(0, 3) as link (link.doc_id)}
                <button
                  class="text-slate-400 hover:text-white underline underline-offset-2 truncate"
                  title="Referenced from {link.title} — go there"
                  on:click={() => { selectedId = link.doc_id; notice = ''; }}
                >{link.title}</button>
              {/each}
              {#if backlinks.length > 3}
                <span class="text-slate-600 shrink-0"
                      title={backlinks.slice(3).map(l => l.title).join(', ')}
                >+{backlinks.length - 3}</span>
              {/if}
            </span>
          {/if}

          <div class="flex-1"></div>

          <div class="flex items-center gap-2 shrink-0">
            {#if canEdit}
              <Button variant="secondary" size="small" on:click={saveVersion}>
                Save version
              </Button>
            {/if}
            <Button variant="secondary" size="small" on:click={togglePreview}>
              {previewing ? 'Edit' : 'Preview'}
            </Button>
            <Button variant="secondary" size="small" on:click={openHistory}>
              History
            </Button>
          </div>
        </div>

        <!-- One long-lived editor instance across page switches: DocEditor
             flushes the outgoing page's pending save itself, which a {#key}
             remount would not do reliably. -->
        <div class="flex-1 min-h-0">
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div class="h-full" on:click={handleContentClick}>
            {#if previewing}
              <div class="h-full overflow-y-auto">
                <div class="max-w-3xl mx-auto px-8 py-6">
                  <BlockContent blocks={selectedDoc.blocks} mode="read" {docs} {files}
                                {datasets} {records}
                                on:openDoc={(e) => selectPage(e.detail)}
                       on:sheetRows={handleSheetRows} />
                </div>
              </div>
            {:else}
            <DocEditor bind:this={editorRef}
                       doc={selectedDoc} editable={canEdit} onSave={handleSaveBlocks}
                       {files}
                       on:pickAsset={() => showAssetPicker = true}
                       on:pickPage={() => openPicker('link')}
                       on:pickEmbed={() => openPicker('embed')}
                       on:pickTable={() => showTablePicker = true}
                       on:openDoc={(e) => selectPage(e.detail)}
                       on:sheetRows={handleSheetRows}
                       {datasets} {records} {docs} />
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex-1 flex items-center justify-center p-8">
          <p class="text-sm text-slate-500 text-center max-w-sm">
            Select a page from the left, or create one to start building this pack.
          </p>
        </div>
      {/if}
    </div>
  </div>
</div>

<DocFormModal
  bind:this={docModalRef}
  bind:show={showDocModal}
  doc={editingDoc}
  parent={newDocParent}
  on:save={handleDocSave}
  on:close={() => showDocModal = false}
/>

<ConfirmDialog
  show={!!pendingRecordDelete}
  danger={true}
  processing={!!deletingRecordId}
  title="Delete this entry?"
  message={pendingRecordDelete && selectedDataset
    ? `“${describeRecord(selectedDataset.key, pendingRecordDelete.fields)}” will be removed from ${selectedDataset.title}. This cannot be undone.`
    : ''}
  confirmText="Delete"
  on:confirm={confirmRecordDelete}
  on:cancel={() => pendingRecordDelete = null}
/>

<ConfirmDialog
  show={!!pendingDatasetDelete}
  danger={true}
  processing={!!deletingDatasetId}
  title="Delete table?"
  message={pendingDatasetDelete
    ? `"${pendingDatasetDelete.title}" and all ${records.length} of its entries will be permanently deleted. Pages that mention it are not affected. This cannot be undone.`
    : ''}
  confirmText="Delete"
  on:confirm={confirmDatasetDelete}
  on:cancel={() => pendingDatasetDelete = null}
/>

<PublishModal
  bind:this={publishRef}
  bind:show={showPublish}
  review={publishReview}
  packTitle={pack.title}
  {preparing}
  on:publish={handlePublish}
  on:close={() => { showPublish = false; publishReview = null; reviewedSnapshot = null; }}
/>

<ConfirmDialog
  show={!!pendingPubDelete}
  title="Delete this publication?"
  message={pendingPubDelete
    ? `This removes every record that "${pendingPubDelete.title}" was ever issued, `
      + `along with the copies of its files kept for it. Revoke instead if you `
      + `only want the link to stop working.`
    : ''}
  confirmText="Delete"
  danger={true}
  processing={!!pubBusyId}
  on:confirm={confirmPubDelete}
  on:cancel={() => pendingPubDelete = null}
/>

<ConfirmDialog
  show={!!pendingRevoke}
  title="Revoke this link?"
  message={pendingRevoke
    ? `The link for "${pendingRevoke.title}" will stop working immediately, for `
      + `everyone who has it. This cannot be undone — publish again to issue a `
      + `new one. The record that this link was issued is kept.`
    : ''}
  confirmText="Revoke"
  danger={true}
  processing={!!pubBusyId}
  on:confirm={confirmRevoke}
  on:cancel={() => pendingRevoke = null}
/>

<EmailPasteModal
  bind:this={emailPasteRef}
  bind:show={showEmailPaste}
  on:add={handleEmailPaste}
  on:close={() => showEmailPaste = false}
/>

<TablePickerModal
  bind:show={showTablePicker}
  {datasets}
  {records}
  on:pick={(e) => handlePickTable(e.detail)}
  on:close={() => showTablePicker = false}
/>

<PagePickerModal
  bind:show={showPagePicker}
  {docs}
  currentDocId={selectedId}
  purpose={pickerPurpose}
  on:pick={(e) => handlePickPage(e.detail)}
  on:close={() => { showPagePicker = false; linkingRecord = null; }}
/>

<AssetPickerModal
  bind:show={showAssetPicker}
  {files}
  on:pick={(e) => handlePickAsset(e.detail)}
  on:close={() => { showAssetPicker = false; linkingRecord = null; }}
/>

<RevisionHistoryModal
  bind:this={historyModalRef}
  bind:show={showHistory}
  doc={selectedDoc}
  {revisions}
  {docs}
  {files}
  loading={loadingRevisions}
  {canEdit}
  on:restore={handleRestore}
  on:close={() => showHistory = false}
/>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete page?"
  message={pendingDelete
    ? (pendingSubtree.length
        ? `"${pendingDelete.title}" and its ${pendingSubtree.length} sub-page${pendingSubtree.length === 1 ? '' : 's'} will be permanently deleted. This cannot be undone.`
        : `"${pendingDelete.title}" will be permanently deleted. This cannot be undone.`)
    : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
