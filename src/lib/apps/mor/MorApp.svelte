<!-- src/lib/apps/mor/MorApp.svelte -->
<script>
  import { morStore }    from '$lib/apps/mor/stores/morStore';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import AppGate      from '$lib/components/common/AppGate.svelte';
  import TabBar       from '$lib/components/common/TabBar.svelte';
  import CaseList      from '$lib/apps/mor/components/CaseList.svelte';
  import CaseDetail    from '$lib/apps/mor/components/CaseDetail.svelte';
  import CaseForm      from '$lib/apps/mor/components/CaseForm.svelte';
  import MorDashboard  from '$lib/apps/mor/components/MorDashboard.svelte';

  let selectedCaseId = null;
  let showCreateForm = false;
  let activeTab      = 'cases'; // 'cases' | 'dashboard'

  $: cases   = $morStore.cases;
  $: loading = $morStore.loading;
  $: saving  = $morStore.saving;
  $: error   = $morStore.error;

  // Nothing reads as empty until the first load has finished (AppGate): before
  // it "No cases match the current filters" would be untrue.
  const loadCases = () => morStore.fetchCases();
  const TABS = [
    { key: 'cases',     label: 'Cases' },
    { key: 'dashboard', label: 'Dashboard' },
  ];

  async function selectCase(c) {
    selectedCaseId = c.id;
    activeTab = 'cases';
    await morStore.fetchCase(c.id);
  }

  function goBack() {
    selectedCaseId = null;
    morStore.clearSelected();
  }

  async function handleCreate({ detail }) {
    const r = await morStore.createCase(detail);
    if (r.success) {
      showCreateForm = false;
      // Navigate directly to the new case
      if (r.case) {
        selectedCaseId = r.case.id;
        await morStore.fetchCase(r.case.id);
      }
    }
  }

  function openCreate() {
    morStore.clearError();
    showCreateForm = true;
  }
</script>

<div>
  <!-- ── App header ──────────────────────────────────────────────────────── -->
  {#if !selectedCaseId}
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 class="text-2xl font-bold text-white">Mandatory Occurrence Reporting</h1>
        <p class="text-xs text-slate-500 mt-0.5">BSA 2022 s.87 · 10-day statutory reporting deadline</p>
      </div>
      <Button variant="primary" size="medium" on:click={openCreate}>
        + Log Case
      </Button>
    </div>

    <div class="mb-5">
      <TabBar tabs={TABS} active={activeTab} on:select={(e) => activeTab = e.detail} />
    </div>
  {/if}

  <!-- ── Global error ──────────────────────────────────────────────────── -->
  {#if error && !selectedCaseId && !showCreateForm}
    <div class="mb-4">
      <ErrorDisplay message={error} onDismiss={() => morStore.clearError()} />
    </div>
  {/if}

  <!-- ── Main content ─────────────────────────────────────────────────── -->
  <AppGate appId="mor" name="MOR" load={loadCases} loadingText="Loading cases…">
    {#if selectedCaseId}
      <CaseDetail on:back={goBack} />
    {:else if activeTab === 'dashboard'}
      <MorDashboard on:selectCase={e => selectCase(e.detail)} />
    {:else}
      <CaseList {cases} {loading} on:select={e => selectCase(e.detail)} />
    {/if}
  </AppGate>
</div>

<!-- ── Create modal ──────────────────────────────────────────────────── -->
<CaseForm
  show={showCreateForm}
  {saving}
  error={showCreateForm ? error : ''}
  on:submit={handleCreate}
  on:close={() => { showCreateForm = false; morStore.clearError(); }}
  on:clearError={() => morStore.clearError()}
/>
