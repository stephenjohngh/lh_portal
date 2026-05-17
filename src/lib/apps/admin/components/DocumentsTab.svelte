<!-- src/lib/apps/admin/components/DocumentsTab.svelte -->
<!-- Document library demo/management tab in the Admin app.            -->
<!-- Demonstrates upload, browse, filter, and deletion of documents.   -->
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
      <h3 class="text-lg font-semibold text-slate-100">Document Library</h3>
      <p class="text-sm text-slate-400">
        Upload and index documents stored in external storage.
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

  <!-- Upload area -->
  <div class="bg-slate-850 border border-slate-700 rounded-lg p-4">
    <p class="text-sm font-medium text-slate-300 mb-3">Upload a document</p>
    <DocumentUploader
      extended={true}
      folderPath="documents"
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
