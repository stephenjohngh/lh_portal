<!-- src/lib/apps/complaints/ComplaintsApp.svelte -->
<!-- Complaints — BSA 2022 s.93.
     Design: docs/requirements/Complaints_App_Design.md.

     P0: staff-logged intake, the seven states, the append-only timeline, the
     case view and the open queue. That is what discharges the duty — a system
     that receives, investigates, responds and records.

     Deliberately not here yet: the two clocks with working-day maths (P1), the
     public intake and status lookup (P2), promotion to a job and the reports
     (P3). The columns those need already exist, so each is behaviour rather
     than schema. -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { complaintsStore } from './stores/complaintsStore.js';

  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import LoadingSpinner  from '$lib/components/common/LoadingSpinner.svelte';
  import ErrorDisplay    from '$lib/components/common/ErrorDisplay.svelte';
  import ComplaintList      from './components/ComplaintList.svelte';
  import ComplaintDetail    from './components/ComplaintDetail.svelte';
  import ComplaintFormModal from './components/ComplaintFormModal.svelte';

  import { isOpen, STATUS_ORDER, statusMeta } from './utils/complaintLifecycle.js';

  $: state = $complaintsStore;
  $: canEdit = $permissions.isAdmin || $permissions.canModify;

  let tab = 'open';                 // open | all
  let statusFilter = '';            // '' = every status, on the All tab
  let formOpen = false;
  let formRef;

  /**
   * The open queue: everything still somebody's problem, OLDEST FIRST.
   *
   * `responded` counts as open — the duty is not discharged until the
   * complainant has had their route onwards, so a responded complaint stays in
   * the queue rather than disappearing the moment a reply is sent.
   */
  $: openCases = state.cases
    .filter(c => isOpen(c.status))
    .slice()
    .sort((a, b) => (a.received_at ?? '').localeCompare(b.received_at ?? ''));

  $: allCases = state.cases.filter(c => !statusFilter || c.status === statusFilter);

  $: summary = (() => {
    const n = openCases.length;
    if (n === 0) return 'Nothing open';
    const unacknowledged = openCases.filter(c => !c.acknowledged_at).length;
    return unacknowledged
      ? `${n} open · ${unacknowledged} not yet acknowledged`
      : `${n} open`;
  })();

  onMount(async () => {
    await permissions.init($auth.user.id, 'complaints');
    try { await complaintsStore.load(); } catch { /* surfaced in state.error */ }
  });

  async function openCase(e) {
    try { await complaintsStore.select(e.detail); } catch { /* surfaced */ }
  }

  function back() {
    complaintsStore.select(null);
  }

  async function saveNew(e) {
    try {
      const row = await complaintsStore.create(e.detail);
      formOpen = false;
      await complaintsStore.select(row.id);
    } catch (err) {
      formRef?.fail(err instanceof Error ? err.message : String(err));
    }
  }

  async function transition(e) {
    const id = state.selected?.id;                 // captured before the await
    if (!id) return;
    try { await complaintsStore.transition(id, e.detail.to, e.detail.note); }
    catch { /* surfaced in state.error */ }
  }

  async function saveFields(e) {
    const id = state.selected?.id;
    if (!id) return;
    try { await complaintsStore.save(id, e.detail); } catch { /* surfaced */ }
  }

  async function addNote(e) {
    const id = state.selected?.id;
    if (!id) return;
    try { await complaintsStore.addNote(id, e.detail); } catch { /* surfaced */ }
  }

  async function escalationTold() {
    const id = state.selected?.id;
    if (!id) return;
    try { await complaintsStore.recordEscalationTold(id); } catch { /* surfaced */ }
  }
</script>

<div class="p-4">
  <!-- ── Header ────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3 mb-4 flex-wrap">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold text-white">Complaints</h2>
      <p class="text-xs text-slate-500 mt-0.5">{summary}</p>
    </div>

    {#if !state.selected}
      <div class="flex rounded border border-slate-600 overflow-hidden text-xs shrink-0">
        {#each [['open', 'Open'], ['all', 'All']] as [key, label]}
          <button type="button"
                  class="px-2.5 py-1 transition-colors
                         {tab === key ? 'bg-purple-600 text-white'
                                      : 'text-slate-400 hover:bg-slate-700'}"
                  on:click={() => tab = key}>{label}</button>
        {/each}
      </div>

      {#if tab === 'all'}
        <select bind:value={statusFilter} title="Filter by status"
                class="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded
                       text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
          <option value="">Every status</option>
          {#each STATUS_ORDER as s}
            <option value={s}>{statusMeta(s).label}</option>
          {/each}
        </select>
      {/if}
    {/if}

    <div class="flex-1 min-w-[1rem]"></div>

    <ProtectedButton variant="primary" size="small" on:click={() => formOpen = true}>
      + Log a complaint
    </ProtectedButton>
  </div>

  {#if state.error}
    <div class="mb-3">
      <ErrorDisplay message={state.error} onDismiss={() => complaintsStore.clearError()} />
    </div>
  {/if}

  <!-- ── Body ──────────────────────────────────────────────────────────── -->
  {#if state.loading && !state.cases.length}
    <div class="flex justify-center py-10"><LoadingSpinner /></div>

  {:else if state.selected}
    <ComplaintDetail
      complaint={state.selected}
      timeline={state.timeline}
      {canEdit}
      saving={state.saving}
      on:back={back}
      on:transition={transition}
      on:save={saveFields}
      on:note={addNote}
      on:escalationTold={escalationTold}
    />

  {:else if !state.cases.length}
    <div class="text-center py-12 text-slate-500">
      <p class="text-sm">No complaints recorded.</p>
      <p class="text-xs mt-2 max-w-md mx-auto">
        This is the s.93 system: every building-safety complaint gets a
        reference, an investigation and a written response — and so does every
        one that turns out to belong somewhere else, with the reason recorded.
      </p>
    </div>

  {:else if tab === 'open'}
    <ComplaintList cases={openCases}
                   emptyMessage="Nothing open. Everything logged has been answered or closed."
                   on:open={openCase} />
  {:else}
    <ComplaintList cases={allCases}
                   emptyMessage="Nothing matches that status."
                   on:open={openCase} />
  {/if}
</div>

<ComplaintFormModal
  bind:this={formRef}
  bind:show={formOpen}
  on:save={saveNew}
  on:close={() => formOpen = false}
/>
