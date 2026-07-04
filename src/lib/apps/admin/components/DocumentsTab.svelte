<!-- src/lib/apps/admin/components/DocumentsTab.svelte -->
<!-- "Document Demo" tab in the Admin app — a global, admin-only browser over
     the shared document_library INDEX table. Lists every indexed document
     across all apps/entities (newest first, capped at 200), reading the DB
     index rather than the storage provider directly. Demo + admin cleanup
     view: everyday document handling lives in each entity's own
     AttachedDocuments panel, not here. Uploads made here are "loose" (no
     entity_type/entity_id) and land in a Documents folder. -->
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
  import { DOC_TYPES, CATEGORIES } from '$lib/utils/documentUtils';

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

  // Summary stats
  $: total     = docs.length;
  $: expiring  = docs.filter(d => {
    if (!d.expiry_date) return false;
    const diff = new Date(d.expiry_date) - Date.now();
    return diff >= 0 && diff < 30 * 86_400_000;
  }).length;
  $: expired   = docs.filter(d => d.expiry_date && new Date(d.expiry_date) < new Date()).length;
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
      Every document indexed in the
      <code class="px-1 py-0.5 rounded bg-slate-700/70 text-slate-200 text-xs">document_library</code>
      table — the portal's shared document index — listed newest-first across all apps and entities.
      It reads the database index, <strong>not</strong> Google Drive directly: you're seeing files
      that have a library record (Info-note attachments, Golden Thread ingested copies, per-entity
      uploads, plus loose files uploaded here). Maintenance documents and inspection photos live in
      separate tables and won't appear.
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
      folderPath="Documents"
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
        {#each CATEGORIES as c}
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

  <!-- Document list -->
  {#if loading}
    <LoadingSpinner />
  {:else}
    <DocumentList
      {docs}
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
