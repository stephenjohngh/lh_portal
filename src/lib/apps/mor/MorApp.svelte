<!-- src/lib/apps/mor/MorApp.svelte -->
<script>
  import { onMount } from 'svelte';
  import { auth }        from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { morStore }    from '$lib/apps/mor/stores/morStore';
  import Button       from '$lib/components/common/Button.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import CaseList     from '$lib/apps/mor/components/CaseList.svelte';
  import CaseDetail   from '$lib/apps/mor/components/CaseDetail.svelte';
  import CaseForm     from '$lib/apps/mor/components/CaseForm.svelte';

  $: userId  = $auth.user?.id;

  let selectedCaseId = null;
  let showCreateForm = false;

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
  <div class="flex items-center justify-between mb-6">
    <div class="flex items-center gap-3">
      {#if selectedCaseId}
        <!-- Back is handled inside CaseDetail -->
      {:else}
        <div>
          <h1 class="text-2xl font-bold text-white">Mandatory Occurrence Reporting</h1>
          <p class="text-xs text-slate-500 mt-0.5">BSA 2022 s.87 · 10-day statutory reporting deadline</p>
        </div>
      {/if}
    </div>

    {#if !selectedCaseId}
      <Button variant="primary" size="medium" on:click={openCreate}>
        + Log Case
      </Button>
    {/if}
  </div>

  <!-- ── Global error (outside of any modal) ──────────────────────────── -->
  {#if error && !selectedCaseId && !showCreateForm}
    <div class="mb-4">
      <ErrorDisplay message={error} onDismiss={() => morStore.clearError()} />
    </div>
  {/if}

  <!-- ── Main content ─────────────────────────────────────────────────── -->
  {#if selectedCaseId}
    <CaseDetail on:back={goBack} />
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
