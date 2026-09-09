<!-- src/lib/apps/admin/components/DisplayRegisterTab.svelte -->
<!-- Admin > Display Register (BSA s.82, EXT-14.R5-R7). What must be physically
     displayed in the building. The statute names exactly three things: (a) the
     prescribed AP notice, (b) the most recent BAC, (c) any relevant compliance
     notice — (a) and (b) are singular, so migration 199 seeds them as
     permanent slots whose absence ('not_set') stays visible rather than the
     register simply having nothing to show; (c) is genuinely zero-or-many, so
     it's a free list whose empty state ("none in force") is itself compliant.
     "Needs attention" (a linked document changed, or a review is due/overdue)
     is computed read-time by displayRegisterStatus.js, not stored. -->
<script>
  import { onMount } from 'svelte';
  import { displayRegisterStore, SINGLETON_CATEGORIES } from '../stores/displayRegisterStore.js';
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

  $: apNotice = items.find(i => i.category === 'ap_notice') ?? null;
  $: bac      = items.find(i => i.category === 'bac') ?? null;
  $: complianceNotices = items.filter(i => i.category === 'compliance_notice');
  $: otherItems        = items.filter(i => i.category === 'other');

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
    not_set:       'Not yet set',
    displayed:     'Displayed',
    needs_refresh: 'Needs refresh',
    damaged:       'Damaged',
    obstructed:    'Obstructed',
    removed:       'Removed',
  };

  let editing = null;        // item being edited, or null
  let editingCategory = null; // category context for the modal (new items have no item yet)
  let showModal = false;
  let saveError = null;
  let saving = false;
  let pendingDelete = null;
  let deletingId = null;
  let actionError = null;

  // Inline "report an issue" form — one open at a time.
  let issueFor = null;      // item id, or null
  let issueStatus = 'needs_refresh';
  let issueNotes = '';
  let settingStatus = false;

  function openNew(category)  { editing = null; editingCategory = category; showModal = true; saveError = null; }
  function openEdit(i) { editing = i; editingCategory = i.category; showModal = true; saveError = null; }
  function closeModal() { showModal = false; editing = null; editingCategory = null; saving = false; saveError = null; }

  async function handleSave(e) {
    const { id, data } = e.detail;
    saving = true; saveError = null;
    try {
      if (id) await displayRegisterStore.save(id, data);
      else    await displayRegisterStore.create(data);
      closeModal();
    } catch (err) {
      saveError = err.message;
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
    actionError = null;
    try {
      await displayRegisterStore.remove(pendingDelete.id);
      pendingDelete = null;
    } catch (err) {
      actionError = err.message;
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
        What BSA s.82 requires to be displayed in the building — the AP notice,
        the latest BAC, and any compliance notice in force. Mark an item
        refreshed or report a problem when you check it in person.
      </p>
    </div>
  </div>

  {#if error}<ErrorDisplay message={error} />{/if}
  {#if actionError}<ErrorDisplay message={actionError} onDismiss={() => (actionError = null)} />{/if}

  {#if loading && items.length === 0}
    <LoadingSpinner />
  {:else}
    <!-- ── The two statutory singleton slots ─────────────────────────── -->
    <div class="section">
      <h4 class="section-title">Accountable Persons notice</h4>
      {#if apNotice}
        {#if apNotice.status === 'not_set'}
          <div class="not-set-row">
            <p>Not yet recorded — s.82 requires this to be displayed.</p>
            <ProtectedButton requireAdmin={true} variant="primary" size="small" on:click={() => openEdit(apNotice)}>Add details</ProtectedButton>
          </div>
        {:else}
          {@const item = apNotice}
          {@const reason = reasonFor(item)}
          <div class="row" class:attention={!!reason} class:exception={item.status !== 'displayed'}>
            <div class="row-main">
              <div class="row-title">
                <span class="badge status-{item.status}">{STATUS_LABEL[item.status]}</span>
                {#if reason}<span class="badge attn">{attentionLabel(reason)}</span>{/if}
              </div>
              <p class="loc">{item.display_location}</p>
              <div class="meta">
                {#if item.current_version}<span>Version {item.current_version}</span><span class="dot">·</span>{/if}
                <span>Review {fmtDateOnly(item.review_date)}</span>
                <span class="dot">·</span>
                <span>Last refreshed {item.last_refreshed_at ? fmtDate(item.last_refreshed_at) : 'never'}</span>
              </div>
              {#if item.status_notes && item.status !== 'displayed'}<p class="notes">{item.status_notes}</p>{/if}
            </div>
            <div class="row-actions">
              {#if item.status !== 'displayed'}
                <Button variant="secondary" size="small" on:click={() => markRefreshed(item)}>Mark refreshed</Button>
              {:else}
                <Button variant="secondary" size="small" on:click={() => openIssueForm(item)}>Report issue</Button>
              {/if}
              <Button variant="secondary" size="small" on:click={() => openEdit(item)}>Edit</Button>
            </div>
          </div>
          {#if issueFor === item.id}
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
        {/if}
      {/if}
    </div>

    <div class="section">
      <h4 class="section-title">Building Assessment Certificate</h4>
      {#if bac}
        {@const reason = reasonFor(bac)}
        {#if bac.status === 'not_set'}
          <div class="not-set-row">
            <p>Not yet recorded — s.82 requires the most recent BAC to be displayed.</p>
            <ProtectedButton requireAdmin={true} variant="primary" size="small" on:click={() => openEdit(bac)}>Add details</ProtectedButton>
          </div>
        {:else}
          {@const item = bac}
          <div class="row" class:attention={!!reason} class:exception={item.status !== 'displayed'}>
            <div class="row-main">
              <div class="row-title">
                <span class="badge status-{item.status}">{STATUS_LABEL[item.status]}</span>
                {#if reason}<span class="badge attn">{attentionLabel(reason)}</span>{/if}
              </div>
              <p class="loc">{item.display_location}</p>
              <div class="meta">
                {#if item.current_version}<span>Version {item.current_version}</span><span class="dot">·</span>{/if}
                <span>Review {fmtDateOnly(item.review_date)}</span>
                <span class="dot">·</span>
                <span>Last refreshed {item.last_refreshed_at ? fmtDate(item.last_refreshed_at) : 'never'}</span>
              </div>
              {#if item.status_notes && item.status !== 'displayed'}<p class="notes">{item.status_notes}</p>{/if}
            </div>
            <div class="row-actions">
              {#if item.status !== 'displayed'}
                <Button variant="secondary" size="small" on:click={() => markRefreshed(item)}>Mark refreshed</Button>
              {:else}
                <Button variant="secondary" size="small" on:click={() => openIssueForm(item)}>Report issue</Button>
              {/if}
              <Button variant="secondary" size="small" on:click={() => openEdit(item)}>Edit</Button>
            </div>
          </div>
          {#if issueFor === item.id}
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
        {/if}
      {/if}
    </div>

    <!-- ── Compliance notices — zero-or-many; empty is a compliant state ── -->
    <div class="section">
      <div class="section-head">
        <h4 class="section-title">Compliance notices <span class="count">({complianceNotices.length})</span></h4>
        <ProtectedButton requireAdmin={true} variant="secondary" size="small" on:click={() => openNew('compliance_notice')}>+ Add compliance notice</ProtectedButton>
      </div>
      {#if complianceNotices.length === 0}
        <p class="empty">None currently in force.</p>
      {:else}
        <div class="rows">
          {#each complianceNotices as item (item.id)}
            {@const reason = reasonFor(item)}
            <div class="row" class:attention={!!reason} class:exception={item.status !== 'displayed'}>
              <div class="row-main">
                <div class="row-title">
                  <span class="nm">{item.title}</span>
                  <span class="badge status-{item.status}">{STATUS_LABEL[item.status]}</span>
                  {#if reason}<span class="badge attn">{attentionLabel(reason)}</span>{/if}
                </div>
                <p class="loc">{item.display_location}</p>
                <div class="meta">
                  {#if item.current_version}<span>Version {item.current_version}</span><span class="dot">·</span>{/if}
                  <span>Review {fmtDateOnly(item.review_date)}</span>
                </div>
                {#if item.status_notes && item.status !== 'displayed'}<p class="notes">{item.status_notes}</p>{/if}
              </div>
              <div class="row-actions">
                {#if item.status !== 'displayed'}
                  <Button variant="secondary" size="small" on:click={() => markRefreshed(item)}>Mark refreshed</Button>
                {:else}
                  <Button variant="secondary" size="small" on:click={() => openIssueForm(item)}>Report issue</Button>
                {/if}
                <Button variant="secondary" size="small" on:click={() => openEdit(item)}>Edit</Button>
                <ProtectedButton requireAdmin={true} variant="danger" size="small" on:click={() => requestDelete(item)}>Delete</ProtectedButton>
              </div>
            </div>
            {#if issueFor === item.id}
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

    <!-- ── Anything else worth tracking alongside the statutory set ──────── -->
    <div class="section">
      <div class="section-head">
        <h4 class="section-title">Other</h4>
        <ProtectedButton requireAdmin={true} variant="secondary" size="small" on:click={() => openNew('other')}>+ Add other item</ProtectedButton>
      </div>
      {#if otherItems.length === 0}
        <p class="empty">Nothing else tracked.</p>
      {:else}
        <div class="rows">
          {#each otherItems as item (item.id)}
            {@const reason = reasonFor(item)}
            <div class="row" class:attention={!!reason} class:exception={item.status !== 'displayed'}>
              <div class="row-main">
                <div class="row-title">
                  <span class="nm">{item.title}</span>
                  <span class="badge status-{item.status}">{STATUS_LABEL[item.status]}</span>
                  {#if reason}<span class="badge attn">{attentionLabel(reason)}</span>{/if}
                </div>
                <p class="loc">{item.display_location}</p>
                <div class="meta">
                  {#if item.current_version}<span>Version {item.current_version}</span><span class="dot">·</span>{/if}
                  <span>Review {fmtDateOnly(item.review_date)}</span>
                </div>
                {#if item.status_notes && item.status !== 'displayed'}<p class="notes">{item.status_notes}</p>{/if}
              </div>
              <div class="row-actions">
                {#if item.status !== 'displayed'}
                  <Button variant="secondary" size="small" on:click={() => markRefreshed(item)}>Mark refreshed</Button>
                {:else}
                  <Button variant="secondary" size="small" on:click={() => openIssueForm(item)}>Report issue</Button>
                {/if}
                <Button variant="secondary" size="small" on:click={() => openEdit(item)}>Edit</Button>
                <ProtectedButton requireAdmin={true} variant="danger" size="small" on:click={() => requestDelete(item)}>Delete</ProtectedButton>
              </div>
            </div>
            {#if issueFor === item.id}
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
  {/if}
</div>

{#if showModal}
  <DisplayItemModal
    item={editing}
    category={editingCategory}
    saving={saving}
    on:save={handleSave}
    on:close={closeModal}
  />
  {#if saveError}<p class="save-error">{saveError}</p>{/if}
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
  .disp-reg { display: flex; flex-direction: column; gap: 1.5rem; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .section { display: flex; flex-direction: column; gap: 0.5rem; }
  .section-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .section-title { font-size: 0.85rem; font-weight: 600; color: rgb(203 213 225); text-transform: uppercase; letter-spacing: 0.04em; }
  .count { font-weight: 400; text-transform: none; letter-spacing: normal; color: rgb(148 163 184); }
  .empty { color: rgb(148 163 184); font-size: 0.85rem; }
  .not-set-row {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    padding: 0.75rem 1rem; border-radius: 8px;
    background: rgb(251 191 36 / 0.08); border: 1px dashed rgb(251 191 36 / 0.4);
  }
  .not-set-row p { font-size: 0.85rem; color: rgb(251 191 36); }
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
  .badge.status-not_set { background: rgb(148 163 184 / 0.15); color: rgb(148 163 184); }
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
  .save-error {
    position: fixed; bottom: 1rem; left: 50%; transform: translateX(-50%); z-index: 60;
    background: rgb(127 29 29); color: rgb(254 226 226); border: 1px solid rgb(248 113 113 / 0.5);
    border-radius: 8px; padding: 0.5rem 1rem; font-size: 0.85rem;
  }
</style>
