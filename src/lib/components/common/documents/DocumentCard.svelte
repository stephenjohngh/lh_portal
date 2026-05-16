<script>
  import { createEventDispatcher } from 'svelte';
  import { mimeIcon, formatFileSize, docTypeLabel, getExpiryStatus } from '$lib/utils/documentUtils';
  import { fmtDate } from '$lib/utils/dates';

  /** @type {Object} document_library row */
  export let doc;
  /** @type {boolean} */
  export let canDelete = false;

  const dispatch = createEventDispatcher();

  $: expiryStatus = getExpiryStatus(doc.expiry_date);
  $: expiryClass  = expiryStatus === 'expired'
    ? 'text-red-400'
    : expiryStatus === 'expiring-soon'
    ? 'text-amber-400'
    : 'text-slate-400';

  function open() {
    if (doc.web_view_url) window.open(doc.web_view_url, '_blank', 'noopener');
    else dispatch('geturl', doc);
  }
</script>

<div class="group bg-slate-800 border border-slate-700 rounded-lg p-3 hover:border-slate-500 transition-colors">
  <div class="flex items-start gap-3">
    <span class="text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">{mimeIcon(doc.mime_type)}</span>

    <div class="flex-1 min-w-0">
      <button
        class="text-sm font-medium text-slate-100 hover:text-teal-300 text-left truncate w-full"
        on:click={open}
        title={doc.display_name ?? doc.filename}
      >{doc.display_name ?? doc.filename}</button>

      <p class="text-xs text-slate-400 mt-0.5">
        {docTypeLabel(doc.doc_type)}
        {#if doc.file_size}· {formatFileSize(doc.file_size)}{/if}
        {#if doc.created_at}· {fmtDate(doc.created_at)}{/if}
      </p>

      {#if doc.expiry_date}
        <p class="text-xs mt-0.5 {expiryClass}">
          {expiryStatus === 'expired' ? '⚠ Expired' : expiryStatus === 'expiring-soon' ? '⏰ Expiring soon' : 'Expires'}
          {fmtDate(doc.expiry_date)}
        </p>
      {/if}

      {#if doc.issuer || doc.reference_number}
        <p class="text-xs text-slate-500 mt-0.5 truncate">
          {[doc.issuer, doc.reference_number].filter(Boolean).join(' · ')}
        </p>
      {/if}
    </div>

    <div class="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        class="p-1 text-slate-400 hover:text-teal-300"
        title="Open"
        on:click={open}
        aria-label="Open {doc.display_name ?? doc.filename}"
      >↗</button>
      {#if canDelete}
        <button
          class="p-1 text-slate-400 hover:text-red-400"
          title="Delete"
          on:click={() => dispatch('delete', doc)}
          aria-label="Delete {doc.display_name ?? doc.filename}"
        >✕</button>
      {/if}
    </div>
  </div>
</div>
