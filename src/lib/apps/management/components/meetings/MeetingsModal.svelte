<!-- src/lib/apps/issues/components/meetings/MeetingsModal.svelte -->
<!--
  Modal for managing meetings: list, create, edit, open / close / reopen,
  delete. Item counts (issues / comments / actions) are computed
  reactively from the live issues data the parent already has.

  Reopen is restricted to the latest closed meeting only (the one with
  the most recent meeting_date among status='closed' rows).

  Per-meeting "View items" sets the meeting filter on IssuesTrackerApp
  via a dispatched event, then closes the modal.
-->
<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { meetingsStore }    from '../../stores/meetingsStore';
  import { permissions }      from '$lib/stores/permissions';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';
  import Modal                from '$lib/components/common/Modal.svelte';
  import Button               from '$lib/components/common/Button.svelte';
  import ProtectedButton      from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog        from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay         from '$lib/components/common/ErrorDisplay.svelte';
  import MeetingForm          from './MeetingForm.svelte';

  export let show   = false;
  export let issues = [];   // live issues list — used to derive item counts

  const dispatch = createEventDispatcher();

  let showForm    = false;
  let editing     = null;     // meeting being edited, or null = create
  let saving      = false;
  let pageError   = '';

  let pendingDeleteMeeting = null;
  let showDeleteConfirm    = false;

  onMount(() => meetingsStore.load());

  // -- Derived: latest closed meeting (only this one is reopen-able) --
  $: latestClosedId = (() => {
    const closed = $meetingsStore.list.filter(m => m.status === 'closed');
    if (!closed.length) return null;
    // list is already date-desc sorted in the store; the first closed is latest
    return closed[0].id;
  })();

  // -- Derived: per-meeting item counts ------------------------------
  // Walk the issues prop once, build { meetingId: { issues, comments, actions } }
  $: itemCounts = (() => {
    const out = {};
    const bump = (mid, key) => {
      if (!mid) return;
      if (!out[mid]) out[mid] = { issues: 0, comments: 0, decisions: 0, actions: 0 };
      out[mid][key]++;
    };
    for (const issue of issues) {
      bump(issue.meeting_id, 'issues');
      for (const a of issue.activities || []) {
        if (a.activity_type === 'decision') bump(a.meeting_id, 'decisions');
        else bump(a.meeting_id, 'comments');
      }
      for (const a of issue.actions || []) bump(a.meeting_id, 'actions');
    }
    return out;
  })();

  // -- Form handlers --------------------------------------------------
  function openCreate() { editing = null;     showForm = true; }
  function openEdit(m)  { editing = m;        showForm = true; }
  function closeForm()  { showForm = false;   editing = null;  }

  async function handleSubmit({ detail }) {
    saving    = true;
    pageError = '';
    const result = editing
      ? await meetingsStore.update(editing.id, detail)
      : await meetingsStore.create(detail);
    saving = false;
    if (!result.success) { pageError = result.error ?? 'Failed to save meeting'; return; }
    closeForm();
  }

  // -- Lifecycle handlers --------------------------------------------
  async function handleOpen(meeting) {
    pageError = '';
    const result = await meetingsStore.open(meeting.id);
    if (!result.success) pageError = result.error ?? 'Failed to open meeting';
  }
  async function handleClose(meeting) {
    pageError = '';
    const result = await meetingsStore.close(meeting.id);
    if (!result.success) pageError = result.error ?? 'Failed to close meeting';
  }
  async function handleReopen(meeting) {
    pageError = '';
    const result = await meetingsStore.reopen(meeting.id);
    if (!result.success) pageError = result.error ?? 'Failed to reopen meeting';
  }

  function requestDelete(m) {
    pendingDeleteMeeting = m;
    showDeleteConfirm    = true;
  }
  async function confirmDelete() {
    pageError = '';
    const result = await meetingsStore.delete(pendingDeleteMeeting.id);
    showDeleteConfirm    = false;
    pendingDeleteMeeting = null;
    if (!result.success) pageError = result.error ?? 'Failed to delete meeting';
  }
  function cancelDelete() {
    showDeleteConfirm    = false;
    pendingDeleteMeeting = null;
  }

  function viewItems(meeting) {
    dispatch('viewItems', { meetingId: meeting.id });
    show = false;
  }

  // -- Counters for one meeting --------------------------------------
  function fmtCounts(meetingId) {
    const c = itemCounts[meetingId] ?? { issues: 0, comments: 0, decisions: 0, actions: 0 };
    const parts = [];
    if (c.issues)    parts.push(`${c.issues} issue${c.issues     === 1 ? '' : 's'}`);
    if (c.actions)   parts.push(`${c.actions} action${c.actions   === 1 ? '' : 's'}`);
    if (c.comments)  parts.push(`${c.comments} comment${c.comments === 1 ? '' : 's'}`);
    if (c.decisions) parts.push(`${c.decisions} decision${c.decisions === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'no items tagged';
  }

  // -- Participant pretty-print --------------------------------------
  function fmtParticipants(p) {
    const names = (p?.profile_ids ?? []).length;
    const ext   = (p?.extras      ?? []).length;
    if (!names && !ext) return '—';
    return [
      names && `${names} user${names === 1 ? '' : 's'}`,
      ext   && `${ext} external`
    ].filter(Boolean).join(', ');
  }
</script>

<Modal
  bind:show
  title="Meetings"
  size="large"
  on:close
>
  <div class="space-y-3">
    <ErrorDisplay message={pageError} onDismiss={() => pageError = ''} />

    <div class="flex items-center justify-between gap-2">
      <p class="text-sm text-gray-400">
        {$meetingsStore.list.length}
        {$meetingsStore.list.length === 1 ? 'meeting' : 'meetings'}
        {#if $meetingsStore.current}
          · <span class="text-amber-300">1 currently open</span>
        {/if}
      </p>
      <ProtectedButton
        action="modify"
        variant="primary"
        size="small"
        icon="plus"
        disabled={!!$meetingsStore.current}
        on:click={openCreate}
        title={$meetingsStore.current
          ? `Close "${$meetingsStore.current.title}" first — only one meeting can be open at a time.`
          : 'Create a new meeting'}
      >
        New meeting
      </ProtectedButton>
    </div>

    {#if !$meetingsStore.loaded}
      <p class="text-sm text-gray-500 italic animate-pulse">Loading meetings…</p>
    {:else if $meetingsStore.list.length === 0}
      <div class="text-center py-12 text-gray-500 italic">
        No meetings yet. Click <strong class="text-gray-300">New meeting</strong> to start one.
      </div>
    {:else}
      <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {#each $meetingsStore.list as m (m.id)}
          {@const isOpen        = m.status === 'open'}
          {@const canReopen     = m.status === 'closed' && m.id === latestClosedId}
          <div class="rounded-lg border p-3
                       {isOpen
                         ? 'bg-amber-900/15 border-amber-700/50'
                         : 'bg-slate-700/40 border-slate-600/60'}">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="font-semibold text-white">{m.title}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded font-mono
                               {isOpen
                                 ? 'bg-amber-600/30 text-amber-200'
                                 : 'bg-slate-600/40 text-slate-300'}">
                    {m.status}
                  </span>
                  <span class="text-xs text-slate-400">{fmtDate(m.meeting_date)} · {m.meeting_type}</span>
                </div>
                {#if m.notes}
                  <p class="text-sm text-gray-300 mt-1 whitespace-pre-wrap line-clamp-3">{m.notes}</p>
                {/if}
                <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500 flex-wrap">
                  <span>👥 {fmtParticipants(m.participants)}</span>
                  <span>•</span>
                  <span>📋 {fmtCounts(m.id)}</span>
                  {#if isOpen}
                    <span>•</span>
                    <span class="text-amber-300">Opened {fmtDateTime(m.opened_at)}</span>
                  {:else if m.closed_at}
                    <span>•</span>
                    <span>Closed {fmtDateTime(m.closed_at)}</span>
                  {/if}
                </div>
              </div>

              <!-- Action buttons -->
              <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="small"
                  on:click={() => viewItems(m)}
                  title="Filter the issues list to items added during this meeting"
                >
                  View items
                </Button>

                {#if isOpen}
                  <ProtectedButton
                    action="modify"
                    variant="primary"
                    size="small"
                    icon="close"
                    on:click={() => handleClose(m)}
                  >
                    Close
                  </ProtectedButton>
                {:else if canReopen}
                  <ProtectedButton
                    action="modify"
                    variant="primary"
                    size="small"
                    icon="refresh"
                    on:click={() => handleReopen(m)}
                    title="Re-open the latest meeting to add more items"
                  >
                    Reopen
                  </ProtectedButton>
                {/if}

                <ProtectedButton
                  action="modify"
                  variant="secondary"
                  size="small"
                  icon="edit"
                  iconPosition="only"
                  on:click={() => openEdit(m)}
                  title="Edit details"
                />

                {#if $permissions.isAdmin}
                  <ProtectedButton
                    requireAdmin={true}
                    variant="danger"
                    size="small"
                    icon="delete"
                    iconPosition="only"
                    on:click={() => requestDelete(m)}
                    title="Delete meeting (admin only)"
                  />
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => show = false}>Close</Button>
  </div>
</Modal>

<!-- ─── Create / edit form modal ─────────────────────────────── -->
<MeetingForm
  bind:show={showForm}
  meeting={editing}
  {saving}
  on:submit={handleSubmit}
  on:close={closeForm}
/>

<!-- ─── Delete confirm ──────────────────────────────────────── -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete meeting"
  message={pendingDeleteMeeting
    ? `Delete the meeting "${pendingDeleteMeeting.title}"? Items tagged to it will keep their content but lose the meeting tag. This cannot be undone.`
    : 'Delete this meeting?'}
  confirmText="Delete Meeting"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDelete}
  on:cancel={cancelDelete}
/>
