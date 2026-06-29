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
  import { GT_STATUS_LABELS, GT_STATUS_BADGE, GT_STATUSES } from '$lib/apps/golden_thread/utils/gtLifecycle.js';
  import { documentsCurrentOn } from '$lib/apps/golden_thread/public.js';
  import { postJson }   from '$lib/utils/request';
  import Badge         from '$lib/components/common/Badge.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import GtIngestForm  from '$lib/apps/golden_thread/components/GtIngestForm.svelte';
  import GtDocumentDetail from '$lib/apps/golden_thread/components/GtDocumentDetail.svelte';
  import GtPeople      from '$lib/apps/golden_thread/components/GtPeople.svelte';
  import { fmtDate }   from '$lib/utils/dates';

  $: userId  = $auth.user?.id;

  let activeTab = 'register'; // 'register' | 'ingest' | 'completeness' | 'review'
  let viewingDetail = false;

  // Register filters / time-travel
  let filterStatus = 'all';
  let timeTravelDate = '';
  /** @type {any[]|null} */
  let timeTravelDocs = null;

  // Review-tick dev harness
  let reviewRunning = false;
  /** @type {any|null} */
  let reviewSummary = null;
  let reviewError = '';

  $: documents    = $gtStore.documents;
  $: selectedDoc  = $gtStore.selectedDocument;
  $: completeness = $gtStore.completeness;
  $: categories   = $gtStore.categories;
  $: persons      = $gtStore.persons;
  $: loading      = $gtStore.loading;
  $: saving       = $gtStore.saving;
  $: error        = $gtStore.error;
  $: canEdit      = $permissions.isAdmin || $permissions.canModify;
  $: isAdmin      = $permissions.isAdmin;
  $: currentDocs  = documents.filter((d) => d.status === 'current');
  $: tabs = [
    ['register', 'Register'],
    ...(canEdit ? [['ingest', 'Ingest']] : []),
    ['completeness', 'Completeness'],
    ...(canEdit ? [['people', 'People']] : []),
    ...(isAdmin ? [['review', 'Review']] : [])
  ];

  // What the register table shows: time-travel snapshot if a date is set,
  // otherwise the full list filtered by status.
  $: displayedDocs = (timeTravelDate && timeTravelDocs)
    ? timeTravelDocs
    : (filterStatus === 'all' ? documents : documents.filter((d) => d.status === filterStatus));

  const statusFilterOptions = ['all', ...GT_STATUSES];

  async function applyTimeTravel() {
    if (!timeTravelDate) { timeTravelDocs = null; return; }
    timeTravelDocs = await documentsCurrentOn(timeTravelDate);
  }

  async function runReviewTick() {
    reviewRunning = true;
    reviewError = '';
    try {
      reviewSummary = await postJson('/api/cron/review-tick', {}, 'Review tick failed');
    } catch (e) {
      reviewError = e.message;
    } finally {
      reviewRunning = false;
    }
  }

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
    if (tab === 'ingest') {
      if (categories.length === 0) await gtStore.loadCategories();
      if (persons.length === 0) await gtStore.loadPersons();
    }
    if (tab === 'people' && persons.length === 0) {
      await gtStore.loadPersons();
    }
  }

  function clearTimeTravel() {
    timeTravelDate = '';
    timeTravelDocs = null;
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
    <!-- Filter bar: status filter + time-travel ("current on" a date) -->
    <div class="flex flex-wrap items-end gap-3 mb-3">
      <label class="text-xs text-slate-400">
        Status
        <select bind:value={filterStatus} disabled={!!timeTravelDate}
          class="mt-1 block bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 disabled:opacity-50">
          {#each statusFilterOptions as s}
            <option value={s}>{s === 'all' ? 'All' : (GT_STATUS_LABELS[s] ?? s)}</option>
          {/each}
        </select>
      </label>
      <label class="text-xs text-slate-400">
        Current on (time-travel)
        <input type="date" bind:value={timeTravelDate} on:change={applyTimeTravel}
          class="mt-1 block bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200" />
      </label>
      {#if timeTravelDate}
        <button type="button" class="text-xs text-purple-400 hover:text-purple-300 pb-1.5" on:click={clearTimeTravel}>
          Clear — show all
        </button>
        <span class="text-xs text-slate-500 pb-1.5">Showing documents current on {fmtDate(timeTravelDate)}</span>
      {/if}
    </div>

    {#if displayedDocs.length === 0}
      <p class="text-sm text-slate-400 py-8 text-center">
        {#if timeTravelDate}
          No documents were current on {fmtDate(timeTravelDate)}.
        {:else if documents.length === 0}
          No documents in the register yet. Use the Ingest tab to add one.
        {:else}
          No documents match this filter.
        {/if}
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
            {#each displayedDocs as doc (doc.id)}
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
        {currentDocs}
        {persons}
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
  {:else if activeTab === 'people'}
    <!-- ── Author / reviewer registry ────────────────────────────────────── -->
    {#if canEdit}
      <GtPeople {saving} />
    {:else}
      <p class="text-sm text-slate-400 py-8 text-center">You don't have permission to manage people.</p>
    {/if}
  {:else if activeTab === 'review'}
    <!-- ── Review-tick dev harness (admin) ───────────────────────────────── -->
    <div class="max-w-xl space-y-4">
      <div>
        <p class="text-sm text-slate-200 font-medium">Review tick</p>
        <p class="text-xs text-slate-500 mt-0.5">
          Read-only scan of current documents — counts how many are due-soon / overdue by band
          (90/60/30/0/+30). Writes nothing; exercises the scheduler engine before a live trigger
          or notification channel exists.
        </p>
      </div>

      <Button variant="primary" loading={reviewRunning} disabled={reviewRunning} on:click={runReviewTick}>
        Run review tick now
      </Button>

      {#if reviewError}
        <ErrorDisplay message={reviewError} onDismiss={() => (reviewError = '')} />
      {/if}

      {#if reviewSummary}
        <div class="rounded-lg border border-slate-700 p-3 text-sm space-y-2">
          <div class="flex gap-4 text-slate-200">
            <span>Checked: <strong>{reviewSummary.checked}</strong></span>
            <span>Due soon: <strong class="text-amber-400">{reviewSummary.dueSoon}</strong></span>
            <span>Overdue: <strong class="text-red-400">{reviewSummary.overdue}</strong></span>
          </div>
          <div class="flex flex-wrap gap-2">
            {#each Object.entries(reviewSummary.byBand) as [band, n]}
              <span class="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300">{band}: {n}</span>
            {/each}
          </div>
          <p class="text-xs text-slate-600">Ran at {reviewSummary.ranAt}</p>
        </div>
      {/if}
    </div>
  {/if}
  {/if}
</div>
