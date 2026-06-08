<!-- src/lib/apps/maintenance/components/DocumentUpload.svelte -->
<!-- File upload widget for maintenance documents. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { maintenanceStore }      from '../stores/maintenanceStore.js';
  import { docTypeLabel, docTypeIcon, expiryRag, fmtBytes } from '../utils/maintenanceHelpers.js';
  import { fmtDate }             from '$lib/utils/dates.js';
  import { normalisePhotoUrl }   from '$lib/utils/driveUtils.js';
  import Button                  from '$lib/components/common/Button.svelte';

  export let jobId;
  export let docs = [];    // already-loaded documents for this job

  const dispatch = createEventDispatcher();

  const DOC_TYPES = ['certificate', 'report', 'photo', 'invoice', 'other'];

  let selectedType  = 'certificate';
  let expiryDate    = '';
  let fileInput;
  let uploading     = false;
  let uploadError   = null;
  let deleting      = {};   // { [docId]: true }

  $: showExpiry = selectedType === 'certificate';

  async function handleFileChange(e) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    uploadError = null;
    uploading   = true;
    try {
      for (const file of files) {
        await maintenanceStore.uploadDocument(jobId, file, selectedType, expiryDate || null);
      }
      dispatch('uploaded');
      expiryDate = '';
      fileInput.value = '';
    } catch (err) {
      uploadError = err.message;
    } finally {
      uploading = false;
    }
  }

  async function deleteDoc(doc) {
    deleting = { ...deleting, [doc.id]: true };
    try {
      await maintenanceStore.deleteDocument(doc.id, doc.storage_path);
      dispatch('deleted', { id: doc.id });
    } catch (err) {
      uploadError = err.message;
    } finally {
      const next = { ...deleting };
      delete next[doc.id];
      deleting = next;
    }
  }

  function expiryClass(dateStr) {
    const r = expiryRag(dateStr);
    if (r === 'expired')  return 'text-red-400';
    if (r === 'expiring') return 'text-amber-400';
    return 'text-slate-400';
  }
</script>

<div class="space-y-4">

  <!-- Upload controls -->
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <p class="text-xs text-slate-400 mb-1">Document type</p>
      <select bind:value={selectedType}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500">
        {#each DOC_TYPES as t}
          <option value={t}>{docTypeIcon(t)} {docTypeLabel(t)}</option>
        {/each}
      </select>
    </div>

    {#if showExpiry}
      <div>
        <p class="text-xs text-slate-400 mb-1">Expiry date <span class="text-slate-500">(optional)</span></p>
        <input type="date" bind:value={expiryDate}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:border-purple-500" />
      </div>
    {/if}

    <div>
      <p class="text-xs text-slate-400 mb-1">File</p>
      <label class="btn-upload" class:opacity-50={uploading}>
        {uploading ? 'Uploading…' : '+ Add file'}
        <input type="file" bind:this={fileInput} on:change={handleFileChange}
               accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.xlsx,.xls"
               multiple disabled={uploading} class="sr-only" />
      </label>
    </div>
  </div>

  {#if uploadError}
    <p class="text-sm text-red-400">⚠ {uploadError}</p>
  {/if}

  <!-- Document list -->
  {#if docs.length > 0}
    <div class="divide-y divide-slate-700/50">
      {#each docs as doc (doc.id)}
        <div class="flex items-center gap-3 py-2">
          <span class="text-base flex-shrink-0">{docTypeIcon(doc.doc_type)}</span>
          <div class="flex-1 min-w-0">
            <a href={normalisePhotoUrl(doc.storage_path)} target="_blank" rel="noreferrer"
               class="text-sm text-purple-300 hover:text-purple-200 truncate block">
              {doc.filename}
            </a>
            <div class="text-xs text-slate-500 flex gap-2 mt-0.5">
              <span>{docTypeLabel(doc.doc_type)}</span>
              {#if doc.file_size}<span>· {fmtBytes(doc.file_size)}</span>{/if}
              {#if doc.expiry_date}
                <span class={expiryClass(doc.expiry_date)}>· Expires {fmtDate(doc.expiry_date)}</span>
              {/if}
            </div>
          </div>
          <button
            class="text-slate-600 hover:text-red-400 transition-colors text-sm px-1"
            disabled={deleting[doc.id]}
            on:click={() => deleteDoc(doc)}
            aria-label="Delete document"
          >
            {deleting[doc.id] ? '…' : '✕'}
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-sm text-slate-600 italic">No documents attached.</p>
  {/if}

</div>

<style>
  .btn-upload {
    display: inline-flex; align-items: center; cursor: pointer;
    padding: 0.375rem 0.875rem; border-radius: 6px; font-size: 0.875rem;
    background: rgb(100 116 139 / 0.3); border: 1px solid rgb(100 116 139 / 0.5);
    color: #cbd5e1; transition: background 0.15s;
  }
  .btn-upload:hover { background: rgb(100 116 139 / 0.5); }
</style>
