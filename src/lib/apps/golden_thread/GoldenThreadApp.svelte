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
  import { REVIEW_BAND_LABEL, REVIEW_BAND_BADGE } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import { reviewBand, daysToReview } from '$lib/apps/golden_thread/utils/gtReview.js';
  import { documentsCurrentOn } from '$lib/apps/golden_thread/public.js';
  import { postJson }   from '$lib/utils/request';
  import { authHeaders } from '$lib/utils/authHeaders';
  import { downloadResponse } from '$lib/utils/download';
  import Badge         from '$lib/components/common/Badge.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ErrorDisplay  from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import GtIngestForm  from '$lib/apps/golden_thread/components/GtIngestForm.svelte';
  import GtDocumentDetail from '$lib/apps/golden_thread/components/GtDocumentDetail.svelte';
  import GtPeople      from '$lib/apps/golden_thread/components/GtPeople.svelte';
  import GtAccountability from '$lib/apps/golden_thread/components/GtAccountability.svelte';
  import GtSafetyCase  from '$lib/apps/golden_thread/components/GtSafetyCase.svelte';
  import GtRisks       from '$lib/apps/golden_thread/components/GtRisks.svelte';
  import { buildSafetyCaseModel } from '$lib/apps/golden_thread/utils/gtSafetyCase.js';
  import { listCases as listMorCases } from '$lib/apps/mor/public.js';
  import { fmtDate }   from '$lib/utils/dates';

  $: userId  = $auth.user?.id;

  const todayISO = new Date().toISOString().slice(0, 10);
  // Review band for a document — only meaningful for current documents with a
  // review date; null (no badge) otherwise. Uses the pure gtReview logic.
  function docReviewBand(doc) {
    if (doc.status !== 'current' || !doc.review_due) return null;
    return reviewBand(daysToReview(doc, todayISO));
  }

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
    ['safety-case', 'Safety Case'],
    ['risks', 'Risks'],
    ...(canEdit ? [['people', 'People']] : []),
    ...(canEdit ? [['accountability', 'Accountability']] : []),
    ...(isAdmin ? [['review', 'Review']] : [])
  ];

  $: accountablePersons = $gtStore.accountablePersons;

  // Safety Case — reads register + completeness + MOR occurrences into one model
  // (the same shape as the Word export). MOR cases are loaded lazily on open.
  /** @type {any[]} */
  let morCases = [];
  let morCasesLoaded = false;
  let safetyCaseAt = '';   // frozen "generated at" for the current view/export
  $: safetyCaseModel = buildSafetyCaseModel({
    documents: documents,
    completeness,
    morCases,
    accountablePersons,
    generatedAt: safetyCaseAt || new Date().toISOString(),
  });

  let scExporting = false;
  let scExportError = '';
  async function exportSafetyCase() {
    scExporting = true;
    scExportError = '';
    try {
      const res = await fetch('/api/golden-thread/safety-case', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify(safetyCaseModel),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.error ?? msg; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      await downloadResponse(res, `golden-thread-safety-case-${new Date().toISOString().slice(0, 10)}.docx`);
    } catch (e) {
      scExportError = e instanceof Error ? e.message : String(e);
    } finally {
      scExporting = false;
    }
  }

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

  // BSR share pack — admin-only whole-register ZIP export (POST returns a zip).
  let packRunning = false;
  let packError = '';
  async function downloadSharePack() {
    packRunning = true;
    packError = '';
    try {
      const res = await fetch('/api/golden-thread/share-pack', { method: 'POST', headers: await authHeaders() });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.error ?? msg; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      await downloadResponse(res, `golden-thread-share-pack-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      packError = e instanceof Error ? e.message : String(e);
    } finally {
      packRunning = false;
    }
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

  // Stage E — tamper-evidence verification of the hash-chained gt_audit ledger.
  let verifyRunning = false;
  /** @type {any|null} */
  let verifyResult = null;
  let verifyError = '';
  async function verifyAuditChain() {
    verifyRunning = true;
    verifyError = '';
    verifyResult = null;
    try {
      verifyResult = await postJson('/api/golden-thread/verify-audit', {}, 'Verification failed');
    } catch (e) {
      verifyError = e instanceof Error ? e.message : String(e);
    } finally {
      verifyRunning = false;
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
    if (tab === 'accountability' && accountablePersons.length === 0) {
      await gtStore.loadAccountablePersons();
    }
    if (tab === 'safety-case') {
      safetyCaseAt = new Date().toISOString();   // freeze the snapshot time
      if (completeness.length === 0) await gtStore.loadCompleteness();
      if (accountablePersons.length === 0) await gtStore.loadAccountablePersons();
      if (!morCasesLoaded) {
        morCasesLoaded = true;
        try { morCases = await listMorCases(); } catch { morCases = []; }
      }
    }
    // Auto-run the read-only tick on first open so the admin sees the current
    // summary without a click; the button remains for a manual refresh.
    if (tab === 'review' && !reviewSummary && !reviewRunning) {
      await runReviewTick();
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
    {#if isAdmin}
      <div class="flex flex-col items-end gap-1">
        <Button variant="secondary" loading={packRunning} disabled={packRunning} on:click={downloadSharePack}>
          ⬇ BSR share pack
        </Button>
        {#if packError}<p class="text-xs text-red-400 max-w-xs text-right">{packError}</p>{/if}
      </div>
    {/if}
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
                <td class="px-3 py-2 text-slate-400">
                  <span class="inline-flex items-center gap-2">
                    {doc.review_due ? fmtDate(doc.review_due) : '—'}
                    {#if docReviewBand(doc)}
                      {@const band = docReviewBand(doc)}
                      <Badge color={REVIEW_BAND_BADGE[band]}>{REVIEW_BAND_LABEL[band]}</Badge>
                    {/if}
                  </span>
                </td>
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
  {:else if activeTab === 'safety-case'}
    <GtSafetyCase
      model={safetyCaseModel}
      exporting={scExporting}
      exportError={scExportError}
      on:export={exportSafetyCase}
    />

  {:else if activeTab === 'risks'}
    <!-- ── Risk register (Stage D) ───────────────────────────────────────── -->
    <GtRisks />

  {:else if activeTab === 'people'}
    <!-- ── Author / reviewer registry ────────────────────────────────────── -->
    {#if canEdit}
      <GtPeople {saving} />
    {:else}
      <p class="text-sm text-slate-400 py-8 text-center">You don't have permission to manage people.</p>
    {/if}

  {:else if activeTab === 'accountability'}
    <!-- ── AP / PAP register ─────────────────────────────────────────────── -->
    {#if canEdit}
      <GtAccountability {saving} />
    {:else}
      <p class="text-sm text-slate-400 py-8 text-center">You don't have permission to manage accountability.</p>
    {/if}
  {:else if activeTab === 'review'}
    <!-- ── Review-tick summary (admin) ───────────────────────────────────── -->
    <div class="max-w-xl space-y-4">
      <div>
        <p class="text-sm text-slate-200 font-medium">Review status</p>
        <p class="text-xs text-slate-500 mt-0.5">
          Read-only scan of current documents — how many are due-soon / overdue by band
          (≤90/60/30/overdue). The same logic drives the per-document badges in the register.
          Runs on open; use the button to refresh. Writes nothing — a live scheduled trigger /
          notification channel is a later, separately-scoped step.
        </p>
      </div>

      <Button variant="primary" loading={reviewRunning} disabled={reviewRunning} on:click={runReviewTick}>
        Refresh
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

      <!-- Stage E — audit-chain tamper-evidence verification -->
      <div class="pt-4 mt-2 border-t border-slate-700">
        <p class="text-sm text-slate-200 font-medium">Audit-chain integrity</p>
        <p class="text-xs text-slate-500 mt-0.5 mb-2">
          Recomputes the hash chain over the immutable <span class="font-mono">gt_audit</span> ledger and
          confirms no historical record has been altered — the tamper-evidence behind the golden thread.
        </p>
        <Button variant="secondary" loading={verifyRunning} disabled={verifyRunning} on:click={verifyAuditChain}>
          Verify audit chain
        </Button>
        {#if verifyError}<ErrorDisplay message={verifyError} onDismiss={() => (verifyError = '')} />{/if}
        {#if verifyResult}
          <div class="mt-2 rounded-lg border p-3 text-sm
                      {verifyResult.ok ? 'border-green-800 bg-green-900/20 text-green-300' : 'border-red-800 bg-red-900/20 text-red-300'}">
            {#if verifyResult.ok}
              ✓ Chain intact — {verifyResult.checked} audit entr{verifyResult.checked === 1 ? 'y' : 'ies'} verified.
            {:else}
              ✗ Chain broken at seq <strong>{verifyResult.first_broken_seq}</strong> (after {verifyResult.checked} verified) — {verifyResult.reason}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
  {/if}
</div>
