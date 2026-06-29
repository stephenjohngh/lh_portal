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
  import { nextStates, statusLabel, GT_STATUS_LABELS, GT_STATUS_BADGE } from '$lib/apps/golden_thread/utils/gtLifecycle.js';
  import Badge           from '$lib/components/common/Badge.svelte';
  import Button          from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog   from '$lib/components/common/ConfirmDialog.svelte';
  import Modal           from '$lib/components/common/Modal.svelte';
  import FormTextarea    from '$lib/components/common/FormTextarea.svelte';
  import AttachedDocuments from '$lib/components/documents/AttachedDocuments.svelte';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';

  /** @type {any} */
  export let doc;
  export let saving = false;

  const dispatch = createEventDispatcher();

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
    <div><dt class="text-xs text-slate-500">Tags</dt><dd class="text-slate-200">{doc.tags?.length ? doc.tags.join(', ') : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Effective from</dt><dd class="text-slate-200">{doc.effective_from ? fmtDate(doc.effective_from) : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Effective to</dt><dd class="text-slate-200">{doc.effective_to ? fmtDate(doc.effective_to) : '— (open)'}</dd></div>
    <div><dt class="text-xs text-slate-500">Review due</dt><dd class="text-slate-200">{doc.review_due ? fmtDate(doc.review_due) : '—'}</dd></div>
    <div><dt class="text-xs text-slate-500">Review cycle (days)</dt><dd class="text-slate-200">{doc.review_cycle_days ?? '—'}</dd></div>
  </dl>

  {#if doc.summary}
    <div>
      <p class="text-xs text-slate-500 mb-1">Summary</p>
      <p class="text-sm text-slate-200 whitespace-pre-wrap">{doc.summary}</p>
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

  <p class="text-xs text-slate-600">Created {fmtDateTime(doc.created_at)} · last updated {fmtDateTime(doc.updated_at)}</p>
</div>

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
