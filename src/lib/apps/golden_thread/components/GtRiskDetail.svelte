<!-- src/lib/apps/golden_thread/components/GtRiskDetail.svelte -->
<!-- Risk detail: scoring, live rating, typed links, lifecycle actions, metadata.
     Calls gtRiskStore directly (like GtDocumentDetail → gtStore). Add-link
     supports a MOR-case / GT-document picker and a raw id for other targets. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { gtRiskStore } from '$lib/apps/golden_thread/stores/gtRiskStore';
  import { permissions } from '$lib/stores/permissions';
  import { nextRiskStates, RISK_STATUS_LABELS, RISK_STATUS_BADGE } from '$lib/apps/golden_thread/utils/gtRiskLifecycle.js';
  import {
    RISK_DOMAIN_LABELS, effectiveScore, scoreBand, liveRating, ALERT_LABELS,
  } from '$lib/apps/golden_thread/utils/gtRiskScoring.js';
  import { listCases as listMorCases, morCaseLabel } from '$lib/apps/mor/public.js';
  import Badge         from '$lib/components/common/Badge.svelte';
  import Button        from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import Modal         from '$lib/components/common/Modal.svelte';
  import FormInput     from '$lib/components/common/FormInput.svelte';
  import FormSelect    from '$lib/components/common/FormSelect.svelte';
  import FormTextarea  from '$lib/components/common/FormTextarea.svelte';
  import { fmtDate }   from '$lib/utils/dates';

  export let risk;
  export let links = [];
  export let signals = {};        // alert signals for this risk (from the list-level computation)
  export let documents = [];      // GT documents (for the picker)
  export let ownerName = '';
  export let saving = false;

  const dispatch = createEventDispatcher();

  $: canEdit = $permissions.isAdmin || $permissions.canModify;
  $: inherent = risk.inherent_score ?? (risk.likelihood * risk.impact);
  $: effective = effectiveScore(risk);
  $: baseBand = scoreBand(effective);
  $: live = liveRating(risk, signals);

  // -- Lifecycle actions ------------------------------------------------------
  const REASON_STATES = { closed: 'closure_reason', superseded: 'supersession_reason' };
  $: actions = nextRiskStates(risk.status);
  /** @type {string|null} */
  let pending = null;
  let reasonText = '';
  $: needsReason = pending != null && pending in REASON_STATES;

  function requestAction(to) { pending = to; reasonText = ''; }
  async function confirmAction() {
    const to = pending;
    const extra = to && to in REASON_STATES ? { [REASON_STATES[to]]: reasonText.trim() || null } : {};
    const r = await gtRiskStore.transitionRisk(risk, to, extra);
    if (r.success) { pending = null; reasonText = ''; dispatch('changed'); }
  }

  // -- Links ------------------------------------------------------------------
  const TARGET_TYPES = ['gt_document', 'mor_case', 'component', 'plan', 'action', 'component_inspection', 'maintenance_job']
    .map((v) => ({ value: v, label: v }));
  const RELATIONS = ['controlled_by', 'evidenced_by', 'raised_by', 'mitigated_by', 'affects', 'located_at']
    .map((v) => ({ value: v, label: v }));

  let showAddLink = false;
  let linkTargetType = 'gt_document';
  let linkTargetId = '';
  let linkRelation = 'controlled_by';
  let linkNote = '';
  let linkError = '';

  let morCases = [];
  let morLoaded = false;
  $: docOptions = documents.map((d) => ({ value: d.id, label: `${d.reference} — ${d.title}` }));
  $: morOptions = morCases.map((c) => ({ value: c.id, label: morCaseLabel(c) }));
  $: docById = new Map(documents.map((d) => [d.id, d]));
  $: morById = new Map(morCases.map((c) => [c.id, c]));

  async function openAddLink() {
    showAddLink = true;
    if (!morLoaded) { morLoaded = true; try { morCases = await listMorCases(); } catch { morCases = []; } }
  }
  let prevType = linkTargetType;
  $: if (linkTargetType !== prevType) { prevType = linkTargetType; linkTargetId = ''; }

  async function addLink() {
    linkError = '';
    if (!linkTargetId.trim()) return (linkError = 'Pick or enter a target.');
    const r = await gtRiskStore.addLink(risk.id, {
      targetType: linkTargetType, targetId: linkTargetId.trim(), relation: linkRelation, note: linkNote.trim() || null,
    });
    if (r.success) { showAddLink = false; linkTargetId = ''; linkNote = ''; dispatch('changed'); }
    else linkError = r.error ?? 'Failed to add link.';
  }
  async function removeLink(id) {
    const r = await gtRiskStore.removeLink(id, risk.id);
    if (r.success) dispatch('changed');
  }

  function linkLabel(l) {
    if (l.target_type === 'gt_document' && docById.get(l.target_id)) {
      const d = docById.get(l.target_id); return `${d.reference} — ${d.title}`;
    }
    if (l.target_type === 'mor_case' && morById.get(l.target_id)) return morCaseLabel(morById.get(l.target_id));
    return l.target_id;
  }
</script>

<div class="space-y-5">
  <button type="button" class="text-sm text-slate-400 hover:text-slate-200" on:click={() => dispatch('back')}>← Back to risks</button>

  <!-- Header -->
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="font-mono text-xs text-slate-400">{risk.reference} · {RISK_DOMAIN_LABELS[risk.domain] ?? risk.domain}</p>
      <h2 class="text-xl font-bold text-white">{risk.title}</h2>
    </div>
    <div class="flex items-center gap-2">
      <Badge color={RISK_STATUS_BADGE[risk.status] ?? 'bg-slate-500'}>{RISK_STATUS_LABELS[risk.status] ?? risk.status}</Badge>
      {#if live.band}
        <Badge color={live.band.badge}>{live.band.label}{#if live.escalated} ⚠{/if}</Badge>
      {/if}
      {#if canEdit}<Button variant="secondary" size="small" on:click={() => dispatch('edit', risk)}>Edit</Button>{/if}
    </div>
  </div>

  {#if live.escalated}
    <div class="rounded-lg border border-amber-700/50 bg-amber-900/10 px-3 py-2 text-xs text-amber-300">
      Live rating escalated from <strong>{baseBand?.label}</strong> — active:
      {live.activeAlerts.map((a) => ALERT_LABELS[a] ?? a).join(' · ')}
    </div>
  {/if}

  <!-- Lifecycle actions -->
  {#if actions.length}
    <div class="flex flex-wrap gap-2">
      {#each actions as to}
        <ProtectedButton action="modify" variant={to === 'closed' || to === 'superseded' ? 'danger' : 'blue'} size="small"
          disabled={saving} on:click={() => requestAction(to)}>
          → {RISK_STATUS_LABELS[to] ?? to}
        </ProtectedButton>
      {/each}
    </div>
  {/if}

  <!-- Scoring -->
  <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
    <div><dt class="text-xs text-slate-500">Likelihood × Impact</dt><dd class="text-slate-200">{risk.likelihood} × {risk.impact} = {inherent} (inherent)</dd></div>
    <div><dt class="text-xs text-slate-500">Residual</dt><dd class="text-slate-200">{risk.residual_score ?? '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Effective band</dt><dd class="text-slate-200">{baseBand?.label ?? '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Owner</dt><dd class="text-slate-200">{ownerName || '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Source</dt><dd class="text-slate-200">{risk.source ?? '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Location</dt><dd class="text-slate-200">{risk.building_location || '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Identified</dt><dd class="text-slate-200">{risk.identified_at ? fmtDate(risk.identified_at) : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Review due</dt><dd class="text-slate-200">{risk.review_due ? fmtDate(risk.review_due) : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Cycle (days)</dt><dd class="text-slate-200">{risk.review_cycle_days ?? '—'}</dd></div>
  </dl>

  {#if risk.description}<div><p class="text-xs text-slate-500 mb-1">Description</p><p class="text-sm text-slate-200 whitespace-pre-wrap">{risk.description}</p></div>{/if}
  {#if risk.closure_reason}<p class="text-xs text-slate-400">Closed: {risk.closure_reason}</p>{/if}
  {#if risk.supersession_reason}<p class="text-xs text-slate-400">Superseded: {risk.supersession_reason}</p>{/if}

  <!-- Links -->
  <div class="rounded-lg border border-slate-700 p-3 space-y-2">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-slate-200">Controls, evidence & related records</p>
      <ProtectedButton action="modify" variant="secondary" size="small" on:click={openAddLink}>+ Add link</ProtectedButton>
    </div>
    {#if links.length === 0}
      <p class="text-xs text-slate-600">No links yet — link controlling documents, the occurrence that raised it, affected objects, and mitigations.</p>
    {:else}
      <ul class="space-y-1">
        {#each links as l (l.id)}
          <li class="flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-300">
              <span class="text-slate-500">{l.relation}</span> → {l.target_type}
              <span class="text-slate-200">{linkLabel(l)}</span>
              {#if l.note}<span class="text-slate-500">· {l.note}</span>{/if}
            </span>
            <ProtectedButton action="modify" variant="danger" size="small" on:click={() => removeLink(l.id)}>Remove</ProtectedButton>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<!-- Add-link modal -->
<Modal show={showAddLink} title="Add risk link" size="small" on:close={() => (showAddLink = false)}>
  <div class="space-y-4">
    <FormSelect label="Relation" bind:value={linkRelation} options={RELATIONS} />
    <FormSelect label="Target type" bind:value={linkTargetType} options={TARGET_TYPES} />
    {#if linkTargetType === 'gt_document'}
      <FormSelect label="Document" bind:value={linkTargetId} options={docOptions} placeholder="— Select —" />
    {:else if linkTargetType === 'mor_case'}
      <FormSelect label="MOR case" bind:value={linkTargetId} options={morOptions} placeholder="— Select —" />
    {:else}
      <FormInput label="Target id (UUID)" bind:value={linkTargetId} placeholder="id of the linked {linkTargetType}" />
    {/if}
    <FormTextarea label="Note" bind:value={linkNote} rows={2} />
    {#if linkError}<p class="text-sm text-red-400">{linkError}</p>{/if}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" disabled={saving} on:click={() => (showAddLink = false)}>Cancel</Button>
      <Button variant="primary" loading={saving} disabled={saving} on:click={addLink}>Add</Button>
    </div>
  </div>
</Modal>

<!-- Lifecycle confirm / reason -->
{#if needsReason}
  <Modal show={true} title={`${RISK_STATUS_LABELS[pending]} risk`} size="small" on:close={() => (pending = null)}>
    <div class="space-y-3">
      <FormTextarea label="Reason" bind:value={reasonText} rows={3} placeholder="Why is this risk {pending}?" />
      <div class="flex justify-end gap-2">
        <Button variant="secondary" on:click={() => (pending = null)}>Cancel</Button>
        <Button variant="danger" loading={saving} disabled={saving} on:click={confirmAction}>{RISK_STATUS_LABELS[pending]}</Button>
      </div>
    </div>
  </Modal>
{:else}
  <ConfirmDialog
    show={pending != null}
    title={pending ? `Move to ${RISK_STATUS_LABELS[pending]}` : ''}
    message={pending ? `Change status to "${RISK_STATUS_LABELS[pending]}" for ${risk.reference}?` : ''}
    processing={saving}
    on:confirm={confirmAction}
    on:cancel={() => (pending = null)}
  />
{/if}
