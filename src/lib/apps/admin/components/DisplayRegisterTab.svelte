<!-- src/lib/apps/admin/components/DisplayRegisterTab.svelte -->
<!-- Admin > Display Register (BSA s.82, EXT-14.R5-R7). What must be physically
     displayed in the building — the prescribed AP notice, the latest BAC, any
     compliance notice in force — each with its version/approval/review,
     location, accessible format, responsible person and inspection frequency.
     "Needs attention" (a linked document changed, or a review is due/overdue)
     is computed read-time by displayRegisterStatus.js, not stored. -->
<script>
  import { onMount } from 'svelte';
  import { displayRegisterStore } from '../stores/displayRegisterStore.js';
  import { attentionReason, attentionLabel } from '../utils/displayRegisterStatus.js';
  import { listCurrentDocuments } from '$lib/apps/golden_thread/public.js';
  import { fmtDateOnly, fmtDate } from '$lib/utils/dates';
  import Button         from '$lib/components/common/Button.svelte';
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import ErrorDisplay   from '$lib/components/common/ErrorDisplay.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';
  import ConfirmDialog  from '$lib/components/common/ConfirmDialog.svelte';
  import DisplayItemModal from './DisplayItemModal.svelte';

  $: ({ items, loading, error } = $displayRegisterStore);

  let gtDocUpdatedAt = {};   // gt_document id -> updated_at, for the attention check
  let today = new Date().toISOString().slice(0, 10);

  onMount(async () => {
    if (items.length === 0) displayRegisterStore.load();
    try {
      const docs = await listCurrentDocuments();
      gtDocUpdatedAt = Object.fromEntries(docs.map(d => [d.id, d.updated_at]));
    } catch { gtDocUpdatedAt = {}; }
  });

  function reasonFor(item) {
    return attentionReason(item, {
      todayISO: today,
      linkedDocUpdatedAt: item.linked_gt_document_id ? gtDocUpdatedAt[item.linked_gt_document_id] : null,
    });
  }

  const STATUS_LABEL = {
    displayed:     'Displayed',
    needs_refresh: 'Needs refresh',
    damaged:       'Damaged',
    obstructed:    'Obstructed',
    removed:       'Removed',
  };

  let editing = null;
  let showModal = false;
  let saving = false;
  let pendingDelete = null;
  let deletingId = null;

  // Inline "report an issue" form — one open at a time.
  let issueFor = null;      // item id, or null
  let issueStatus = 'needs_refresh';
  let issueNotes = '';
  let settingStatus = false;

  function openNew()  { editing = null; showModal = true; }
  function openEdit(i) { editing = i; showModal = true; }
  function closeModal() { showModal = false; editing = null; saving = false; }

  async function handleSave(e) {
    const { id, data } = e.detail;
    saving = true;
    try {
      if (id) await displayRegisterStore.save(id, data);
      else    await displayRegisterStore.create(data);
      closeModal();
    } catch {
      saving = false;
    }
  }

  async function markRefreshed(item) {
    await displayRegisterStore.setStatus(item.id, 'displayed');
  }

  function openIssueForm(item) {
    issueFor = item.id; issueStatus = 'needs_refresh'; issueNotes = '';
  }
  function closeIssueForm() { issueFor = null; }

  async function submitIssue() {
    settingStatus = true;
    try {
      await displayRegisterStore.setStatus(issueFor, issueStatus, { notes: issueNotes.trim() || null });
      issueFor = null;
    } finally {
      settingStatus = false;
    }
  }

  function requestDelete(i) { pendingDelete = i; }
  async function confirmDelete() {
    if (!pendingDelete) return;
    deletingId = pendingDelete.id;
    try {
      await displayRegisterStore.remove(pendingDelete.id);
      pendingDelete = null;
    } finally {
      deletingId = null;
    }
  }
</script>

<div class="disp-reg">
  <div class="head">
    <div>
      <h3 class="heading-section">Display Register</h3>
      <p class="text-muted">
        What must be physically displayed in the building — s.82. Track version,
        location and review status; mark it refreshed or report a problem when
        you check it in person.
      </p>
    </div>
    <ProtectedButton requireAdmin={true} variant="primary" on:click={openNew}>+ New item</ProtectedButton>
  </div>

  {#if error}<ErrorDisplay message={error} />{/if}

  {#if loading && items.length === 0}
    <LoadingSpinner />
  {:else if items.length === 0}
    <p class="empty">Nothing in the display register yet — add the AP notice to get started.</p>
  {:else}
    <div class="rows">
      {#each items as i (i.id)}
        {@const reason = reasonFor(i)}
        <div class="row" class:attention={!!reason} class:exception={i.status !== 'displayed'}>
          <div class="row-main">
            <div class="row-title">
              <span class="nm">{i.title}</span>
              <span class="badge status-{i.status}">{STATUS_LABEL[i.status]}</span>
              {#if reason}<span class="badge attn">{attentionLabel(reason)}</span>{/if}
            </div>
            <p class="loc">{i.display_location}</p>
            <div class="meta">
              {#if i.current_version}<span>Version {i.current_version}</span><span class="dot">·</span>{/if}
              <span>Review {fmtDateOnly(i.review_date)}</span>
              <span class="dot">·</span>
              <span>Last refreshed {i.last_refreshed_at ? fmtDate(i.last_refreshed_at) : 'never'}</span>
            </div>
            {#if i.status_notes && i.status !== 'displayed'}
              <p class="notes">{i.status_notes}</p>
            {/if}
          </div>
          <div class="row-actions">
            {#if i.status !== 'displayed'}
              <Button variant="secondary" size="small" on:click={() => markRefreshed(i)}>Mark refreshed</Button>
            {:else}
              <Button variant="secondary" size="small" on:click={() => openIssueForm(i)}>Report issue</Button>
            {/if}
            <Button variant="secondary" size="small" on:click={() => openEdit(i)}>Edit</Button>
            <ProtectedButton requireAdmin={true} variant="danger" size="small" on:click={() => requestDelete(i)}>Delete</ProtectedButton>
          </div>
        </div>

        {#if issueFor === i.id}
          <div class="issue-form">
            <select bind:value={issueStatus} disabled={settingStatus}>
              <option value="needs_refresh">Needs refresh</option>
              <option value="damaged">Damaged</option>
              <option value="obstructed">Obstructed</option>
              <option value="removed">Removed</option>
            </select>
            <input type="text" bind:value={issueNotes} placeholder="Notes (optional)" disabled={settingStatus} />
            <Button variant="primary" size="small" loading={settingStatus} on:click={submitIssue}>Save</Button>
            <Button variant="secondary" size="small" on:click={closeIssueForm} disabled={settingStatus}>Cancel</Button>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <DisplayItemModal
    item={editing}
    {saving}
    on:save={handleSave}
    on:close={closeModal}
  />
{/if}

<ConfirmDialog
  show={!!pendingDelete}
  danger={true}
  processing={!!deletingId}
  title="Delete display item"
  message={pendingDelete ? `Delete "${pendingDelete.title}" from the display register?` : ''}
  confirmText="Delete"
  on:confirm={confirmDelete}
  on:cancel={() => (pendingDelete = null)}
/>

<style>
  .disp-reg { display: flex; flex-direction: column; gap: 1rem; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .empty { color: rgb(148 163 184); font-size: 0.9rem; padding: 1.5rem 0; }
  .rows { display: flex; flex-direction: column; gap: 0.5rem; }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.75rem 1rem; border-radius: 8px;
    background: rgb(30 41 59 / 0.4); border: 1px solid rgb(71 85 105 / 0.5);
  }
  .row.attention { border-color: rgb(251 191 36 / 0.5); }
  .row.exception { border-color: rgb(248 113 113 / 0.5); }
  .row-title { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .nm { font-weight: 600; color: rgb(226 232 240); }
  .badge { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.1rem 0.4rem; border-radius: 4px; }
  .badge.status-displayed { background: rgb(34 197 94 / 0.15); color: rgb(74 222 128); }
  .badge.status-needs_refresh, .badge.status-damaged, .badge.status-obstructed, .badge.status-removed {
    background: rgb(248 113 113 / 0.15); color: rgb(248 113 113);
  }
  .badge.attn { background: rgb(251 191 36 / 0.15); color: rgb(251 191 36); }
  .loc { font-size: 0.8rem; color: rgb(148 163 184); margin-top: 0.2rem; }
  .meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: rgb(148 163 184); margin-top: 0.3rem; flex-wrap: wrap; }
  .notes { font-size: 0.78rem; color: rgb(252 165 165); margin-top: 0.3rem; }
  .row-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
  .issue-form {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem 0.75rem 1rem;
    margin-top: -0.5rem; margin-bottom: 0.25rem;
  }
  .issue-form select, .issue-form input {
    background: rgb(30 41 59); border: 1px solid rgb(71 85 105); border-radius: 6px;
    color: rgb(226 232 240); font-size: 0.8rem; padding: 0.3rem 0.5rem;
  }
  .issue-form input { flex: 1; }
</style>
