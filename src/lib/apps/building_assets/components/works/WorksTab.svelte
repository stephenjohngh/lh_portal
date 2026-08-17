<!-- src/lib/apps/building_assets/components/works/WorksTab.svelte -->
<!-- Works schedules: a named list of components and what should be done to each.
     What the portal was missing — it recorded what an asset IS and what was
     FOUND, but never what we INTEND.

     Two views in one tab: the list of schedules, and one schedule's lines. -->
<script>
  import { onMount } from 'svelte';
  import { auth }         from '$lib/stores/auth';
  import { permissions }  from '$lib/stores/permissions';
  import Button           from '$lib/components/common/Button.svelte';
  import ProtectedButton  from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay     from '$lib/components/common/ErrorDisplay.svelte';
  import ConfirmDialog    from '$lib/components/common/ConfirmDialog.svelte';
  import LoadingSpinner   from '$lib/components/common/LoadingSpinner.svelte';
  import Badge            from '$lib/components/common/Badge.svelte';
  import { fmtDate }      from '$lib/utils/dates';
  import { downloadResponse } from '$lib/utils/download';
  import { authHeaders }  from '$lib/utils/authHeaders';

  import { buildingAssetsStore } from '../../stores/buildingAssetsStore.js';
  import { worksSchedulesStore } from '../../stores/worksSchedulesStore.js';
  import {
    WORKS_ACTIONS, actionLabel, describeSummary, appliedProgress,
    statusLabel, purposeLabel,
  } from '../../utils/worksSchedule.js';
  import WorksScheduleFormModal from './WorksScheduleFormModal.svelte';
  import ApplyScheduleDialog    from './ApplyScheduleDialog.svelte';

  const errMessage = (e) => (e instanceof Error ? e.message : String(e));

  let error = '';
  let openId = null;
  let showForm = false;
  let editing = null;
  let formRef;

  $: state     = $worksSchedulesStore;
  $: schedules = state.schedules;
  $: items     = state.items;
  $: openSchedule = openId ? (schedules.find(s => s.id === openId) ?? null) : null;
  $: canEdit   = $permissions.isAdmin;

  // Type codes for the "replace with" picker, and attribute labels so the apply
  // preview reads "Wattage → 15" rather than a uuid.
  //
  // `attrDefs` is a MAP keyed by component_type_id, not an array — it holds each
  // type's effective attributes (its own plus those inherited from its system).
  $: types    = $buildingAssetsStore.types ?? [];
  $: attrDefs = $buildingAssetsStore.attrDefs ?? {};
  $: attrLabels = Object.fromEntries(
    Object.values(attrDefs).flat().map(a => [a.id, a.name ?? 'Attribute']));

  /**
   * Attributes of the type a line is being replaced WITH — not the one coming
   * out. The wattage being specified belongs to the new fitting.
   */
  const attrsForType = (typeCode) =>
    attrDefs[types.find(t => t.type_code === typeCode)?.id] ?? [];

  onMount(async () => {
    try { await worksSchedulesStore.loadSchedules(); }
    catch (err) { error = errMessage(err); }
  });

  const STATUS_BADGE = {
    draft: 'bg-slate-600', issued: 'bg-blue-600',
    completed: 'bg-green-600', cancelled: 'bg-slate-700',
  };

  async function open(schedule) {
    const id = schedule.id;                 // capture before the await
    openId = id;
    try { await worksSchedulesStore.loadItems(id); }
    catch (err) { error = errMessage(err); }
  }

  function back() { openId = null; worksSchedulesStore.closeSchedule(); }

  // ── Header CRUD ───────────────────────────────────────────────────────────

  function newSchedule()  { editing = null; showForm = true; }
  function editSchedule() { editing = openSchedule; showForm = true; }

  async function handleSave(e) {
    const target = editing;                 // capture before the await
    const data = e.detail;
    const userId = $auth.user.id;
    try {
      if (target) await worksSchedulesStore.updateSchedule(target.id, {
        title: data.title, reference: data.reference, purpose: data.purpose,
        contractor_name: data.contractor_name, notes: data.notes,
      }, userId);
      else {
        const created = await worksSchedulesStore.createSchedule(data, [], userId);
        await open(created);
      }
      formRef?.done();
    } catch (err) { formRef?.fail(errMessage(err)); }
  }

  let pendingDelete = null;
  let deleting = false;

  async function confirmDelete() {
    const { id, title } = pendingDelete;
    deleting = true;
    try {
      await worksSchedulesStore.deleteSchedule(id, title);
      if (openId === id) back();
      pendingDelete = null;
    } catch (err) { error = errMessage(err); }
    finally { deleting = false; }
  }

  // ── Lines ─────────────────────────────────────────────────────────────────

  async function setLine(item, fields) {
    try { await worksSchedulesStore.updateItem(item.id, fields, $auth.user.id); }
    catch (err) { error = errMessage(err); }
  }

  async function setAllActions(action) {
    try { await worksSchedulesStore.setActionForAll(openId, action, $auth.user.id); }
    catch (err) { error = errMessage(err); }
  }

  async function removeLine(item) {
    try { await worksSchedulesStore.removeItem(item.id); }
    catch (err) { error = errMessage(err); }
  }

  /** One attribute value on a line, merged into whatever it already carries. */
  async function setLineAttribute(item, attrId, value) {
    const next = { ...(item.target_attributes ?? {}) };
    if (value === '' || value === null) delete next[attrId];
    else next[attrId] = value;
    await setLine(item, { target_attributes: Object.keys(next).length ? next : null });
  }

  // ── Issue / export / apply ────────────────────────────────────────────────

  let issuing = false;

  async function issue() {
    issuing = true;
    try { await worksSchedulesStore.issueSchedule(openId, $auth.user.id); }
    catch (err) { error = errMessage(err); }
    finally { issuing = false; }
  }

  let exporting = false;

  async function exportDocument() {
    exporting = true;
    try {
      const res = await fetch('/api/reports/generate-works-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          schedule: openSchedule,
          items: items.map(i => ({
            ...i,
            attribute_labels: Object.fromEntries(
              Object.entries(i.target_attributes ?? {})
                .map(([id, v]) => [attrLabels[id] ?? 'Attribute', v])),
          })),
          floors: $buildingAssetsStore.floors ?? [],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Export failed');
      await downloadResponse(res, `${openSchedule.title || 'works-schedule'}.docx`);
    } catch (err) { error = errMessage(err); }
    finally { exporting = false; }
  }

  let showApply = false;
  let applyPlan = null;
  let applying = false;
  let applyRef;
  let applyNotice = '';

  function openApply() {
    applyPlan = worksSchedulesStore.previewApply($auth.user.id);
    applyNotice = '';
    showApply = true;
  }

  async function doApply() {
    applying = true;
    try {
      const { applied, failed } = await worksSchedulesStore.applyChanges(
        applyPlan.changes, $auth.user.id);

      await worksSchedulesStore.loadItems(openId);
      // Reload the asset records this just changed, so the rest of the app is
      // not showing what they used to say.
      await buildingAssetsStore.loadComponents();

      showApply = false;
      applyNotice = failed.length
        ? `${applied} asset${applied === 1 ? '' : 's'} updated; ${failed.length} could not be — ${failed[0].error}`
        : `${applied} asset${applied === 1 ? '' : 's'} updated.`;

      const progress = appliedProgress($worksSchedulesStore.items);
      if (progress.complete) {
        await worksSchedulesStore.completeSchedule(openId, $auth.user.id);
      }
    } catch (err) { applyRef?.fail(errMessage(err)); }
    finally { applying = false; }
  }

  $: progress = appliedProgress(items);
</script>

{#if error}
  <div class="mb-3"><ErrorDisplay message={error} onDismiss={() => error = ''} /></div>
{/if}

{#if !openSchedule}
  <!-- ── The list ────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3 mb-4">
    <div>
      <h2 class="text-sm font-semibold text-white">Works schedules</h2>
      <p class="text-xs text-slate-500 mt-0.5">
        What we want a contractor to do — priced, instructed, then applied back
        to the asset records.
      </p>
    </div>
    <div class="flex-1"></div>
    <ProtectedButton requireAdmin={true} variant="primary" size="small"
                     on:click={newSchedule}>
      + New schedule
    </ProtectedButton>
  </div>

  {#if state.loading}
    <div class="flex justify-center py-10"><LoadingSpinner /></div>
  {:else if schedules.length === 0}
    <div class="text-center py-12 text-slate-500">
      <p class="text-sm">No works schedules yet.</p>
      <p class="text-xs mt-2 max-w-md mx-auto">
        Filter the <span class="text-slate-400">Components</span> tab to what
        needs doing — failed items, or a type due for replacement — and use
        <span class="text-slate-400">Works schedule</span> there to start one
        from that list.
      </p>
    </div>
  {:else}
    <div class="space-y-2">
      {#each schedules as schedule (schedule.id)}
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <div
          class="flex items-start gap-3 p-3 rounded-lg border border-slate-700
                 bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
          on:click={() => open(schedule)}
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm text-white truncate">{schedule.title}</p>
            <p class="text-xs text-slate-500 mt-0.5">
              {purposeLabel(schedule.purpose)}
              {#if schedule.reference}· {schedule.reference}{/if}
              {#if schedule.contractor_name}· {schedule.contractor_name}{/if}
              · created {fmtDate(schedule.created_at)}
            </p>
          </div>
          <Badge color={STATUS_BADGE[schedule.status] ?? 'bg-slate-600'}>
            {statusLabel(schedule.status)}
          </Badge>
        </div>
      {/each}
    </div>
  {/if}

{:else}
  <!-- ── One schedule ───────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3 mb-4">
    <Button variant="secondary" size="small" on:click={back}>← Schedules</Button>
    <div class="min-w-0">
      <p class="text-sm font-semibold text-white truncate">{openSchedule.title}</p>
      <p class="text-xs text-slate-500">
        {purposeLabel(openSchedule.purpose)} · {describeSummary(items)}
        {#if progress.done}· {progress.done} of {progress.total} carried out{/if}
      </p>
    </div>
    <div class="flex-1"></div>

    <Badge color={STATUS_BADGE[openSchedule.status] ?? 'bg-slate-600'}>
      {statusLabel(openSchedule.status)}
    </Badge>

    {#if canEdit}
      <Button variant="secondary" size="small" on:click={editSchedule}>Edit</Button>
    {/if}
    <Button variant="secondary" size="small" disabled={exporting || !items.length}
            title="Word document to send to the contractor"
            on:click={exportDocument}>
      {exporting ? 'Building…' : 'Document'}
    </Button>
    {#if canEdit && openSchedule.status === 'draft'}
      <Button variant="secondary" size="small" disabled={issuing} on:click={issue}>
        {issuing ? 'Marking…' : 'Mark issued'}
      </Button>
    {/if}
    {#if canEdit && items.length}
      <Button variant="primary" size="small" on:click={openApply}>
        Carried out…
      </Button>
    {/if}
  </div>

  {#if applyNotice}
    <div class="mb-3 p-3 rounded border border-green-500/40 bg-green-500/10
                flex items-start gap-2">
      <p class="text-xs text-green-200 flex-1">{applyNotice}</p>
      <button class="text-xs text-green-200/70 hover:text-green-100"
              on:click={() => applyNotice = ''}>Dismiss</button>
    </div>
  {/if}

  {#if canEdit && items.length}
    <div class="flex items-center gap-2 mb-3 text-xs text-slate-500">
      <span>Set every line to:</span>
      {#each WORKS_ACTIONS as a}
        <button class="px-2 py-0.5 rounded border border-slate-700
                       hover:border-slate-500 hover:text-slate-200 transition-colors"
                on:click={() => setAllActions(a.value)}>{a.label}</button>
      {/each}
    </div>
  {/if}

  {#if state.loadingItems}
    <div class="flex justify-center py-10"><LoadingSpinner /></div>
  {:else if items.length === 0}
    <p class="text-sm text-slate-500 py-8 text-center">
      No components on this schedule. Add them from the Components tab.
    </p>
  {:else}
    <div class="border border-slate-700 rounded overflow-x-auto">
      <table class="w-full text-xs min-w-[52rem]">
        <thead class="bg-slate-800 text-slate-400 text-left">
          <tr>
            <th class="px-3 py-2 font-medium">Asset</th>
            <th class="px-3 py-2 font-medium">Now</th>
            <th class="px-3 py-2 font-medium w-28">Action</th>
            <th class="px-3 py-2 font-medium w-36">Replace with</th>
            <th class="px-3 py-2 font-medium">Specification / notes</th>
            <th class="px-3 py-2 font-medium w-20">Done</th>
            {#if canEdit}<th class="px-2 py-2 w-8"></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each items as item (item.id)}
            <tr class="border-t border-slate-700/50 {item.applied_at ? 'opacity-60' : ''}">
              <td class="px-3 py-1.5 text-slate-200">
                {item.component?.asset_id || item.component?.label || '—'}
              </td>
              <td class="px-3 py-1.5 text-slate-500">
                {item.component?.type_code ?? '—'} · {item.component?.status ?? '—'}
              </td>
              <td class="px-3 py-1.5">
                {#if canEdit && !item.applied_at}
                  <select
                    class="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5
                           text-xs text-slate-200"
                    value={item.action}
                    on:change={(e) => setLine(item, { action: e.currentTarget.value })}
                  >
                    {#each WORKS_ACTIONS as a}
                      <option value={a.value}>{a.label}</option>
                    {/each}
                  </select>
                {:else}
                  {actionLabel(item.action)}
                {/if}
              </td>
              <td class="px-3 py-1.5">
                {#if canEdit && !item.applied_at}
                  <select
                    class="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5
                           text-xs text-slate-200"
                    value={item.target_type_code ?? ''}
                    on:change={(e) => setLine(item, { target_type_code: e.currentTarget.value || null })}
                  >
                    <option value="">—</option>
                    {#each types as t}
                      <option value={t.type_code}>{t.type_code}</option>
                    {/each}
                  </select>
                {:else}
                  {item.target_type_code ?? '—'}
                {/if}
              </td>
              <td class="px-3 py-1.5">
                {#if canEdit && !item.applied_at}
                  <input
                    class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5
                           text-xs text-slate-200"
                    placeholder="e.g. LED panel, 4000K, 3h emergency"
                    value={item.spec ?? ''}
                    on:change={(e) => setLine(item, { spec: e.currentTarget.value || null })}
                  />
                  <!-- Attributes of the type being fitted, not the one coming
                       out: the wattage you are specifying belongs to the new
                       fitting. -->
                  {#if item.target_type_code}
                    {@const defs = attrsForType(item.target_type_code)}
                    {#if defs.length}
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each defs as def}
                          <label class="flex items-center gap-1 text-[10px] text-slate-500">
                            {def.name}
                            <input
                              class="w-16 bg-slate-900 border border-slate-700 rounded px-1
                                     text-[10px] text-slate-200"
                              value={item.target_attributes?.[def.id] ?? ''}
                              on:change={(e) => setLineAttribute(item, def.id, e.currentTarget.value)}
                            />
                          </label>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                {:else}
                  <span class="text-slate-400">{item.spec ?? '—'}</span>
                {/if}
              </td>
              <td class="px-3 py-1.5 text-slate-500">
                {item.applied_at ? fmtDate(item.applied_at) : '—'}
              </td>
              {#if canEdit}
                <td class="px-2 py-1.5">
                  {#if !item.applied_at}
                    <button class="text-slate-600 hover:text-red-400 transition-colors"
                            title="Remove this line" on:click={() => removeLine(item)}>×</button>
                  {/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if canEdit}
      <div class="mt-3">
        <ProtectedButton requireAdmin={true} variant="danger" size="small"
                         on:click={() => pendingDelete = openSchedule}>
          Delete schedule
        </ProtectedButton>
      </div>
    {/if}
  {/if}
{/if}

<WorksScheduleFormModal
  bind:this={formRef}
  bind:show={showForm}
  schedule={editing}
  on:save={handleSave}
  on:close={() => { showForm = false; editing = null; }}
/>

<ApplyScheduleDialog
  bind:this={applyRef}
  bind:show={showApply}
  plan={applyPlan}
  {attrLabels}
  {applying}
  on:apply={doApply}
  on:close={() => showApply = false}
/>

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={deleting}
  title="Delete schedule?"
  message={pendingDelete
    ? `"${pendingDelete.title}" and all its lines will be deleted. Asset records already updated by it are NOT reverted.`
    : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => pendingDelete = null}
/>
