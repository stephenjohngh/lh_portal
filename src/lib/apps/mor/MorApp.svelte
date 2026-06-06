<!-- src/lib/apps/mor/MorApp.svelte -->
<script>
  import { onMount } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { morStore }    from '$lib/apps/mor/stores/morStore';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import CaseList      from '$lib/apps/mor/components/CaseList.svelte';
  import CaseDetail    from '$lib/apps/mor/components/CaseDetail.svelte';
  import CaseForm      from '$lib/apps/mor/components/CaseForm.svelte';
  import MorDashboard  from '$lib/apps/mor/components/MorDashboard.svelte';

  $: userId  = $auth.user?.id;

  let selectedCaseId = null;
  let showCreateForm = false;
  let activeTab      = 'cases'; // 'cases' | 'dashboard'

  $: cases   = $morStore.cases;
  $: loading = $morStore.loading;
  $: saving  = $morStore.saving;
  $: error   = $morStore.error;

  onMount(async () => {
    if (userId) {
      await permissions.init(userId, 'mor');
      await morStore.fetchCases();
    }
  });

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

    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-slate-700 mb-5">
      {#each [['cases','Cases'],['dashboard','Dashboard']] as [tab, label]}
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors
                 {activeTab === tab
                   ? 'border-purple-500 text-white'
                   : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500'}"
          on:click={() => activeTab = tab}
        >{label}</button>
      {/each}
    </div>
  {/if}

  <!-- ── Global error ──────────────────────────────────────────────────── -->
  {#if error && !selectedCaseId && !showCreateForm}
    <div class="mb-4">
      <ErrorDisplay message={error} onDismiss={() => morStore.clearError()} />
    </div>
  {/if}

  <!-- ── Main content ─────────────────────────────────────────────────── -->
  {#if selectedCaseId}
    <CaseDetail on:back={goBack} />
  {:else if activeTab === 'dashboard'}
    <MorDashboard on:selectCase={e => selectCase(e.detail)} />
  {:else}
    <CaseList {cases} {loading} on:select={e => selectCase(e.detail)} />
  {/if}
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
