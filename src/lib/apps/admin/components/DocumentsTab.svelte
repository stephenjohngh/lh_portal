<!-- src/lib/apps/admin/components/DocumentsTab.svelte -->
<!-- "Document Demo" tab in the Admin app — a global, admin-only browser over
     the shared document_library INDEX table. Lists the newest 200 indexed
     documents across all apps/entities, grouped by folder, reading the DB
     index rather than the storage provider. Demo + admin cleanup view:
     everyday document handling lives in each entity's own AttachedDocuments
     panel, not here. Uploads made here are "loose" (no entity_type/entity_id)
     and land in a Documents folder.
     ⚠ A row can outlive its file and the record it was attached to — nothing
     links them (2026-09-27). "Check files" asks, per row shown, and changes
     nothing: $lib/server/documentCheck.js. -->
<script>
  import { onMount }        from 'svelte';
  import { documentsStore } from '$lib/stores/documentsStore';
  import DocumentUploader   from '$lib/components/common/documents/DocumentUploader.svelte';
  import DocumentList       from '$lib/components/common/documents/DocumentList.svelte';
  import ConfirmDialog      from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay       from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner     from '$lib/components/common/LoadingSpinner.svelte';
  import { permissions }    from '$lib/stores/permissions';
  import { debounce }       from '$lib/utils/debounce';
  import { DOC_TYPES, documentCategories, DOC_FOLDERS, getExpiryStatus } from '$lib/utils/documentUtils';
  import { portalSettings } from '$lib/stores/portalSettings.js';
  import { checkDocuments }  from '$lib/utils/documentApi';
  import { checkSummary }    from '$lib/utils/documentCheckLabels.js';
  import { fmtTime }                 from '$lib/utils/dates';
  import { errMessage } from '$lib/utils/errors.js';

  $: ({ docs, loading, error } = $documentsStore);

  // Filters
  let filterDocType  = '';
  let filterCategory = '';
  let filterSearch   = '';

  onMount(async () => {
    await documentsStore.load();
  });

  async function applyFilters() {
    await documentsStore.load({
      doc_type: filterDocType  || undefined,
      category: filterCategory || undefined,
      search:   filterSearch   || undefined,
    });
  }

  const debouncedApplyFilters = debounce(applyFilters, 250);

  async function clearFilters() {
    filterDocType = ''; filterCategory = ''; filterSearch = '';
    await documentsStore.load();
  }

  // Delete confirmation state
  let pendingDelete  = null;
  let deleting       = false;

  function handleDelete(e) {
    pendingDelete = e.detail;
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    deleting = true;
    // Errors are surfaced via documentsStore.error → ErrorDisplay
    try { await documentsStore.remove(pendingDelete.id); } catch { /* shown */ }
    deleting      = false;
    pendingDelete = null;
  }

  function cancelDelete() {
    pendingDelete = null;
  }

  function handleUploaded(e) {
    // e.detail is the array of newly uploaded document_library rows.
    // If no filters are active the new docs are already in the store from
    // the upload call; reload to apply any active filters and get server order.
    documentsStore.load({
      doc_type: filterDocType  || undefined,
      category: filterCategory || undefined,
      search:   filterSearch   || undefined,
    });
  }

  // ── Check files ──────────────────────────────────────────────────────────
  // Asks, for each document SHOWN, whether its record and its file still
  // exist. Results are kept by id: a row loaded later (a new filter, an upload)
  // has none and counts as "not checked", never as fine.
  /** @type {Record<string, any>} */
  let checkResults = {};
  let checkedAt    = '';
  let checking     = false;
  let checkError   = '';

  async function runCheck() {
    const ids = /** @type {Array<{ id: string }>} */ (docs).map((d) => d.id);   // capture before the await
    if (!ids.length) return;
    checking = true; checkError = '';
    try {
      const { results, checkedAt: at } = await checkDocuments(ids);
      checkResults = { ...checkResults, ...results };
      checkedAt    = at;
    } catch (/** @type {any} */ err) {
      checkError = errMessage(err);
    } finally {
      checking = false;
    }
  }

  $: summary = checkSummary(docs, checkResults);

  // Summary stats
  $: total     = docs.length;
  // The shared expiry rule (documentUtils → dueWindows.js), not a copy of it.
  $: expiring  = docs.filter(d => getExpiryStatus(d.expiry_date) === 'expiring-soon').length;
  $: expired   = docs.filter(d => getExpiryStatus(d.expiry_date) === 'expired').length;
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-start justify-between gap-4">
    <div>
      <h3 class="text-lg font-semibold text-slate-100">Document Demo</h3>
      <p class="text-sm text-slate-400">
        A global, admin-only view of the shared document library index.
      </p>
    </div>
    <div class="flex gap-4 text-center flex-shrink-0">
      <div class="bg-slate-800 rounded-lg px-3 py-2">
        <p class="text-xl font-bold text-slate-100">{total}</p>
        <p class="text-xs text-slate-400">Total</p>
      </div>
      {#if expiring}
        <div class="bg-amber-900/30 border border-amber-800 rounded-lg px-3 py-2">
          <p class="text-xl font-bold text-amber-400">{expiring}</p>
          <p class="text-xs text-amber-500">Expiring</p>
        </div>
      {/if}
      {#if expired}
        <div class="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
          <p class="text-xl font-bold text-red-400">{expired}</p>
          <p class="text-xs text-red-500">Expired</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- What this tab is -->
  <div class="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-sm text-slate-300 space-y-2">
    <p class="font-medium text-slate-200">What this tab shows</p>
    <p>
      The records in the
      <code class="px-1 py-0.5 rounded bg-slate-700/70 text-slate-200 text-xs">document_library</code>
      table — the portal's shared index of stored documents — across every app: files attached to
      Info notes, Management issues, Dossier packs, maintenance jobs (certificates) and parking
      agreements (licences), the Golden Thread's own copies, and loose files uploaded here. The newest
      200 are shown, grouped by folder.
    </p>
    <p>
      Not here: <strong>photos</strong> (inspection and MOR photos are held in a separate table), and
      the frozen copies behind a published Dossier link, which only that publication records.
    </p>
    <p>
      ⚠ This lists <strong>records</strong>, not the files themselves: nothing ties a record to its
      file in Google Drive, or to the thing it was attached to, so a record can outlive either.
      <strong>Check files</strong> asks, for each document shown, whether both still exist, and
      changes nothing. It cannot find the opposite case — a file in Drive with no record here.
    </p>
    <p>
      It exists as a demo and admin cleanup view. Everyday document handling happens in each entity's
      own attachments panel, not here — and files uploaded below are <em>loose</em> (not attached to
      any record), landing in a
      <code class="px-1 py-0.5 rounded bg-slate-700/70 text-slate-200 text-xs">Documents</code> folder.
    </p>
  </div>

  <!-- Upload area -->
  <div class="bg-slate-850 border border-slate-700 rounded-lg p-4">
    <p class="text-sm font-medium text-slate-300 mb-1">Upload a loose document</p>
    <p class="text-xs text-slate-400 mb-3">Added to the library unattached to any entity.</p>
    <DocumentUploader
      extended={true}
      folderPath={DOC_FOLDERS.LOOSE}
      on:uploaded={handleUploaded}
    />
  </div>

  <!-- Filters -->
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <p class="text-xs text-slate-400 mb-1">Search</p>
      <input
        class="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 w-48"
        placeholder="Name or title…"
        bind:value={filterSearch}
        on:input={debouncedApplyFilters}
      />
    </div>
    <div>
      <p class="text-xs text-slate-400 mb-1">Type</p>
      <select
        class="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
        bind:value={filterDocType}
        on:change={applyFilters}
      >
        <option value="">All types</option>
        {#each DOC_TYPES as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
    </div>
    <div>
      <p class="text-xs text-slate-400 mb-1">Category</p>
      <select
        class="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
        bind:value={filterCategory}
        on:change={applyFilters}
      >
        <option value="">All categories</option>
        {#each ($portalSettings, documentCategories({ includeRetired: true })) as c}
          <option value={c.value}>{c.label}</option>
        {/each}
      </select>
    </div>
    {#if filterDocType || filterCategory || filterSearch}
      <button
        class="text-xs text-slate-400 hover:text-white underline self-end pb-1.5"
        on:click={clearFilters}
      >Clear filters</button>
    {/if}
  </div>

  <!-- Error -->
  <ErrorDisplay message={error} onDismiss={() => documentsStore.clearError()} />
  <ErrorDisplay message={checkError} onDismiss={() => (checkError = '')} />

  <!-- Check files -->
  {#if !loading && docs.length}
    <div class="flex flex-wrap items-center gap-3 text-sm" data-testid="check-bar">
      <button
        class="px-3 py-1.5 rounded border border-slate-600 text-slate-200 hover:border-teal-500 hover:text-teal-300 disabled:opacity-50"
        on:click={runCheck}
        disabled={checking}
      >{checking ? `Checking ${docs.length}…` : `Check files (${docs.length} shown)`}</button>
      {#if summary.checked}
        <span class="text-slate-300" data-testid="check-summary">
          Checked {summary.checked}{checkedAt ? ` at ${fmtTime(checkedAt)}` : ''}:
          <span class="text-green-400">{summary.fine} fine</span>{#if summary.withProblems}
            · <span class="text-red-300">{summary.withProblems} with a problem</span>{/if}{#if summary.notChecked}
            · <span class="text-slate-400">{summary.notChecked} shown since, not checked</span>{/if}
        </span>
        {#each summary.byLabel as p}
          <span class="text-xs px-1.5 py-0.5 rounded border {p.tone === 'red'
            ? 'bg-red-900/30 border-red-800 text-red-300'
            : 'bg-amber-900/30 border-amber-800 text-amber-300'}">{p.count} × {p.label}</span>
        {/each}
      {/if}
    </div>
  {/if}

  <!-- Document list -->
  {#if loading}
    <LoadingSpinner />
  {:else}
    <DocumentList
      {docs}
      checks={checkResults}
      canDelete={$permissions.isAdmin}
      extended={true}
      on:delete={handleDelete}
    />
  {/if}
</div>

<ConfirmDialog
  show={!!pendingDelete}
  title="Delete document"
  message={pendingDelete ? `Delete "${pendingDelete.display_name ?? pendingDelete.filename}"? This cannot be undone.` : ''}
  confirmText="Delete"
  danger={true}
  processing={deleting}
  on:confirm={confirmDelete}
  on:cancel={cancelDelete}
/>
