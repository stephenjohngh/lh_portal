<!-- src/lib/apps/golden_thread/components/GtDocumentDetail.svelte -->
<!--
  Golden Thread document detail + lifecycle actions (build step 4). Shows the
  register metadata, the attached file (via the shared document_library viewer),
  the supersession references, and the lifecycle actions valid from the current
  status. Actions are gated twice: by permission (ProtectedButton) and by the
  transition table (nextStates) — which mirrors the DB trigger, so the UI only
  ever offers transitions the database will accept.
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import { gtStore } from '$lib/apps/golden_thread/stores/gtStore';
  import { permissions } from '$lib/stores/permissions';
  import { nextStates, GT_STATUS_LABELS, GT_STATUS_BADGE } from '$lib/apps/golden_thread/utils/gtLifecycle.js';
  import { LINK_TARGET_TYPES, LINK_RELATIONS, REVIEW_BAND_LABEL, REVIEW_BAND_BADGE } from '$lib/apps/golden_thread/utils/gtConstants.js';
  import { reviewBand, daysToReview } from '$lib/apps/golden_thread/utils/gtReview.js';
  import Badge           from '$lib/components/common/Badge.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';
  import Modal           from '$lib/components/common/Modal.svelte';
  import FormInput       from '$lib/components/common/FormInput.svelte';
  import FormSelect      from '$lib/components/common/FormSelect.svelte';
  import FormTextarea    from '$lib/components/common/FormTextarea.svelte';
  import AttachedDocuments from '$lib/components/common/documents/AttachedDocuments.svelte';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';

  /** @type {any} */
  export let doc;
  export let saving = false;

  const dispatch = createEventDispatcher();

  // Review band — only for a current document with a review date (else null).
  $: reviewBadge = (doc?.status === 'current' && doc?.review_due)
    ? reviewBand(daysToReview(doc, new Date().toISOString().slice(0, 10)))
    : null;

  // ── Links / citations ──────────────────────────────────────────────────────
  $: links = $gtStore.links;
  let loadedLinksFor = null;
  $: if (doc?.id && doc.id !== loadedLinksFor) {
    loadedLinksFor = doc.id;
    gtStore.loadLinks(doc.id);
  }

  // ── Audit history (admin-only; RLS blocks non-admins) ───────────────────────
  // Keyed on id+status so it reloads when the document changes AND after a
  // lifecycle action (which appends an audit row and flips status).
  $: isAdmin = $permissions.isAdmin;
  $: auditHistory = $gtStore.auditHistory;
  let loadedAuditKey = null;
  $: if (isAdmin && doc?.id && `${doc.id}:${doc.status}` !== loadedAuditKey) {
    loadedAuditKey = `${doc.id}:${doc.status}`;
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

  // Action config per *target* status. nextStates() gives the valid targets for
  // the current status; 'superseded' is excluded because you never supersede a
  // document directly — you accept a successor draft, which supersedes the prior.
  const ACTION = {
    under_review:       { label: 'Submit for review', variant: 'primary',  requireAdmin: false, reason: false },
    current:            { label: 'Accept — make current', variant: 'green', requireAdmin: false, reason: false },
    reactivate:         { label: 'Reactivate', variant: 'blue',             requireAdmin: false, reason: false },
    returned_to_author: { label: 'Return to author', variant: 'amber',      requireAdmin: false, reason: true },
    withdrawn:          { label: 'Withdraw', variant: 'danger',             requireAdmin: true,  reason: true }
  };

  // Build the action list. From 'superseded', target 'current' means reactivation
  // (different label/handler) — disambiguate with a synthetic key.
  $: actions = nextStates(doc?.status)
    .filter((t) => t !== 'superseded')
    .map((t) => {
      const key = t === 'current' && doc.status === 'superseded' ? 'reactivate' : t;
      return { target: t, key, ...ACTION[key] };
    });

  /** @type {{ target: string, key: string, label: string, requireAdmin: boolean, reason: boolean } | null} */
  let pending = null;
  let reasonText = '';

  function requestAction(a) {
    pending = a;
    reasonText = '';
  }
  function cancel() {
    pending = null;
    reasonText = '';
  }

  async function confirm() {
    if (!pending) return;
    const { target, reason } = pending;
    let r;
    if (target === 'under_review')            r = await gtStore.submitForReview(doc.id);
    else if (pending.key === 'reactivate')    r = await gtStore.reactivate(doc.id);
    else if (target === 'current')            r = await gtStore.accept(doc.id);
    else if (target === 'returned_to_author') r = await gtStore.returnToAuthor(doc.id, reasonText.trim());
    else if (target === 'withdrawn')          r = await gtStore.withdraw(doc.id, reasonText.trim());

    if (r?.success) {
      pending = null;
      reasonText = '';
      dispatch('changed');
    }
  }

  // Reason actions confirm via the Modal; the rest via ConfirmDialog.
  $: reasonPending = !!pending && pending.reason;
  $: simplePending = !!pending && !pending.reason;
</script>

<div class="space-y-5">
  <button type="button" class="text-sm text-slate-400 hover:text-slate-200" on:click={() => dispatch('back')}>
    ← Back to register
  </button>

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

  <!-- Lifecycle actions -->
  {#if actions.length}
    <div class="flex flex-wrap gap-2">
      {#each actions as a (a.key)}
        <ProtectedButton
          action="modify"
          requireAdmin={a.requireAdmin}
          variant={a.variant}
          disabled={saving}
          on:click={() => requestAction(a)}
        >{a.label}</ProtectedButton>
      {/each}
    </div>
  {:else}
    <p class="text-xs text-slate-500">No lifecycle actions available from this status.</p>
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
                <span class="font-mono text-slate-400">{l.target_id}</span>
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
              {#if a.before_data?.status && a.after_data?.status && a.before_data.status !== a.after_data.status}
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
    <FormInput label="Target id" bind:value={linkTargetId} placeholder="UUID of the linked entity" required />
    <FormSelect label="Relation" bind:value={linkRelation} options={RELATIONS} />
    <FormTextarea label="Note" bind:value={linkNote} rows={2} />
    {#if linkError}<p class="text-sm text-red-400">{linkError}</p>{/if}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" disabled={saving} on:click={() => (showAddLink = false)}>Cancel</Button>
      <Button variant="primary" loading={saving} disabled={saving} on:click={addLink}>Add</Button>
    </div>
  </div>
</Modal>

<!-- Simple confirm (no reason) -->
<ConfirmDialog
  show={simplePending}
  title={pending?.label ?? 'Confirm'}
  message={`${pending?.label ?? 'Proceed'} for "${doc.title}"?`}
  confirmText={pending?.label ?? 'Confirm'}
  danger={pending?.variant === 'danger'}
  processing={saving}
  on:confirm={confirm}
  on:cancel={cancel}
/>

<!-- Reason-bearing confirm (return to author / withdraw) -->
<Modal show={reasonPending} title={pending?.label ?? ''} size="small" on:close={cancel}>
  <div class="space-y-4">
    <FormTextarea label="Reason" bind:value={reasonText} rows={3} required
      placeholder="Why are you {pending?.label?.toLowerCase()}?" />
    <div class="flex justify-end gap-2">
      <Button variant="secondary" disabled={saving} on:click={cancel}>Cancel</Button>
      <Button variant={pending?.variant === 'danger' ? 'danger' : 'primary'}
        loading={saving} disabled={saving || !reasonText.trim()} on:click={confirm}>
        {pending?.label}
      </Button>
    </div>
  </div>
</Modal>
