<!-- src/lib/apps/maintenance/components/DocumentsTab.svelte -->
<!-- All maintenance documents across all jobs, with expiry alerts and filters. -->
<script>
  import { maintenanceStore } from '../stores/maintenanceStore.js';
  import { docTypeLabel, docTypeIcon, expiryRag, fmtBytes } from '../utils/maintenanceHelpers.js';
  import { fmtDate }           from '$lib/utils/dates.js';
  import { normalisePhotoUrl } from '$lib/utils/driveUtils.js';
  import GtRegisterButton      from './GtRegisterButton.svelte';

  export let docs = [];   // store.allDocs — passed from parent

  const DOC_TYPE_OPTS = [
    { value: 'all',         label: 'All types' },
    { value: 'certificate', label: 'Certificates' },
    { value: 'report',      label: 'Reports' },
    { value: 'photo',       label: 'Photos' },
    { value: 'invoice',     label: 'Invoices' },
    { value: 'other',       label: 'Other' },
  ];

  const EXPIRY_OPTS = [
    { value: 'all',      label: 'All' },
    { value: 'expired',  label: 'Expired' },
    { value: 'expiring', label: 'Expiring soon (60 days)' },
    { value: 'valid',    label: 'Valid' },
    { value: 'none',     label: 'No expiry' },
  ];

  let typeFilter   = 'all';
  let expiryFilter = 'all';
  let search       = '';

  $: expiredDocs  = docs.filter(d => d.expiry_date && expiryRag(d.expiry_date) === 'expired');
  $: expiringDocs = docs.filter(d => d.expiry_date && expiryRag(d.expiry_date) === 'expiring');

  $: filtered = docs.filter(d => {
    // Type filter
    if (typeFilter !== 'all' && d.doc_type !== typeFilter) return false;
    // Expiry filter
    if (expiryFilter !== 'all') {
      if (expiryFilter === 'none') {
        if (d.expiry_date) return false;
      } else {
        if (!d.expiry_date) return false;
        if (expiryRag(d.expiry_date) !== expiryFilter) return false;
      }
    }
    // Text search
    if (search.trim()) {
      const q   = search.toLowerCase();
      const hay = `${d.filename} ${d.job?.title ?? ''} ${d.job?.scope_label ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function expiryClass(dateStr) {
    const r = expiryRag(dateStr);
    if (r === 'expired')  return 'text-red-400';
    if (r === 'expiring') return 'text-amber-400';
    return 'text-slate-500';
  }
</script>

<div class="space-y-4">

  <!-- Alert banner for expired / expiring certificates -->
  {#if expiredDocs.length > 0 || expiringDocs.length > 0}
    <div class="rounded-lg border {expiredDocs.length > 0 ? 'border-red-800/50 bg-red-900/10' : 'border-amber-800/50 bg-amber-900/10'} px-4 py-3">
      <div class="flex items-start gap-2">
        <span class="text-base">{expiredDocs.length > 0 ? '🔴' : '🟡'}</span>
        <div class="text-sm">
          {#if expiredDocs.length > 0}
            <span class="text-red-300 font-semibold">{expiredDocs.length} certificate{expiredDocs.length === 1 ? '' : 's'} expired</span>
            {#if expiringDocs.length > 0}
              <span class="text-slate-400"> · </span>
            {/if}
          {/if}
          {#if expiringDocs.length > 0}
            <span class="text-amber-300 font-semibold">{expiringDocs.length} expiring within 60 days</span>
          {/if}
          <button
            class="ml-2 text-xs text-purple-400 underline"
            on:click={() => { typeFilter = 'certificate'; expiryFilter = expiryFilter === 'all' ? 'expired' : 'all'; }}
          >
            Filter
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Filters -->
  <div class="flex gap-2 flex-wrap items-center">
    <input
      type="text"
      placeholder="Search documents…"
      bind:value={search}
      class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
             placeholder:text-slate-500 focus:outline-none focus:border-purple-500 flex-1 min-w-48"
    />
    <select bind:value={typeFilter}
      class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500">
      {#each DOC_TYPE_OPTS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <select bind:value={expiryFilter}
      class="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white
             focus:outline-none focus:border-purple-500">
      {#each EXPIRY_OPTS as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <span class="text-xs text-slate-500 whitespace-nowrap">{filtered.length} doc{filtered.length === 1 ? '' : 's'}</span>
  </div>

  <!-- Document list -->
  {#if filtered.length === 0}
    <div class="text-center py-12 text-slate-500">
      {#if docs.length === 0}
        <div class="text-4xl mb-3">📁</div>
        <p class="text-sm">No documents uploaded yet.</p>
        <p class="text-xs mt-1">Upload documents when recording job completions.</p>
      {:else}
        <p class="text-sm">No documents match the current filters.</p>
        <button class="text-xs text-purple-400 mt-1 underline"
          on:click={() => { search = ''; typeFilter = 'all'; expiryFilter = 'all'; }}>
          Clear filters
        </button>
      {/if}
    </div>
  {:else}
    <div class="rounded-lg border border-slate-700 divide-y divide-slate-700/40 overflow-hidden">
      {#each filtered as doc (doc.id)}
        <div class="flex items-center gap-3 px-4 py-3 hover:bg-slate-700/10 transition-colors">
          <span class="text-xl flex-shrink-0">{docTypeIcon(doc.doc_type)}</span>

          <div class="flex-1 min-w-0">
            <a href={normalisePhotoUrl(doc.storage_path)} target="_blank" rel="noreferrer"
               class="text-sm text-purple-300 hover:text-purple-200 truncate block font-medium">
              {doc.filename}
            </a>
            <div class="flex items-center gap-2 mt-0.5 flex-wrap">
              <span class="text-xs text-slate-500">{docTypeLabel(doc.doc_type)}</span>
              {#if doc.file_size}
                <span class="text-xs text-slate-600">· {fmtBytes(doc.file_size)}</span>
              {/if}
              {#if doc.expiry_date}
                <span class="text-xs {expiryClass(doc.expiry_date)}">
                  · Expires {fmtDate(doc.expiry_date)}
                </span>
              {/if}
            </div>
            {#if doc.job}
              <div class="text-xs text-slate-600 mt-0.5 truncate">
                Job: {doc.job.title}
                {#if doc.job.scope_label} · {doc.job.scope_label}{/if}
                {#if doc.job.scheduled_date} · {fmtDate(doc.job.scheduled_date)}{/if}
              </div>
            {/if}
          </div>

          <GtRegisterButton {doc} />

          <a
            href={normalisePhotoUrl(doc.storage_path)}
            target="_blank"
            rel="noreferrer"
            class="flex-shrink-0 text-slate-500 hover:text-purple-400 transition-colors text-sm px-1"
            aria-label="Download {doc.filename}"
          >
            ⬇
          </a>
        </div>
      {/each}
    </div>
  {/if}

</div>
