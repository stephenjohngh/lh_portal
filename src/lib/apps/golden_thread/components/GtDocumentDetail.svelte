<!-- src/lib/apps/golden_thread/components/GtDocumentDetail.svelte -->
<!--
  Golden Thread document detail + lifecycle actions (build step 4). Shows the
  register metadata, the attached file (via the shared document_library viewer),
  the supersession references, and — since migration 264 — the shared
  WorkflowItemControls: its step, who it is with, the moves from it (each held
  back with its reason) and the history. ⛔ A move is one UPDATE of the row,
  so the hash-chained audit records it exactly as before.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { documentMoveConfirmation } from '../utils/gtWorkflow.js';
  import { describeLinkAudit } from '../utils/gtAuditHistory.js';
  import { gtStore } from '#lib/apps/golden_thread/stores/gtStore.js';
  import { permissions } from '#lib/stores/permissions.js';
  import { GT_STATUS_LABELS, GT_STATUS_BADGE } from '#lib/apps/golden_thread/utils/gtLifecycle.js';
  import { auth } from '#lib/stores/auth.js';
  import { profiles, profilesStore } from '#lib/stores/profiles.js';
  import { onMount } from 'svelte';
  import WorkflowItemControls from '#lib/workflow/WorkflowItemControls.svelte';
  import { LINK_TARGET_TYPES, LINK_RELATIONS, REVIEW_BAND_LABEL, REVIEW_BAND_BADGE } from '#lib/apps/golden_thread/utils/gtConstants.js';
  import { reviewBand, daysToReview } from '#lib/apps/golden_thread/utils/gtReview.js';
  import { listCases as listMorCases, morCaseLabel } from '#lib/apps/mor/public.js';
  import Badge           from '#lib/components/common/Badge.svelte';
  import Button          from '#lib/components/common/Button.svelte';
  import ProtectedButton from '#lib/components/common/ProtectedButton.svelte';
  import Modal           from '#lib/components/common/Modal.svelte';
  import FormInput       from '#lib/components/common/FormInput.svelte';
  import FormSelect      from '#lib/components/common/FormSelect.svelte';
  import FormTextarea    from '#lib/components/common/FormTextarea.svelte';
  import AttachedDocuments from '#lib/components/common/documents/AttachedDocuments.svelte';
  import { fmtDate, fmtDateTime, today } from '#lib/utils/dates.js';
  import { logAudit } from '#lib/utils/auditLogger.js';
  import { shouldLogView } from '#lib/apps/golden_thread/utils/gtAccessLog.js';

  /** @type {any} */
  export let doc;
  export let saving = false;

  const dispatch = createEventDispatcher();

  // Review band — only for a current document with a review date (else null).
  $: reviewBadge = (doc?.status === 'current' && doc?.review_due)
    ? reviewBand(daysToReview(doc, today()))
    : null;

  // ── Links / citations ──────────────────────────────────────────────────────
  $: links = $gtStore.links;
  let loadedLinksFor = null;
  $: if (doc?.id && doc.id !== loadedLinksFor) {
    loadedLinksFor = doc.id;
    gtStore.loadLinks(doc.id);
  }

  // ── View logging for sensitive documents (EXT-15.R3) ────────────────────────
  // Access to sensitive material is logged, not just changes to it — RLS
  // (188) controls who CAN see it; this records that someone DID. The
  // predicate (which documents, and the once-per-id dedup) is a tested pure
  // function — see gtAccessLog.test.js — rather than inline in this `$:`,
  // because that shape has already caused real bugs elsewhere in the
  // codebase when it re-fired on every re-render instead of once per id.
  let loggedViewFor = null;
  $: if (shouldLogView(doc, loggedViewFor)) {
    loggedViewFor = doc.id;
    logAudit('view', 'gt_document', doc.id, doc.reference ?? doc.title, {
      appId: 'golden_thread',
      eventCategory: 'golden_thread',
      severity: 'info',
      afterData: { security_classification: doc.security_classification, contains_pii: doc.contains_pii }
    });
  }

  // ── Audit history (admin-only; RLS blocks non-admins) ───────────────────────
  // Keyed on id+status so it reloads when the document changes AND after a
  // lifecycle action (which appends an audit row and flips status).
  $: isAdmin = $permissions.isAdmin;
  $: auditHistory = $gtStore.auditHistory;
  let loadedAuditKey = null;
  // …and when a citation is added or removed, which changes the history too.
  $: auditKey = `${doc?.id}:${doc?.status}:${links.outgoing?.length ?? 0}:${links.incoming?.length ?? 0}`;
  $: if (isAdmin && doc?.id && auditKey !== loadedAuditKey) {
    loadedAuditKey = auditKey;
    gtStore.loadAuditHistory(doc.id);
  }

  // Controlled vocabularies from gtConstants (was a local duplicate — R1).
  const TARGET_TYPES = LINK_TARGET_TYPES.map((v) => ({ value: v, label: v }));
  const RELATIONS    = LINK_RELATIONS.map((v) => ({ value: v, label: v }));

  let showAddLink = false;
  let linkTargetType = 'mor_case';
  let linkTargetId = '';
  let linkRelation = 'evidences';
  let linkNote = '';
  let linkError = '';

  // MOR cases for the picker + label resolution. Lazy-loaded when the add-link
  // modal opens or when an existing outgoing link targets a mor_case (so bare
  // UUIDs resolve to "MOR-xxxx — …" without opening the modal).
  /** @type {any[]} */
  let morCases = [];
  let morCasesLoaded = false;
  $: morCaseOptions = morCases.map((c) => ({ value: c.id, label: morCaseLabel(c) }));
  $: morCaseById    = new Map(morCases.map((c) => [c.id, c]));
  $: hasMorLinks    = links.outgoing?.some((l) => l.target_type === 'mor_case');
  $: if ((showAddLink || hasMorLinks) && !morCasesLoaded) loadMorCases();
  async function loadMorCases() {
    morCasesLoaded = true;
    try { morCases = await listMorCases(); } catch { morCases = []; }
  }
  // Clear the chosen target when the type changes (a mor_case id must not carry
  // over into a free-text target type, and vice versa).
  let prevLinkTargetType = linkTargetType;
  $: if (linkTargetType !== prevLinkTargetType) { prevLinkTargetType = linkTargetType; linkTargetId = ''; }

  async function addLink() {
    linkError = '';
    if (!linkTargetId.trim()) return (linkError = 'Target id is required.');
    const r = await gtStore.addLink(doc.id, {
      targetType: linkTargetType, targetId: linkTargetId.trim(), relation: linkRelation, note: linkNote.trim()
    });
    if (r.success) {
      showAddLink = false;
      linkTargetId = ''; linkNote = '';
    } else {
      linkError = r.error ?? 'Failed to add link.';
    }
  }

  function removeLink(linkId) {
    gtStore.removeDocumentLink(linkId, doc.id);
  }

  // ── Its workflow (migration 264) ──────────────────────────────────────────
  onMount(() => { profilesStore.load(); });
  $: wf       = $gtStore.workflow;
  $: wfItem   = doc?.id ? ($gtStore.items ?? []).find((i) => i.subject_id === doc.id) ?? null : null;
  $: me       = $auth.user?.id ?? null;
  $: canEdit  = $permissions.isAdmin || $permissions.canModify;
  $: nameById = Object.fromEntries(($profiles.list ?? []).map((p) => [p.id, p.full_name ?? '']));
  let assigneeList = [];
  let assigneesFor = null;
  $: if (wf?.id && wf.id !== assigneesFor) {
    assigneesFor = wf.id;
    gtStore.assignees().then((l) => { assigneeList = l; }, () => { assigneeList = []; });
  }

  /** A store result as the controls expect it: a throw carries the reason. */
  function orThrow(/** @type {any} */ r) {
    if (r?.success) return r;
    gtStore.clearError();            // the controls show the reason beside the move
    throw new Error(r?.error || 'That could not be done.');
  }
  async function onWfMove(/** @type {any} */ m, /** @type {string} */ note) {
    orThrow(await gtStore.moveDocument(doc.id, m.to_key, note));
    dispatch('changed');
  }
  async function onWfAssign(/** @type {string|null} */ uid) {
    orThrow(await gtStore.assign(doc.id, uid));
  }

  /** Superseding is never pressed: accepting the successor makes it (264). */
  const extraRefusal = (/** @type {any} */ m) => (m.from_key === 'current' && m.to_key === 'superseded'
    ? 'Register the version that replaces it and accept it: that supersedes this one.'
    : null);

  const confirmMove = (/** @type {any} */ m) => documentMoveConfirmation(m, doc);

  $: wfAudit = doc ? { appId: 'golden_thread', entityType: 'gt_document', entityId: doc.id } : null;
  $: wfRecord = doc ? {
    filenameStem: `GT_${doc.reference}_${today()}`,
    subject: () => ({
      title: `Golden Thread document — ${doc.reference}`,
      facts: [['Title', doc.title], ['Schedule-1 category', doc.schedule1_category], ['Document type', doc.document_type],
        ['Effective from', doc.effective_from ? fmtDate(doc.effective_from) : '—'],
        ['Effective to', doc.effective_to ? fmtDate(doc.effective_to) : '—'],
        ['Review due', doc.review_due ? fmtDate(doc.review_due) : '—']],
      sections: [{ heading: 'Summary', text: doc.summary }, { heading: 'Reason (returned or withdrawn)', text: doc.supersession_reason }],
    }),
  } : null;
</script>

<div class="space-y-5">
  <Button variant="secondary" size="small" on:click={() => dispatch('back')}>← Back to register</Button>

  <!-- Header -->
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="font-mono text-xs text-slate-400">{doc.reference}</p>
      <h2 class="text-xl font-bold text-white">{doc.title}</h2>
    </div>
    <Badge color={GT_STATUS_BADGE[doc.status] ?? 'bg-slate-500'}>
      {GT_STATUS_LABELS[doc.status] ?? doc.status}
    </Badge>
  </div>

  <!-- Its workflow (264): moves, who has it, history -->
  {#if !wfItem}
    <p class="text-xs text-slate-500">This document is not in its workflow yet — an administrator opening Golden Thread sets it up.</p>
  {:else}
    <WorkflowItemControls item={wfItem} workflow={wf} steps={$gtStore.steps} moves={$gtStore.moves}
      fields={$gtStore.fields} reference={doc.reference} isAdmin={$permissions.isAdmin} {canEdit} {me}
      assignees={assigneeList} {nameById}
      onMove={onWfMove} onAssign={onWfAssign}
      {extraRefusal} {confirmMove} audit={wfAudit} record={wfRecord}
      finishedText={doc.status === 'current' ? 'This document is current. It is superseded by accepting the version that replaces it.' : 'Nothing further happens to this document.'} />
  {/if}

  <!-- Metadata grid -->
  <dl class="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
    <div><dt class="text-xs text-slate-500">Schedule-1 category</dt><dd class="text-slate-200">{doc.schedule1_category}</dd></div>
    <div><dt class="text-xs text-slate-500">Document type</dt><dd class="text-slate-200">{doc.document_type}</dd></div>
    <div><dt class="text-xs text-slate-500">Access scope</dt><dd class="text-slate-200">{doc.access_scope}</dd></div>
    <div><dt class="text-xs text-slate-500">Security classification</dt><dd class="text-slate-200">{doc.security_classification}</dd></div>
    <div><dt class="text-xs text-slate-500">Safety-critical</dt><dd class="text-slate-200">{doc.safety_critical ? 'Yes' : 'No'}</dd></div>
    <div><dt class="text-xs text-slate-500">Contains PII</dt><dd class="text-slate-200">{doc.contains_pii ? 'Yes' : 'No'}</dd></div>
    <div><dt class="text-xs text-slate-500">Building location</dt><dd class="text-slate-200">{doc.building_location || '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Uniclass code</dt><dd class="text-slate-200">{doc.uniclass_code || '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Information container ID</dt><dd class="text-slate-200">{doc.container_id || '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Tags</dt><dd class="text-slate-200">{doc.tags?.length ? doc.tags.join(', ') : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Effective from</dt><dd class="text-slate-200">{doc.effective_from ? fmtDate(doc.effective_from) : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Effective to</dt><dd class="text-slate-200">{doc.effective_to ? fmtDate(doc.effective_to) : '— (open)'}</dd></div>
    <div>
      <dt class="text-xs text-slate-500">Review due</dt>
      <dd class="text-slate-200 flex items-center gap-2">
        {doc.review_due ? fmtDate(doc.review_due) : '—'}
        {#if reviewBadge}<Badge color={REVIEW_BAND_BADGE[reviewBadge]}>{REVIEW_BAND_LABEL[reviewBadge]}</Badge>{/if}
      </dd>
    </div>
    <div><dt class="text-xs text-slate-500">Review cycle (days)</dt><dd class="text-slate-200">{doc.review_cycle_days ?? '—'}</dd></div>
  </dl>

  {#if doc.summary}
    <div>
      <p class="text-xs text-slate-500 mb-1">Summary</p>
      <p class="text-sm text-slate-200 whitespace-pre-wrap">{doc.summary}</p>
    </div>
  {/if}

  {#if doc.scope_description}
    <div>
      <p class="text-xs text-slate-500 mb-1">Scope / applicability</p>
      <p class="text-sm text-slate-200 whitespace-pre-wrap">{doc.scope_description}</p>
    </div>
  {/if}

  <!-- Supersession references -->
  {#if doc.supersedes || doc.superseded_by || doc.supersession_reason}
    <div class="rounded-lg border border-slate-700 p-3 text-sm space-y-1">
      <p class="text-xs text-slate-500">Supersession</p>
      {#if doc.supersedes}<p class="text-slate-300">Supersedes: <span class="font-mono text-xs">{doc.supersedes}</span></p>{/if}
      {#if doc.superseded_by}<p class="text-slate-300">Superseded by: <span class="font-mono text-xs">{doc.superseded_by}</span></p>{/if}
      {#if doc.supersession_reason}<p class="text-slate-400">Reason: {doc.supersession_reason}</p>{/if}
    </div>
  {/if}

  <!-- File integrity + attached file -->
  <div class="text-xs text-slate-500">
    File checksum (SHA-256): <span class="font-mono text-slate-400 break-all">{doc.file_checksum ?? '—'}</span>
  </div>
  <div>
    <p class="text-xs text-slate-500 mb-1.5">Attached file</p>
    <AttachedDocuments entityType="gt_document" entityId={doc.id} canEdit={false} canDelete={false} />
  </div>

  <!-- Links / citations -->
  <div class="rounded-lg border border-slate-700 p-3 space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-slate-200">Links &amp; citations</p>
      <ProtectedButton action="modify" variant="secondary" size="small" on:click={() => (showAddLink = true)}>
        + Add reference
      </ProtectedButton>
    </div>

    <!-- Outgoing: this document references / was produced by -->
    <div>
      <p class="text-xs text-slate-500 mb-1">References from this document</p>
      {#if links.outgoing.length === 0}
        <p class="text-xs text-slate-600">None.</p>
      {:else}
        <ul class="space-y-1">
          {#each links.outgoing as l (l.id)}
            <li class="flex items-center justify-between gap-2 text-xs">
              <span class="text-slate-300">
                <span class="text-slate-500">{l.relation}</span> → {l.target_type}
                {#if l.target_type === 'mor_case' && morCaseById.get(l.target_id)}
                  {morCaseLabel(morCaseById.get(l.target_id))}
                {:else}
                  <span class="font-mono text-slate-400">{l.target_id}</span>
                {/if}
                {#if l.note}<span class="text-slate-500">· {l.note}</span>{/if}
              </span>
              <ProtectedButton action="modify" variant="danger" size="small" on:click={() => removeLink(l.id)}>
                Remove
              </ProtectedButton>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Incoming: who cites this document (L3 evidence references) -->
    <div>
      <p class="text-xs text-slate-500 mb-1">Cited by</p>
      {#if links.incoming.length === 0}
        <p class="text-xs text-slate-600">Not cited yet.</p>
      {:else}
        <ul class="space-y-1">
          {#each links.incoming as l (l.id)}
            <li class="text-xs text-slate-300">
              {l.source_type} <span class="font-mono text-slate-400">{l.source_id}</span>
              <span class="text-slate-500">({l.relation})</span>
              {#if l.note}<span class="text-slate-500">· {l.note}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Audit history (admin only) -->
  {#if isAdmin}
    <div class="rounded-lg border border-slate-700 p-3 space-y-2">
      <p class="text-sm font-medium text-slate-200">Audit history</p>
      {#if auditHistory.length === 0}
        <p class="text-xs text-slate-600">No audit entries.</p>
      {:else}
        <ol class="space-y-1">
          {#each auditHistory as a (a.seq)}
            <li class="text-xs text-slate-300 flex flex-wrap gap-x-2">
              <span class="font-mono text-slate-500">#{a.seq}</span>
              <span class="uppercase text-slate-400">{a.action}</span>
              {#if describeLinkAudit(a, doc.id)}
                <span class="text-slate-200">{describeLinkAudit(a, doc.id)}</span>
              {:else if a.before_data?.status && a.after_data?.status && a.before_data.status !== a.after_data.status}
                <span class="text-slate-200">{a.before_data.status} → {a.after_data.status}</span>
              {/if}
              <span class="text-slate-500">{fmtDateTime(a.occurred_at)}</span>
            </li>
          {/each}
        </ol>
        <p class="text-[11px] text-slate-600">Immutable, hash-chained record — {auditHistory.length} entr{auditHistory.length === 1 ? 'y' : 'ies'}.</p>
      {/if}
    </div>
  {/if}

  <p class="text-xs text-slate-600">Created {fmtDateTime(doc.created_at)} · last updated {fmtDateTime(doc.updated_at)}</p>
</div>

<!-- Add-link modal -->
<Modal show={showAddLink} title="Add reference" size="small" on:close={() => (showAddLink = false)}>
  <div class="space-y-4">
    <FormSelect label="Target type" bind:value={linkTargetType} options={TARGET_TYPES} />
    {#if linkTargetType === 'mor_case'}
      <FormSelect label="MOR case" bind:value={linkTargetId} options={morCaseOptions}
        placeholder="— Select a case —" required
        helpText={morCasesLoaded && morCaseOptions.length === 0 ? 'No MOR cases found.' : ''} />
    {:else}
      <FormInput label="Target id" bind:value={linkTargetId} placeholder="UUID of the linked entity" required />
    {/if}
    <FormSelect label="Relation" bind:value={linkRelation} options={RELATIONS} />
    <FormTextarea label="Note" bind:value={linkNote} rows={2} />
    {#if linkError}<p class="text-sm text-red-400">{linkError}</p>{/if}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" disabled={saving} on:click={() => (showAddLink = false)}>Cancel</Button>
      <Button variant="primary" loading={saving} disabled={saving} on:click={addLink}>Add</Button>
    </div>
  </div>
</Modal>
