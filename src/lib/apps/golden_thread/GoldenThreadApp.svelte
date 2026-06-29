<!-- src/lib/apps/golden_thread/GoldenThreadApp.svelte -->
<!--
  Golden Thread — L2 Common Data Environment (document register) app shell.
  Tabs: Register (list → document detail with lifecycle actions) · Ingest ·
  Completeness. Build steps 2–4 done; links/citations UI + review-tick harness
  (steps 6–7) still to come.
-->
<script>
  import { onMount } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { gtStore }     from '$lib/apps/golden_thread/stores/gtStore';
  import { GT_STATUS_LABELS, GT_STATUS_BADGE } from '$lib/apps/golden_thread/utils/gtLifecycle.js';
  import Badge         from '$lib/components/common/Badge.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import GtIngestForm  from '$lib/apps/golden_thread/components/GtIngestForm.svelte';
  import GtDocumentDetail from '$lib/apps/golden_thread/components/GtDocumentDetail.svelte';
  import { fmtDate }   from '$lib/utils/dates';

  $: userId  = $auth.user?.id;

  let activeTab = 'register'; // 'register' | 'ingest' | 'completeness'
  let viewingDetail = false;

  $: documents    = $gtStore.documents;
  $: selectedDoc  = $gtStore.selectedDocument;
  $: completeness = $gtStore.completeness;
  $: categories   = $gtStore.categories;
  $: loading      = $gtStore.loading;
  $: saving       = $gtStore.saving;
  $: error        = $gtStore.error;
  $: canEdit      = $permissions.isAdmin || $permissions.canModify;
  $: tabs = canEdit
    ? [['register', 'Register'], ['ingest', 'Ingest'], ['completeness', 'Completeness']]
    : [['register', 'Register'], ['completeness', 'Completeness']];

  onMount(async () => {
    if (userId) {
      await permissions.init(userId, 'golden_thread');
      await gtStore.load();
      await gtStore.loadCompleteness();
    }
  });

  async function selectTab(tab) {
    activeTab = tab;
    if (tab === 'completeness' && completeness.length === 0) {
      await gtStore.loadCompleteness();
    }
    if (tab === 'ingest' && categories.length === 0) {
      await gtStore.loadCategories();
    }
  }

  async function handleIngest({ detail }) {
    const r = await gtStore.createDraft(detail);
    if (r.success) {
      await gtStore.loadCompleteness();
      activeTab = 'register';
    }
  }

  async function selectDoc(doc) {
    await gtStore.loadDocument(doc.id);
    viewingDetail = true;
  }

  function backToRegister() {
    viewingDetail = false;
  }

  // A lifecycle action changed status — refresh completeness (accept changes
  // the current-count) and the register list so badges stay in sync.
  async function handleChanged() {
    await Promise.all([gtStore.loadCompleteness(), gtStore.load()]);
  }
</script>

<div>
  <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div>
      <h1 class="text-2xl font-bold text-white">Golden Thread</h1>
      <p class="text-xs text-slate-500 mt-0.5">
        BSA 2022 s.88 · the building's controlled document register (L2 / ISO 19650 CDE)
      </p>
    </div>
  </div>

  {#if error}
    <div class="mb-4">
      <ErrorDisplay message={error} onDismiss={() => gtStore.clearError()} />
    </div>
  {/if}

  {#if viewingDetail && selectedDoc}
    <GtDocumentDetail
      doc={selectedDoc}
      {saving}
      on:back={backToRegister}
      on:changed={handleChanged}
    />
  {:else}
  <!-- Tab bar -->
  <div class="flex gap-1 border-b border-slate-700 mb-5">
    {#each tabs as [tab, label]}
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
               {activeTab === tab
                 ? 'border-purple-500 text-white'
                 : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'}"
        on:click={() => selectTab(tab)}
      >{label}</button>
    {/each}
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if activeTab === 'register'}
    <!-- ── Register list ─────────────────────────────────────────────────── -->
    {#if documents.length === 0}
      <p class="text-sm text-slate-400 py-8 text-center">
        No documents in the register yet. Ingest (producer upload) lands in the next build step.
      </p>
    {:else}
      <div class="overflow-x-auto rounded-lg border border-slate-700">
        <table class="w-full text-sm">
          <thead class="bg-slate-800 text-slate-300">
            <tr>
              <th class="text-left font-medium px-3 py-2">Reference</th>
              <th class="text-left font-medium px-3 py-2">Title</th>
              <th class="text-left font-medium px-3 py-2">Type</th>
              <th class="text-left font-medium px-3 py-2">Status</th>
              <th class="text-left font-medium px-3 py-2">Effective</th>
              <th class="text-left font-medium px-3 py-2">Review due</th>
            </tr>
          </thead>
          <tbody>
            {#each documents as doc (doc.id)}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <tr class="border-t border-slate-700 hover:bg-slate-800/50 cursor-pointer" on:click={() => selectDoc(doc)}>
                <td class="px-3 py-2 font-mono text-xs text-slate-300">{doc.reference}</td>
                <td class="px-3 py-2 text-white">{doc.title}</td>
                <td class="px-3 py-2 text-slate-400">{doc.document_type}</td>
                <td class="px-3 py-2">
                  <Badge color={GT_STATUS_BADGE[doc.status] ?? 'bg-slate-500'}>
                    {GT_STATUS_LABELS[doc.status] ?? doc.status}
                  </Badge>
                </td>
                <td class="px-3 py-2 text-slate-400">{doc.effective_from ? fmtDate(doc.effective_from) : '—'}</td>
                <td class="px-3 py-2 text-slate-400">{doc.review_due ? fmtDate(doc.review_due) : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {:else if activeTab === 'ingest'}
    <!-- ── Ingest (create a draft) ───────────────────────────────────────── -->
    {#if canEdit}
      <GtIngestForm
        {categories}
        {saving}
        on:submit={handleIngest}
        on:cancel={() => (activeTab = 'register')}
      />
    {:else}
      <p class="text-sm text-slate-400 py-8 text-center">You don't have permission to ingest documents.</p>
    {/if}
  {:else if activeTab === 'completeness'}
    <!-- ── Schedule-1 completeness dashboard ─────────────────────────────── -->
    {#if completeness.length === 0}
      <p class="text-sm text-slate-400 py-8 text-center">No applicable Schedule-1 categories loaded.</p>
    {:else}
      <div class="grid gap-2 sm:grid-cols-2">
        {#each completeness as cat (cat.code)}
          <div class="flex items-center justify-between rounded-lg border border-slate-700 px-3 py-2.5">
            <div class="min-w-0">
              <p class="text-xs text-slate-500">Category {cat.code}</p>
              <p class="text-sm text-white truncate">{cat.name}</p>
            </div>
            <Badge color={cat.satisfied ? 'bg-green-600' : 'bg-red-700'}>
              {cat.satisfied ? `${cat.currentCount} current` : 'Missing'}
            </Badge>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
  {/if}
</div>
