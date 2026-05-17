<script>
  import { createEventDispatcher } from 'svelte';
  import { documentsStore } from '$lib/stores/documentsStore';
  import { docTypeFromMime, formatFileSize, DOC_TYPES, CATEGORIES } from '$lib/utils/documentUtils';

  /** @type {string|null} Pre-set entity type (optional) */
  export let entityType  = null;
  /** @type {string|null} Pre-set entity id (optional) */
  export let entityId    = null;
  /** @type {string}      Storage folder path prefix */
  export let folderPath  = '';
  /** @type {boolean}     Show extra metadata fields */
  export let extended    = false;
  /** @type {boolean} */
  export let disabled    = false;

  const dispatch = createEventDispatcher();

  let dragging  = false;
  let files     = /** @type {File[]} */([]);
  let uploading = false;
  let progress  = 0;
  let error     = '';

  // Metadata state
  let displayName    = '';
  let docType        = 'other';
  let category       = '';
  let title          = '';
  let description    = '';
  let documentDate   = '';
  let expiryDate     = '';
  let referenceNumber= '';
  let issuer         = '';

  function onDrop(e) {
    e.preventDefault();
    dragging = false;
    if (disabled) return;
    files = [...e.dataTransfer.files];
    if (files[0]) autofill(files[0]);
  }

  function onFileInput(e) {
    files = [...e.target.files];
    if (files[0]) autofill(files[0]);
  }

  function autofill(file) {
    displayName = displayName || file.name;
    docType     = docTypeFromMime(file.type) || docType;
  }

  async function handleUpload() {
    if (!files.length || uploading) return;
    uploading = true;
    error     = '';
    progress  = 0;

    const meta = {
      display_name:    displayName || files[0].name,
      doc_type:        docType,
      category:        category     || null,
      entity_type:     entityType   || null,
      entity_id:       entityId     || null,
      title:           title        || null,
      description:     description  || null,
      document_date:   documentDate || null,
      expiry_date:     expiryDate   || null,
      reference_number:referenceNumber || null,
      issuer:          issuer       || null,
      folder_path:     folderPath   || '',
      tags:            [],
    };

    try {
      // Upload each file sequentially via the store (auth header handled there)
      const results = [];
      for (let i = 0; i < files.length; i++) {
        results.push(await documentsStore.upload(files[i], meta));
        progress = Math.round(((i + 1) / files.length) * 100);
      }
      dispatch('uploaded', results);
      reset();
    } catch (err) {
      error = err.message;
    } finally {
      uploading = false;
    }
  }

  function reset() {
    files = []; displayName = ''; docType = 'other'; category = '';
    title = ''; description = ''; documentDate = ''; expiryDate = '';
    referenceNumber = ''; issuer = ''; progress = 0;
  }
</script>

<div class="space-y-4">
  <!-- Drop zone -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
           {dragging   ? 'border-teal-400 bg-teal-900/20' : 'border-slate-600 hover:border-slate-400'}
           {disabled   ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
    on:dragover|preventDefault={() => { if (!disabled) dragging = true; }}
    on:dragleave={() => dragging = false}
    on:drop={onDrop}
    on:click={() => { if (!disabled) document.getElementById('doc-file-input').click(); }}
    on:keydown={e => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) document.getElementById('doc-file-input').click(); }}
    role="button"
    tabindex={disabled ? -1 : 0}
    aria-label="Drop files here or click to browse"
  >
    <input
      id="doc-file-input"
      type="file"
      multiple
      class="hidden"
      on:change={onFileInput}
      {disabled}
    />
    {#if files.length}
      <p class="text-sm text-slate-300 font-medium">
        {files.map(f => f.name).join(', ')}
      </p>
      <p class="text-xs text-slate-500 mt-1">
        {files.map(f => formatFileSize(f.size)).join(' · ')}
      </p>
    {:else}
      <p class="text-slate-400 text-sm">Drop files here or <span class="text-teal-400 underline">browse</span></p>
      <p class="text-slate-500 text-xs mt-1">PDF, Word, Excel, images — max 50 MB each</p>
    {/if}
  </div>

  {#if files.length}
    <!-- Basic metadata -->
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <p class="text-xs text-slate-400 mb-1">Display name</p>
        <input
          class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          bind:value={displayName}
          placeholder={files[0]?.name ?? ''}
        />
      </div>
      <div>
        <p class="text-xs text-slate-400 mb-1">Document type</p>
        <select
          class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          bind:value={docType}
        >
          {#each DOC_TYPES as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>

      <div>
        <p class="text-xs text-slate-400 mb-1">Category</p>
        <select
          class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
          bind:value={category}
        >
          <option value="">— none —</option>
          {#each CATEGORIES as c}
            <option value={c.value}>{c.label}</option>
          {/each}
        </select>
      </div>

      {#if extended}
        <div>
          <p class="text-xs text-slate-400 mb-1">Issuer / company</p>
          <input
            class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            bind:value={issuer}
            placeholder="e.g. Certsure, Gas Safe Register"
          />
        </div>
        <div>
          <p class="text-xs text-slate-400 mb-1">Reference / cert number</p>
          <input
            class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            bind:value={referenceNumber}
          />
        </div>
        <div>
          <p class="text-xs text-slate-400 mb-1">Document date</p>
          <input
            type="date"
            class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            bind:value={documentDate}
          />
        </div>
        <div>
          <p class="text-xs text-slate-400 mb-1">Expiry date</p>
          <input
            type="date"
            class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
            bind:value={expiryDate}
          />
        </div>
        <div class="sm:col-span-2">
          <p class="text-xs text-slate-400 mb-1">Description</p>
          <textarea
            rows="2"
            class="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
            bind:value={description}
          ></textarea>
        </div>
      {/if}
    </div>

    {#if uploading}
      <div class="h-2 bg-slate-700 rounded overflow-hidden">
        <div
          class="h-full bg-teal-500 transition-all duration-300"
          style="width: {progress}%"
        ></div>
      </div>
      <p class="text-xs text-slate-400 text-center">{progress}%</p>
    {/if}

    {#if error}
      <p class="text-sm text-red-400">{error}</p>
    {/if}

    <div class="flex gap-2 justify-end">
      <button
        class="px-3 py-1.5 text-sm text-slate-300 hover:text-white border border-slate-600 rounded hover:border-slate-400"
        on:click={reset}
        disabled={uploading}
      >Cancel</button>
      <button
        class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded disabled:opacity-50"
        on:click={handleUpload}
        disabled={uploading || !files.length}
      >{uploading ? 'Uploading…' : `Upload ${files.length > 1 ? `${files.length} files` : 'file'}`}</button>
    </div>
  {/if}
</div>
