<!-- src/lib/components/common/documents/AttachedDocuments.svelte -->
<!--
  Self-contained "attached documents" panel for any entity: lists the
  document_library rows for (entityType, entityId), with inline upload
  (click or drag-and-drop) and delete-with-confirm. All I/O goes through
  $lib/utils/documentApi. Reusable across apps (Info notes, Golden Thread
  records, …).

  Emits `uploaded` (the new row) and `deleted` (the removed row) so hosts can
  hook in audit logging or their own state — the panel itself owns the list.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import * as docApi      from '$lib/utils/documentApi';
  import DocAttachInput   from '$lib/components/common/DocAttachInput.svelte';
  import FormInput        from '$lib/components/common/FormInput.svelte';
  import Button           from '$lib/components/common/Button.svelte';
  import ConfirmDialog    from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay     from '$lib/components/common/ErrorDisplay.svelte';
  import Icon             from '$lib/components/icons/Icon.svelte';
  import { fmtDate }      from '$lib/utils/dates.js';
  import { fmtBytes, mimeIcon } from '$lib/utils/files.js';

  /** @type {string} */ export let entityType;
  /** @type {string} */ export let entityId;
  export let canEdit    = false;   // show the upload affordance
  export let canDelete  = false;   // show per-document delete
  export let folderPath = '';      // storage folder for uploads
  export let docType    = 'other';
  export let title      = 'Documents';

  const dispatch = createEventDispatcher();

  let docs    = [];
  let loading = false;
  let error   = '';

  // Upload state
  let showUpload  = false;
  let file        = null;
  let description = '';
  let uploading   = false;
  let attachRef;

  // Delete state
  let pendingDelete = null;
  let deleting      = false;

  // Inline description edit. The description was capturable at upload but never
  // afterwards, even though PATCH /api/documents/[id] has always supported it —
  // so a typo or a later realisation had no route back in.
  let editingId   = null;
  let editingText = '';
  let savingEdit  = false;

  function startEdit(doc) {
    editingId = doc.id;
    editingText = doc.description ?? '';
  }

  async function saveEdit() {
    const id = editingId;              // capture before the await
    const value = editingText.trim();
    if (!id) return;
    savingEdit = true; error = '';
    try {
      const updated = await docApi.updateDocument(id, { description: value || null });
      docs = docs.map(d => d.id === id ? { ...d, ...updated } : d);
      dispatch('updated', updated);
      editingId = null;
    } catch (e) {
      error = e.message;
    } finally {
      savingEdit = false;
    }
  }

  async function load() {
    if (!entityId) { docs = []; return; }
    loading = true; error = '';
    try {
      docs = await docApi.listDocuments({ entity_type: entityType, entity_id: entityId });
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  // Reload whenever the entity changes.
  let loadedFor = null;
  $: if (entityId && entityId !== loadedFor) { loadedFor = entityId; load(); }

  /** Re-fetch from the server (host can call via bind:this). */
  export function reload() { return load(); }

  function cancelUpload() {
    showUpload = false; file = null; description = ''; attachRef?.reset?.();
  }

  async function doUpload() {
    if (!file) return;
    uploading = true; error = '';
    try {
      const doc = await docApi.uploadDocument(file, {
        entity_type:  entityType,
        entity_id:    entityId,
        display_name: file.name,
        doc_type:     docType,
        folder_path:  folderPath || undefined,
        description:  description.trim() || undefined,
      });
      docs = [doc, ...docs];
      cancelUpload();
      dispatch('uploaded', doc);
    } catch (e) {
      error = e.message;
    } finally {
      uploading = false;
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    deleting = true; error = '';
    try {
      await docApi.deleteDocument(target.id);
      docs = docs.filter(d => d.id !== target.id);
      dispatch('deleted', target);
    } catch (e) {
      error = e.message;
    } finally {
      deleting = false;
      pendingDelete = null;
    }
  }
</script>

<div>
  <div class="flex items-center gap-2 mb-3">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-1">
      {title}
      {#if docs.length > 0}
        <span class="ml-1 text-slate-500 font-normal normal-case tracking-normal">({docs.length})</span>
      {/if}
    </p>
    {#if canEdit && !showUpload}
      <button
        class="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
        on:click={() => showUpload = true}
      >
        <Icon name="upload" size={3} /> Upload
      </button>
    {/if}
  </div>

  <ErrorDisplay message={error} onDismiss={() => error = ''} />

  <!-- Inline uploader (click or drag-and-drop) -->
  {#if canEdit && showUpload}
    <div class="mb-3 space-y-2 rounded-lg border border-slate-700 bg-slate-800/40 p-3">
      <div class={uploading ? 'opacity-50 pointer-events-none' : ''}>
        <DocAttachInput bind:this={attachRef} bind:file />
      </div>
      <FormInput
        label="Description (optional)"
        bind:value={description}
        placeholder="e.g. EWS1 form issued Jan 2026"
        disabled={uploading}
      />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="small" on:click={cancelUpload} disabled={uploading}>Cancel</Button>
        <Button variant="primary" size="small" loading={uploading} disabled={uploading || !file}
                on:click={doUpload}>Upload</Button>
      </div>
    </div>
  {/if}

  <!-- List -->
  {#if loading}
    <p class="text-xs text-slate-500 italic py-2">Loading…</p>
  {:else if docs.length === 0}
    <p class="text-xs text-slate-600 italic py-2">No documents attached.</p>
  {:else}
    <div class="space-y-1.5">
      {#each docs as doc (doc.id)}
        <div class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 group">
          <span class="text-lg shrink-0">{mimeIcon(doc.mime_type)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-200 truncate">{doc.display_name || doc.filename}</p>
            {#if editingId === doc.id}
              <!-- svelte-ignore a11y-autofocus -->
              <input
                class="w-full bg-slate-900 text-xs text-slate-200 rounded px-1.5 py-1
                       border border-slate-600 outline-none"
                placeholder="What this file is"
                autofocus
                bind:value={editingText}
                disabled={savingEdit}
                on:blur={saveEdit}
                on:keydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                  if (e.key === 'Escape') { editingId = null; }
                }}
              />
            {:else}
              <p class="text-xs text-slate-500">
                {#if doc.description}<span class="text-slate-400">{doc.description} · </span>{/if}
                {#if doc.file_size}{fmtBytes(doc.file_size)} · {/if}
                {fmtDate(doc.created_at)}
                {#if canEdit}
                  <button
                    class="ml-1 text-slate-600 hover:text-purple-300 transition-colors"
                    title={doc.description ? 'Edit the description' : 'Add a description'}
                    on:click={() => startEdit(doc)}
                  >✎</button>
                {/if}
              </p>
            {/if}
          </div>
          <a
            href={doc.web_view_url}
            target="_blank"
            rel="noopener noreferrer"
            class="p-1.5 rounded text-slate-500 hover:text-purple-300 transition-colors shrink-0"
            title="Open / download"
          >
            <Icon name="download" size={4} />
          </a>
          {#if canDelete}
            <button
              class="p-1.5 rounded text-slate-600 hover:text-red-400 transition-colors shrink-0
                     opacity-0 group-hover:opacity-100"
              title="Delete document"
              on:click={() => pendingDelete = doc}
            >
              <Icon name="delete" size={4} />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={deleting}
  title="Delete Document"
  message="Delete '{pendingDelete?.display_name || pendingDelete?.filename}'? This cannot be undone."
  confirmLabel="Delete Document"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
