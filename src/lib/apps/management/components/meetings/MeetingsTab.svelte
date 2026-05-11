<!-- src/lib/apps/management/components/meetings/MeetingsTab.svelte -->
<!--
  Full-page Meetings tab for the Management app.

  Two view states:
    list    — all meetings (open one highlighted in amber at top, past below)
    detail  — MeetingMinutesView for a selected meeting, with a back button

  Meeting CRUD (create / edit / close / reopen / delete) all lives here,
  replacing the old MeetingsModal. MeetingForm is opened as a modal.
-->
<script>
  import { onMount }            from 'svelte';
  import { meetingsStore }      from '../../stores/meetingsStore';
  import { permissions }        from '$lib/stores/permissions';
  import { fmtDate, fmtDateTime } from '$lib/utils/dates';
  import Button                 from '$lib/components/common/Button.svelte';
  import ProtectedButton        from '$lib/components/common/ProtectedButton.svelte';
  import ConfirmDialog          from '$lib/components/common/ConfirmDialog.svelte';
  import ErrorDisplay           from '$lib/components/common/ErrorDisplay.svelte';
  import MeetingForm            from './MeetingForm.svelte';
  import MeetingMinutesView     from './MeetingMinutesView.svelte';
  import MeetingAssignModal     from './MeetingAssignModal.svelte';

  // All issues (unfiltered by status/search) — used for item counts
  // and passed to MeetingMinutesView.
  export let issues            = [];
  // Optional: auto-select this meeting on mount (set by badge click in Issues tab).
  export let initialMeetingId  = null;

  // -- View state -------------------------------------------------------
  let selectedMeeting   = null;   // null = list view; object = detail view

  // -- Form state -------------------------------------------------------
  let showForm          = false;
  let editingMeeting    = null;
  let saving            = false;
  let pageError         = '';

  // -- Assign modal (admin only) ----------------------------------------
  let showAssignModal = false;

  // -- Delete confirm ---------------------------------------------------
  let pendingDeleteMeeting = null;
  let showDeleteConfirm    = false;

  // -- Auto-select on mount (badge click from Issues tab) ---------------
  onMount(() => {
    if (initialMeetingId) {
      const m = $meetingsStore.list.find(m => m.id === initialMeetingId);
      if (m) selectedMeeting = m;
    }
  });

  // -- Keep selectedMeeting in sync with store updates ------------------
  $: if (selectedMeeting) {
    const updated = $meetingsStore.list.find(m => m.id === selectedMeeting.id);
    if (updated) selectedMeeting = updated;
  }

  // -- Derived ----------------------------------------------------------
  $: latestClosedId = (() => {
    const closed = $meetingsStore.list.filter(m => m.status === 'closed');
    return closed.length ? closed[0].id : null;
  })();

  $: pastMeetings = $meetingsStore.list.filter(m => m.status === 'closed');

  // Per-meeting item counts, computed from the live issues prop.
  $: itemCounts = (() => {
    const out = {};
    const bump = (mid, key) => {
      if (!mid) return;
      if (!out[mid]) out[mid] = { issues: 0, activities: 0, decisions: 0, actions: 0 };
      out[mid][key]++;
    };
    for (const issue of issues) {
      bump(issue.meeting_id, 'issues');
      for (const a of issue.activities || []) {
        if (a.activity_type === 'decision') bump(a.meeting_id, 'decisions');
        else bump(a.meeting_id, 'activities');
      }
      for (const a of issue.actions || []) bump(a.meeting_id, 'actions');
    }
    return out;
  })();

  // Issues that belong to the selected meeting (for MeetingMinutesView).
  $: meetingIssues = selectedMeeting
    ? issues.filter(issue =>
        issue.meeting_id === selectedMeeting.id ||
        (issue.activities || []).some(a => a.meeting_id === selectedMeeting.id) ||
        (issue.actions    || []).some(a => a.meeting_id === selectedMeeting.id)
      )
    : [];

  // -- Helpers ----------------------------------------------------------
  function fmtCounts(meetingId) {
    const c = itemCounts[meetingId] ?? { issues: 0, activities: 0, decisions: 0, actions: 0 };
    const parts = [];
    if (c.issues)     parts.push(`${c.issues} issue${c.issues         === 1 ? '' : 's'}`);
    if (c.actions)    parts.push(`${c.actions} action${c.actions      === 1 ? '' : 's'}`);
    if (c.activities) parts.push(`${c.activities} activit${c.activities === 1 ? 'y' : 'ies'}`);
    if (c.decisions)  parts.push(`${c.decisions} decision${c.decisions  === 1 ? '' : 's'}`);
    return parts.length ? parts.join(' · ') : 'no items tagged';
  }

  function fmtParticipants(p) {
    const names = (p?.profile_ids ?? []).length;
    const ext   = (p?.extras      ?? []).length;
    if (!names && !ext) return '—';
    return [
      names && `${names} user${names === 1 ? '' : 's'}`,
      ext   && `${ext} external`
    ].filter(Boolean).join(', ');
  }

  // -- Navigation -------------------------------------------------------
  function viewMeeting(m) { selectedMeeting = m; }
  function backToList()   { selectedMeeting = null; }

  // -- Form handlers ----------------------------------------------------
  function openCreate()  { editingMeeting = null; showForm = true; }
  function openEdit(m)   { editingMeeting = m;    showForm = true; }
  function closeForm()   { showForm = false; editingMeeting = null; }

  async function handleSubmit({ detail }) {
    saving    = true;
    pageError = '';
    const result = editingMeeting
      ? await meetingsStore.update(editingMeeting.id, detail)
      : await meetingsStore.create(detail);
    saving = false;
    if (!result.success) { pageError = result.error ?? 'Failed to save meeting'; return; }
    closeForm();
  }

  // -- Lifecycle handlers -----------------------------------------------
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
</script>

<!-- ─── DETAIL VIEW: minutes for a selected meeting ──────────────────── -->
{#if selectedMeeting}
  <div class="mb-4 flex items-center gap-3 flex-wrap">
    <Button variant="secondary" size="small" on:click={backToList}>
      ← All meetings
    </Button>

    <div class="flex-1 min-w-0" aria-hidden="true"></div>

    <ProtectedButton
      action="modify"
      variant="secondary"
      size="small"
      icon="edit"
      on:click={() => openEdit(selectedMeeting)}
    >
      Edit
    </ProtectedButton>

    {#if $permissions.isAdmin}
      <ProtectedButton
        requireAdmin={true}
        variant="secondary"
        size="small"
        on:click={() => showAssignModal = true}
        title="Assign existing issues / comments / actions to this meeting"
      >
        Assign existing items
      </ProtectedButton>
    {/if}

    {#if selectedMeeting.status === 'open'}
      <ProtectedButton
        action="modify"
        variant="primary"
        size="small"
        icon="close"
        on:click={() => handleClose(selectedMeeting)}
      >
        Close meeting
      </ProtectedButton>
    {:else if selectedMeeting.id === latestClosedId}
      <ProtectedButton
        action="modify"
        variant="secondary"
        size="small"
        icon="refresh"
        on:click={() => handleReopen(selectedMeeting)}
        title="Re-open this meeting to add more items"
      >
        Reopen
      </ProtectedButton>
    {/if}
  </div>

  <ErrorDisplay message={pageError} onDismiss={() => pageError = ''} />

  <MeetingMinutesView meeting={selectedMeeting} issues={meetingIssues} />

<!-- ─── LIST VIEW: all meetings ──────────────────────────────────────── -->
{:else}
  <!-- Toolbar -->
  <div class="flex items-center justify-between gap-3 mb-4">
    <p class="text-sm text-slate-400">
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
      title={$meetingsStore.current
        ? `Close "${$meetingsStore.current.title}" before creating a new one`
        : 'Create a new meeting'}
      on:click={openCreate}
    >
      New meeting
    </ProtectedButton>
  </div>

  <ErrorDisplay message={pageError} onDismiss={() => pageError = ''} />

  {#if !$meetingsStore.loaded}
    <p class="text-sm text-slate-500 italic animate-pulse">Loading meetings…</p>

  {:else if $meetingsStore.list.length === 0}
    <div class="text-center py-16 text-slate-500 italic">
      No meetings yet. Click <strong class="text-slate-300">New meeting</strong> to start one.
    </div>

  {:else}
    <!-- ── Currently open meeting (amber card) ── -->
    {#if $meetingsStore.current}
      {@const m = $meetingsStore.current}
      <div class="rounded-xl border-2 border-amber-500/60 bg-amber-900/15 p-4 mb-6 shadow shadow-amber-500/10">
        <div class="flex items-start justify-between gap-3 flex-wrap">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="text-amber-300">🟡</span>
              <span class="font-semibold text-white text-base">{m.title}</span>
              <span class="text-xs px-1.5 py-0.5 rounded bg-amber-600/30 text-amber-200 font-mono border border-amber-500/30">
                open
              </span>
              <span class="text-xs text-slate-400">{fmtDate(m.meeting_date)} · {m.meeting_type}</span>
            </div>
            {#if m.notes}
              <p class="text-sm text-slate-300 mb-2 whitespace-pre-wrap line-clamp-3">{m.notes}</p>
            {/if}
            <div class="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
              <span>👥 {fmtParticipants(m.participants)}</span>
              <span>·</span>
              <span>📋 {fmtCounts(m.id)}</span>
              <span>·</span>
              <span class="text-amber-300/80">Opened {fmtDateTime(m.opened_at)}</span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-1.5 shrink-0">
            <Button
              variant="secondary"
              size="small"
              on:click={() => viewMeeting(m)}
            >
              View minutes
            </Button>
            <ProtectedButton
              action="modify"
              variant="secondary"
              size="small"
              icon="edit"
              iconPosition="only"
              on:click={() => openEdit(m)}
              title="Edit meeting details"
            />
            <ProtectedButton
              action="modify"
              variant="primary"
              size="small"
              icon="close"
              on:click={() => handleClose(m)}
            >
              Close meeting
            </ProtectedButton>
          </div>
        </div>
      </div>
    {/if}

    <!-- ── Past meetings list ── -->
    {#if pastMeetings.length > 0}
      {#if $meetingsStore.current}
        <h3 class="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
          Past meetings
        </h3>
      {/if}

      <div class="space-y-2">
        {#each pastMeetings as m (m.id)}
          {@const canReopen = m.id === latestClosedId}
          <div class="rounded-lg border border-slate-600/60 bg-slate-700/40 p-3">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="font-semibold text-white">{m.title}</span>
                  <span class="text-xs text-slate-400">{fmtDate(m.meeting_date)} · {m.meeting_type}</span>
                </div>
                {#if m.notes}
                  <p class="text-sm text-slate-400 mt-0.5 line-clamp-2 whitespace-pre-wrap">{m.notes}</p>
                {/if}
                <div class="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                  <span>👥 {fmtParticipants(m.participants)}</span>
                  <span>·</span>
                  <span>📋 {fmtCounts(m.id)}</span>
                  {#if m.closed_at}
                    <span>·</span>
                    <span>Closed {fmtDateTime(m.closed_at)}</span>
                  {/if}
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="small"
                  on:click={() => viewMeeting(m)}
                >
                  View minutes
                </Button>

                {#if canReopen}
                  <ProtectedButton
                    action="modify"
                    variant="secondary"
                    size="small"
                    icon="refresh"
                    on:click={() => handleReopen(m)}
                    title="Re-open this meeting to add more items"
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
                  title="Edit meeting details"
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
  {/if}
{/if}

<!-- ─── Create / edit form ────────────────────────────────────────────── -->
<MeetingForm
  bind:show={showForm}
  meeting={editingMeeting}
  {saving}
  on:submit={handleSubmit}
  on:close={closeForm}
/>

<!-- ─── Assign existing items (admin migration tool) ─────────────────── -->
<MeetingAssignModal
  bind:show={showAssignModal}
  meeting={selectedMeeting}
  {issues}
/>

<!-- ─── Delete confirm ───────────────────────────────────────────────── -->
<ConfirmDialog
  show={showDeleteConfirm}
  title="Delete meeting"
  message={pendingDeleteMeeting
    ? `Delete "${pendingDeleteMeeting.title}"? Items tagged to it keep their content but lose the meeting tag. This cannot be undone.`
    : 'Delete this meeting?'}
  confirmText="Delete Meeting"
  cancelText="Cancel"
  danger={true}
  on:confirm={confirmDelete}
  on:cancel={cancelDelete}
/>
