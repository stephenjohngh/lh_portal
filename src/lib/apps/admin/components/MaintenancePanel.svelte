<!-- src/lib/apps/admin/components/MaintenancePanel.svelte -->
<!-- Sub-panel below the 4 columns: the statutory obligations scoped to the
     selected component Type.

     These are NOT Building Assets' data any more. maintenance_regime — a
     per-type "task + frequency" rule this panel used to own through
     buildingAssetsStore — was retired when its definitions moved into the
     shared statutory-obligation library (see
     docs/requirements/build_plans/Obligation_Library_Promotion_Build_Plan.md). This panel
     is now a SHORTCUT onto that library, never a rival definition source: a
     quick add for the common "one obligation, one type" case, with the full
     editor (scope builder, statutory detail, rotation) in Compliance → Planned obligations.

     An obligation covering more than this type is shown read-only, because
     editing a multi-type rule from a single type's panel is a footgun — you
     would be changing something for types you cannot see from here. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { createEventDispatcher, onMount } from 'svelte';
  // ⛔ THROUGH THE OWNING APP'S public.js, not its store. `statutory_obligations`
  // belongs to the Compliance app now; an app must not write another app's data
  // (the rule that declined G4). The store is imported for READING only — the
  // writes go through the named operations.
  import {
    plannedObligations,
    createPlannedObligation, updatePlannedObligation, deletePlannedObligation,
    ensurePlannedObligationsLoaded,
  } from '#lib/apps/compliance/public.js';
  import { isWalkEvidenced, isJobEvidenced } from '#lib/utils/obligationEvidence.js';
  import { obligationsForType, scopedToTypeOnly, typeCount } from '../utils/typeScopedObligations.js';
  import { frequencyLabel } from '#lib/utils/inspectionSchedule.js';
  import { inp } from '#lib/apps/building_assets/ui.js';
  import ConfirmDialog from '#lib/components/common/ConfirmDialog.svelte';

  export let typeCode = '';
  export let typeName = '';

  const dispatch = createEventDispatcher();

  onMount(() => {
    if ($plannedObligations.definitions.length === 0) ensurePlannedObligationsLoaded();
  });

  // Obligations whose scope names this type. One covering several types shows
  // up under each of them — correct, and useful: this is "what is this type
  // obliged to have done", not "what did someone create from this screen".
  $: rows = obligationsForType($plannedObligations.definitions, typeCode)
    .map(d => ({
      ...d,
      typeCount:    typeCount(d),
      // Editable here only when this type is the whole of its scope — see
      // typeScopedObligations for why that guard matters.
      editableHere: scopedToTypeOnly(d, typeCode),
      routeLabel: !isWalkEvidenced(d) ? 'Contractor job' : (isJobEvidenced(d) ? 'Either route' : 'Inspection walk'),
    }));

  let editingId = null;
  let form      = {};
  let saving    = false;
  let deletingId    = null;
  let pendingDelete = null;
  let error     = '';

  function startEdit(row) {
    editingId = row.id;
    form = { name: row.name, frequency_days: row.frequency_days, evidenced_by: row.evidenced_by ?? 'inspection' };
    error = '';
  }

  function startNew() {
    editingId = 'new';
    // Defaults to the contractor route: this panel replaced the maintenance
    // regime, so that is what someone reaching for it is nearly always adding.
    form  = { name: '', frequency_days: 365, evidenced_by: 'maintenance_job' };
    error = '';
  }

  function cancel() { editingId = null; form = {}; error = ''; }

  async function save() {
    if (!form.name?.trim())       { error = 'Name is required'; return; }
    if (!form.frequency_days || form.frequency_days < 1) {
      error = 'Frequency must be a positive number of days'; return;
    }
    saving = true; error = '';
    try {
      if (editingId === 'new') {
        await createPlannedObligation({
          ...form,
          // The whole point of the shortcut: scope is this one type.
          scope: { typeCodes: [typeCode] },
        });
      } else {
        const row = rows.find(r => r.id === editingId);
        // Scope is deliberately NOT sent: this panel never rewrites the scope of
        // an existing obligation, only its name, cadence and route.
        await updatePlannedObligation(editingId, { ...row, ...form });
      }
      dispatch('saved');
      editingId = null;
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function requestDelete(row) { pendingDelete = row; }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    deletingId = id;
    try {
      await deletePlannedObligation(id);
      dispatch('saved');
    } catch (/** @type {any} */ err) {
      error = err.message;
    } finally {
      deletingId = null; pendingDelete = null;
    }
  }
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800/30 overflow-hidden">

  <!-- Header -->
  <div class="px-4 py-3 border-b border-slate-700 bg-slate-800/60 flex items-center justify-between">
    <div>
      <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Statutory obligations
        <span class="font-normal normal-case text-slate-600">— {typeName}</span>
      </p>
      <p class="text-xs text-slate-600 mt-0.5">
        What this type is obliged to have done, from the shared obligation library.
        This is a shortcut for the simple case — choosing what it covers, statutory detail
        and rotation live in <span class="text-slate-500">Compliance → Planned obligations</span>.
      </p>
    </div>
    {#if editingId !== 'new'}
      <Button variant="primary" size="xs" on:click={startNew}>+ Add obligation</Button>
    {/if}
  </div>

  {#if error}
    <div class="mx-4 mt-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
      {error}
      <Button variant="tertiary" size="xs" on:click={() => error = ''}>dismiss</Button>
    </div>
  {/if}

  <!-- New obligation form -->
  {#if editingId === 'new'}
    <div class="p-4 border-b border-slate-700 bg-slate-700/30">
      <p class="text-xs font-semibold text-green-400 mb-3">New obligation for {typeName}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div class="sm:col-span-2">
          <p class="text-xs text-slate-400 block mb-1">Name *</p>
          <input bind:value={form.name} class={inp} placeholder="e.g. Annual fire door inspection" />
        </div>
        <div>
          <p class="text-xs text-slate-400 block mb-1">
            Frequency (days) *
            {#if form.frequency_days}
              <span class="text-slate-500 font-normal">≈ {frequencyLabel(form.frequency_days)}</span>
            {/if}
          </p>
          <input type="number" min="1" bind:value={form.frequency_days} class={inp} placeholder="365" />
        </div>
        <div class="sm:col-span-3">
          <p class="text-xs text-slate-400 block mb-1">
            How is this discharged?
            <span class="text-slate-600 font-normal">
              — a contractor job is scheduled in Maintenance; an inspection walk appears in the mobile app
            </span>
          </p>
          <select bind:value={form.evidenced_by} class="{inp} cursor-pointer max-w-xs">
            <option value="maintenance_job">Contractor job</option>
            <option value="inspection">Inspection walk</option>
            <option value="either">Either route</option>
          </select>
        </div>
      </div>
      <div class="flex gap-2 mt-3">
        <Button variant="green" size="xs" disabled={saving} on:click={save}>{saving ? 'Creating…' : 'Create obligation'}</Button>
        <Button variant="tertiary" size="xs" on:click={cancel}>Cancel</Button>
      </div>
    </div>
  {/if}

  <!-- Obligation rows -->
  {#if rows.length === 0 && editingId !== 'new'}
    <p class="px-4 py-4 text-xs text-slate-600 italic">
      No planned obligations cover this type.
    </p>
  {:else}
    <div class="divide-y divide-slate-700/50">
      {#each rows as row (row.id)}

        {#if editingId === row.id}
          <!-- -- Inline edit form -------------------------------- -->
          <div class="p-4 bg-slate-700/30">
            <p class="text-xs font-semibold text-purple-400 mb-3">Edit obligation</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="sm:col-span-2">
                <p class="text-xs text-slate-400 block mb-1">Name *</p>
                <input bind:value={form.name} class={inp} />
              </div>
              <div>
                <p class="text-xs text-slate-400 block mb-1">
                  Frequency (days) *
                  {#if form.frequency_days}
                    <span class="text-slate-500 font-normal">≈ {frequencyLabel(form.frequency_days)}</span>
                  {/if}
                </p>
                <input type="number" min="1" bind:value={form.frequency_days} class={inp} />
              </div>
              <div class="sm:col-span-3">
                <p class="text-xs text-slate-400 block mb-1">How is this discharged?</p>
                <select bind:value={form.evidenced_by} class="{inp} cursor-pointer max-w-xs">
                  <option value="maintenance_job">Contractor job</option>
                  <option value="inspection">Inspection walk</option>
                  <option value="either">Either route</option>
                </select>
              </div>
            </div>
            <div class="flex gap-2 mt-3">
              <Button variant="primary" size="xs" disabled={saving} on:click={save}>{saving ? 'Saving…' : 'Save'}</Button>
              <Button variant="tertiary" size="xs" on:click={cancel}>Cancel</Button>
            </div>
          </div>

        {:else}
          <!-- -- Read row ---------------------------------------- -->
          <div class="px-4 py-2.5 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm text-slate-200">{row.name}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{row.routeLabel}</span>
                {#if !row.active}
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-500">Inactive</span>
                {/if}
              </div>
              <p class="text-xs text-slate-500 mt-0.5">
                {frequencyLabel(row.frequency_days)}
                {#if !row.editableHere}
                  · <span class="text-amber-500/80">covers {row.typeCount} types — edit in Compliance → Planned obligations</span>
                {/if}
              </p>
            </div>
            {#if row.editableHere}
              <div class="flex gap-1.5 shrink-0">
                <Button variant="tertiary" size="xs" on:click={() => startEdit(row)}>Edit</Button>
                <Button variant="danger" size="xs" disabled={deletingId === row.id} on:click={() => requestDelete(row)}>Delete</Button>
              </div>
            {/if}
          </div>
        {/if}

      {/each}
    </div>
  {/if}
</div>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete obligation"
  message={pendingDelete
    ? `Delete “${pendingDelete.name}”? Any maintenance jobs or inspections already recorded against it are kept — they just stop pointing at a definition.`
    : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => (pendingDelete = null)}
/>
