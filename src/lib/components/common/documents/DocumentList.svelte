<script>
  import { createEventDispatcher } from 'svelte';
  import { mimeIcon, formatFileSize, docTypeLabel, categoryLabel, getExpiryStatus } from '$lib/utils/documentUtils';
  import { fmtDate } from '$lib/utils/dates';

  /** @type {Object[]} document_library rows */
  export let docs       = [];
  /** @type {boolean} */
  export let canDelete  = false;
  /** @type {boolean} Show category + expiry columns */
  export let extended   = true;

  const dispatch = createEventDispatcher();

  $: sorted = [...docs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  function expiryClass(status) {
    if (status === 'expired')      return 'text-red-400';
    if (status === 'expiring-soon') return 'text-amber-400';
    return '';
  }

  function openDoc(doc) {
    if (doc.web_view_url) window.open(doc.web_view_url, '_blank', 'noopener');
    else dispatch('geturl', doc);
  }
</script>

{#if !docs.length}
  <p class="text-sm text-slate-500 py-4 text-center">No documents found.</p>
{:else}
  <div class="overflow-x-auto">
    <table class="w-full text-sm text-left">
      <thead>
        <tr class="border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
          <th class="pb-2 pr-4 font-medium">Name</th>
          <th class="pb-2 pr-4 font-medium">Type</th>
          {#if extended}
            <th class="pb-2 pr-4 font-medium">Category</th>
            <th class="pb-2 pr-4 font-medium">Expiry</th>
          {/if}
          <th class="pb-2 pr-4 font-medium">Size</th>
          <th class="pb-2 pr-4 font-medium">Added</th>
          <th class="pb-2 font-medium sr-only">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as doc (doc.id)}
          {@const expStatus = getExpiryStatus(doc.expiry_date)}
          <tr class="border-b border-slate-800 hover:bg-slate-800/50 group">
            <!-- Name -->
            <td class="py-2 pr-4 max-w-xs">
              <div class="flex items-center gap-2">
                <span class="text-lg flex-shrink-0" aria-hidden="true">{mimeIcon(doc.mime_type)}</span>
                <button
                  class="text-slate-100 hover:text-teal-300 text-left truncate"
                  on:click={() => openDoc(doc)}
                  title={doc.display_name ?? doc.filename}
                >{doc.display_name ?? doc.filename}</button>
              </div>
            </td>

            <!-- Type -->
            <td class="py-2 pr-4 text-slate-400 whitespace-nowrap">{docTypeLabel(doc.doc_type)}</td>

            {#if extended}
              <!-- Category -->
              <td class="py-2 pr-4 text-slate-400 whitespace-nowrap">
                {doc.category ? categoryLabel(doc.category) : '—'}
              </td>

              <!-- Expiry -->
              <td class="py-2 pr-4 whitespace-nowrap {expiryClass(expStatus)}">
                {doc.expiry_date ? fmtDate(doc.expiry_date) : '—'}
                {#if expStatus === 'expired'}⚠{/if}
                {#if expStatus === 'expiring-soon'}⏰{/if}
              </td>
            {/if}

            <!-- Size -->
            <td class="py-2 pr-4 text-slate-500 whitespace-nowrap">{formatFileSize(doc.file_size)}</td>

            <!-- Added -->
            <td class="py-2 pr-4 text-slate-500 whitespace-nowrap">{fmtDate(doc.created_at)}</td>

            <!-- Actions -->
            <td class="py-2 whitespace-nowrap">
              <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="px-2 py-0.5 text-xs text-slate-400 hover:text-teal-300 border border-slate-700 rounded hover:border-slate-500"
                  on:click={() => openDoc(doc)}
                >Open ↗</button>
                {#if canDelete}
                  <button
                    class="px-2 py-0.5 text-xs text-red-400 hover:text-red-300 border border-slate-700 rounded hover:border-red-800"
                    on:click={() => dispatch('delete', doc)}
                  >Delete</button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
