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
  import { buildComponentRef } from '$lib/utils/componentRef.js';
  import { downloadResponse } from '$lib/utils/download';
  import { authHeaders }  from '$lib/utils/authHeaders';

  import { buildingAssetsStore } from '../../stores/buildingAssetsStore.js';
  import { worksSchedulesStore } from '../../stores/worksSchedulesStore.js';
  import {
    WORKS_ACTIONS, actionLabel, describeSummary, appliedProgress,
    statusLabel, purposeLabel,
  } from '../../utils/worksSchedule.js';
  import { attrPair, attrPairsText, componentAttrPairs } from '../../utils/attrDisplay.js';
  import WorksScheduleFormModal from './WorksScheduleFormModal.svelte';
  import ApplyScheduleDialog    from './ApplyScheduleDialog.svelte';
  import WorksLineModal         from './WorksLineModal.svelte';
  import ComponentPlanPeek      from '../ComponentPlanPeek.svelte';

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
  $: floors   = $buildingAssetsStore.floors ?? [];
  $: attrDefs = $buildingAssetsStore.attrDefs ?? {};
  $: attrOptions = $buildingAssetsStore.attrOptions ?? {};
  $: plans    = $buildingAssetsStore.plans ?? [];
  $: attrLabels = Object.fromEntries(
    Object.values(attrDefs).flat().map(a => [a.id, a.name ?? 'Attribute']));

  // component_types are keyed by `code`, and carry a human name — "LED Batten",
  // not "light_led_batten". The code is the machine's handle; nobody reading a
  // schedule should have to.
  const typeName = (code) =>
    types.find(t => t.code === code)?.name ?? code ?? '—';

  /** "G/FD/FD-042" — the portal's canonical asset reference. */
  const refFor = (component) =>
    component ? buildComponentRef(component, floors, types) : '—';

  /** Visible, non-condition attribute defs for a type code. */
  const defsFor = (code) => {
    const t = types.find(x => x.code === code);
    return t ? (attrDefs[t.id] ?? []).filter(d => d.visible !== false && !d.checkable) : [];
  };

  /** What an asset records now, in the Components table's own words. */
  function currentAttrText(item) {
    const values = state.attributes[item.component_id] ?? {};
    return attrPairsText(
      componentAttrPairs(defsFor(item.component?.type_code), values));
  }

  /** What the line specifies for the replacement, in the same words. */
  function targetAttrText(item) {
    const target = item.target_attributes ?? {};
    if (!Object.keys(target).length) return '';
    const defs = defsFor(item.target_type_code || item.component?.type_code);
    return attrPairsText(
      Object.entries(target)
        .map(([id, value]) => attrPair(defs.find(d => d.id === id) ?? { name: attrLabels[id] ?? 'Attribute' }, value))
        .filter(Boolean));
  }

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

  // Removing a line is asked about, like every other destructive action in the
  // portal. It is a small loss — one line — but a schedule is worked through
  // row by row with the mouse, and the × sits next to the row you click to
  // EDIT, which is exactly the arrangement that produces an accidental one.
  let pendingLineDelete = null;
  let removingLine = false;

  async function confirmRemoveLine() {
    const item = pendingLineDelete;
    removingLine = true;
    try {
      await worksSchedulesStore.removeItem(item.id);
      pendingLineDelete = null;
    } catch (err) { error = errMessage(err); }
    finally { removingLine = false; }
  }

  // ── The line editor ───────────────────────────────────────────────────────
  // Replacement attributes were inline inputs in the table first and were
  // wrong: no room for an attribute's name, and no way to render a dropdown as
  // a dropdown. Specifying a replacement is a considered act on one asset.
  let editingLine = null;
  let showLine = false;

  function editLine(item) { editingLine = item; showLine = true; }

  // "Where is that one?" — the same question the Inspection app answers mid-walk.
  // Deciding whether to replace or remove a fitting often depends on where it
  // is, and having to leave the schedule for Plan View to find out loses your
  // place in the list.
  let peekComponent = null;
  let showPeek = false;

  function peekAt(item) { peekComponent = item.component; showPeek = true; }

  async function handleLineSave(e) {
    const target = editingLine;             // capture before the await
    try {
      await setLine(target, e.detail);
      showLine = false;
      editingLine = null;
    } catch (err) { error = errMessage(err); }
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
        // Resolved here rather than on the server: the names live in the
        // store the author is looking at, and a contractor's document must
        // never say "light_led_batten" where a person would say "LED Batten".
        body: JSON.stringify({
          schedule: openSchedule,
          items: items.map(i => ({
            ...i,
            ref:              refFor(i.component),
            current_type:     typeName(i.component?.type_code),
            current_attrs:    currentAttrText(i),
            target_type_name: i.target_type_code ? typeName(i.target_type_code) : '',
            target_attrs:     targetAttrText(i),
          })),
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
  <div class="flex items-start gap-3 mb-4">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-semibold text-white">Works schedules</h2>
        <span class="text-xs text-slate-500">{schedules.length}</span>
      </div>
      <p class="text-xs text-slate-500 mt-0.5">
        What we want a contractor to do — priced, instructed, then applied back
        to the asset records.
      </p>
    </div>
    <div class="flex-1"></div>
    <div class="flex items-center gap-2 shrink-0">
      <ProtectedButton requireAdmin={true} variant="primary" size="small"
                       on:click={newSchedule}>
        + New schedule
      </ProtectedButton>
    </div>
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
  <!-- Layout rule, applied consistently: the LEFT is what this is (where you
       came from, its name, its state), the RIGHT is what you can do to it.
       The status badge belongs on the left — it is information, and sitting in
       the button row it read as an action you could press.

       Actions run in workflow order, which is also the order they are used:
       edit it, send it, mark it out, mark it done. Delete is separated from
       them by a rule, because it is not a step in that sequence. -->
  <div class="flex items-start gap-3 mb-4">
    <Button variant="secondary" size="small" on:click={back}>← Schedules</Button>

    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <p class="text-sm font-semibold text-white truncate">{openSchedule.title}</p>
        <Badge color={STATUS_BADGE[openSchedule.status] ?? 'bg-slate-600'}>
          {statusLabel(openSchedule.status)}
        </Badge>
      </div>
      <p class="text-xs text-slate-500 mt-0.5">
        {purposeLabel(openSchedule.purpose)} · {describeSummary(items)}
        {#if progress.done}· {progress.done} of {progress.total} carried out{/if}
      </p>
    </div>

    <div class="flex-1"></div>

    <div class="flex items-center gap-2 shrink-0">
      {#if canEdit}
        <Button variant="secondary" size="small" on:click={editSchedule}>Edit</Button>
      {/if}

      <!-- Disabled rather than hidden: a control that vanishes leaves the
           reader wondering where it went, and the row jumping as they work. -->
      <Button variant="secondary" size="small"
              disabled={exporting || !items.length}
              title={items.length
                ? 'Word document to send to the contractor'
                : 'Add components before producing a document'}
              on:click={exportDocument}>
        {exporting ? 'Building…' : 'Document'}
      </Button>

      {#if canEdit}
        <!-- Only while it IS a draft: "mark issued" on something already issued
             is not a disabled action, it is a meaningless one. -->
        {#if openSchedule.status === 'draft'}
          <Button variant="secondary" size="small" disabled={issuing}
                  title="Record that this has gone to the contractor"
                  on:click={issue}>
            {issuing ? 'Marking…' : 'Mark issued'}
          </Button>
        {/if}

        <Button variant="primary" size="small" disabled={!items.length}
                title={items.length
                  ? 'Update the asset records from what was done'
                  : 'Nothing to mark'}
                on:click={openApply}>
          Mark carried out
        </Button>

        <!-- Not a step in the sequence above, so it does not sit in it. -->
        <span class="w-px h-5 bg-slate-700 mx-1"></span>
        <ProtectedButton requireAdmin={true} variant="danger" size="small"
                         title="Delete this schedule and all its lines"
                         on:click={() => pendingDelete = openSchedule}>
          Delete
        </ProtectedButton>
      {/if}
    </div>
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
    <!-- A bulk edit, not a workflow step, so it sits with the table it changes
         rather than in the header's action row. Labelled with what it does to
         EVERY line, because that is the surprise otherwise. -->
    <div class="flex items-center gap-1.5 mb-3 text-xs">
      <span class="text-slate-500">Set every line to</span>
      {#each WORKS_ACTIONS as a}
        <button
          class="px-2 py-0.5 rounded border border-slate-700 text-slate-400
                 hover:border-slate-500 hover:text-slate-200 transition-colors"
          title="Set all {items.length} lines to {a.label} — {a.describe.toLowerCase()}"
          on:click={() => setAllActions(a.value)}
        >{a.label}</button>
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
      <table class="w-full text-xs min-w-[56rem]">
        <thead class="bg-slate-800 text-slate-400 text-left">
          <tr>
            <th class="px-3 py-2 font-medium w-32">Ref</th>
            <th class="px-3 py-2 font-medium">Now</th>
            <th class="px-3 py-2 font-medium w-24">Action</th>
            <th class="px-3 py-2 font-medium">After</th>
            <th class="px-3 py-2 font-medium w-20">Done</th>
            <th class="px-2 py-2 w-8"></th>
            {#if canEdit}<th class="px-2 py-2 w-8"></th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each items as item (item.id)}
            {@const nowAttrs = currentAttrText(item)}
            {@const newAttrs = targetAttrText(item)}
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
            <tr
              class="border-t border-slate-700/50 {item.applied_at ? 'opacity-60' : ''}
                     {canEdit && !item.applied_at ? 'cursor-pointer hover:bg-slate-800/40' : ''}
                     transition-colors"
              on:click={() => canEdit && !item.applied_at && editLine(item)}
              title={canEdit && !item.applied_at ? 'Click to set what should happen' : ''}
            >
              <td class="px-3 py-1.5 font-mono text-slate-200">{refFor(item.component)}</td>

              <td class="px-3 py-1.5">
                <span class="text-slate-300">{typeName(item.component?.type_code)}</span>
                <span class="text-slate-500">· {item.component?.status ?? '—'}</span>
                {#if nowAttrs}
                  <span class="block text-slate-500 truncate" title={nowAttrs}>{nowAttrs}</span>
                {/if}
              </td>

              <td class="px-3 py-1.5 text-slate-300">{actionLabel(item.action)}</td>

              <td class="px-3 py-1.5">
                {#if item.target_type_code}
                  <span class="text-purple-300">{typeName(item.target_type_code)}</span>
                {:else if item.action === 'replace'}
                  <span class="text-slate-600">same type</span>
                {:else}
                  <span class="text-slate-600">—</span>
                {/if}
                {#if newAttrs}
                  <span class="block text-teal-300 truncate" title={newAttrs}>{newAttrs}</span>
                {/if}
                {#if item.spec}
                  <span class="block text-slate-500 truncate" title={item.spec}>{item.spec}</span>
                {/if}
              </td>

              <td class="px-3 py-1.5 text-slate-500">
                {item.applied_at ? fmtDate(item.applied_at) : '—'}
              </td>

              <td class="px-2 py-1.5">
                <button
                  class="text-slate-600 hover:text-purple-300 transition-colors"
                  title={item.component?.plan_id
                    ? 'Show where this is on the floor plan'
                    : 'Not placed on a floor plan'}
                  on:click|stopPropagation={() => peekAt(item)}
                >&#9678;</button>
              </td>

              {#if canEdit}
                <td class="px-2 py-1.5">
                  {#if !item.applied_at}
                    <button class="text-slate-600 hover:text-red-400 transition-colors"
                            title="Remove this line"
                            on:click|stopPropagation={() => pendingLineDelete = item}>×</button>
                  {/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  {/if}
{/if}

<WorksScheduleFormModal
  bind:this={formRef}
  bind:show={showForm}
  schedule={editing}
  on:save={handleSave}
  on:close={() => { showForm = false; editing = null; }}
/>

<ComponentPlanPeek
  bind:show={showPeek}
  component={peekComponent}
  {plans}
  componentRef={refFor(peekComponent)}
  typeName={typeName(peekComponent?.type_code)}
  on:close={() => { showPeek = false; peekComponent = null; }}
/>

<WorksLineModal
  bind:show={showLine}
  item={editingLine}
  {types}
  {attrDefs}
  {attrOptions}
  currentValues={editingLine ? (state.attributes[editingLine.component_id] ?? {}) : {}}
  componentRef={editingLine ? refFor(editingLine.component) : ''}
  {plans}
  on:save={handleLineSave}
  on:close={() => { showLine = false; editingLine = null; }}
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
  show={!!pendingLineDelete}
  danger={true}
  processing={removingLine}
  title="Remove this line?"
  message={pendingLineDelete
    ? `${refFor(pendingLineDelete.component)} will be taken off this schedule. `
      + 'The asset itself is not affected.'
    : ''}
  confirmText="Remove"
  on:confirm={confirmRemoveLine}
  on:cancel={() => pendingLineDelete = null}
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
