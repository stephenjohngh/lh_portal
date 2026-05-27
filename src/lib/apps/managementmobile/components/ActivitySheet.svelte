<script>
  // src/lib/apps/managementmobile/components/ActivitySheet.svelte
  // Bottom sheet showing a single activity in full.
  // Drag down >30% to dismiss; tap backdrop to dismiss.

  import { createEventDispatcher, onDestroy } from 'svelte';
  import { ACTIVITY_TYPE_CONFIG, ACTIVITY_TYPE } from '$lib/utils/constants.js';
  import { fmtDateTime, wasModified } from '$lib/utils/dates.js';
  import { fmtBytes, mimeIcon } from '$lib/utils/files.js';

  export let activity = null;   // activity row

  const dispatch = createEventDispatcher();

  $: cfg = activity
    ? (ACTIVITY_TYPE_CONFIG[activity.activity_type] ?? ACTIVITY_TYPE_CONFIG[ACTIVITY_TYPE.COMMENT])
    : null;

  // -- Drag to dismiss --------------------------------------------------
  let sheetEl;
  let dragStartY   = null;
  let dragCurrentY = 0;
  let dragging     = false;

  function onDragStart(e) {
    const t = e.type === 'touchstart' ? e.touches[0] : e;
    dragStartY   = t.clientY;
    dragCurrentY = 0;
    dragging     = false;
  }

  function onDragMove(e) {
    if (dragStartY == null) return;
    const t = e.type === 'touchmove' ? e.touches[0] : e;
    dragCurrentY = t.clientY - dragStartY;
    dragging     = true;
    if (sheetEl && dragCurrentY > 0) {
      sheetEl.style.transform = `translateY(${dragCurrentY}px)`;
    }
  }

  function onDragEnd() {
    if (sheetEl) sheetEl.style.transform = '';
    const threshold = sheetEl ? sheetEl.clientHeight * 0.3 : 80;
    if (dragging && dragCurrentY > threshold) dispatch('close');
    dragStartY   = null;
    dragCurrentY = 0;
    dragging     = false;
  }

  function dismiss() { dispatch('close'); }

  // -- Body rendering ---------------------------------------------------
  function isHtml(body) {
    return typeof body === 'string' && body.trimStart().startsWith('<');
  }

  // Strip HTML tags to extract plain text for the structured fields
  function stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" on:click={dismiss}></div>

<!-- Sheet -->
<div
  class="sheet"
  bind:this={sheetEl}
  role="dialog"
  aria-modal="true"
  aria-label="Activity detail"
>
  <!-- Drag handle -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="drag-handle-area"
    on:mousedown={onDragStart}
    on:mousemove={onDragMove}
    on:mouseup={onDragEnd}
    on:touchstart={onDragStart}
    on:touchmove|passive={onDragMove}
    on:touchend={onDragEnd}
  >
    <div class="drag-handle" aria-hidden="true"></div>
  </div>

  {#if activity && cfg}
    <div class="sheet-scroll">

      <!-- Type badge + date header -->
      <div class="activity-header">
        <span class="type-badge" style="color:{cfg.borderColor.replace('border-','').includes('-') ? 'inherit' : cfg.borderColor};">
          {cfg.icon} {cfg.label}
        </span>
        <span class="activity-date">
          {fmtDateTime(activity.created_at, activity.created_by_profile?.full_name)}
        </span>
        {#if activity.historic}
          <span class="historic-badge">Historic</span>
        {/if}
      </div>

      <!-- Structured fields (email, letter, meeting etc.) -->
      {#if cfg.fields.length > 0}
        {@const f = activity.fields ?? {}}
        {#each cfg.fields as field}
          {#if f[field.key] && field.key !== 'summary'}
            <div class="field-row">
              <span class="field-label">{field.label}</span>
              <span class="field-value">{f[field.key]}</span>
            </div>
          {/if}
        {/each}
        <!-- Summary shown below body -->
      {/if}

      <!-- Document attachment -->
      {#if activity.activity_type === ACTIVITY_TYPE.DOCUMENT && activity.fields?.doc_id}
        <div class="doc-row">
          <span class="doc-icon">{mimeIcon(activity.fields.mime_type)}</span>
          <div class="doc-info">
            <p class="doc-name">{activity.fields.display_name || activity.fields.filename}</p>
            {#if activity.fields.file_size}
              <p class="doc-size">{fmtBytes(activity.fields.file_size)}</p>
            {/if}
          </div>
          {#if activity.fields.web_view_url}
            <a
              href={activity.fields.web_view_url}
              target="_blank"
              rel="noopener noreferrer"
              class="doc-open"
            >↗ Open</a>
          {/if}
        </div>
      {/if}

      <!-- Body -->
      {#if activity.body}
        <div class="body-content">
          {#if isHtml(activity.body)}
            <div class="rich-content">{@html activity.body}</div>
          {:else}
            <p class="plain-body">{activity.body}</p>
          {/if}
        </div>
      {/if}

      <!-- Summary line (notes/email/etc.) -->
      {#if activity.fields?.summary}
        <div class="summary-row">
          <span class="summary-label">Summary</span>
          <span class="summary-text">{activity.fields.summary}</span>
        </div>
      {/if}

      <!-- Modified timestamp -->
      {#if wasModified(activity.created_at, activity.updated_at)}
        <p class="modified-note">
          Modified: {fmtDateTime(activity.updated_at, activity.updated_by_profile?.full_name)}
        </p>
      {/if}

      <!-- Close button -->
      <button class="close-btn" on:click={dismiss}>Close</button>

    </div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 140;
  }

  .sheet {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    height: 82vh;
    background: #1a1a2e;
    border-radius: 16px 16px 0 0;
    z-index: 150;
    display: flex;
    flex-direction: column;
    max-width: 640px;
    margin: 0 auto;
    transition: transform 0.25s ease-out;
  }

  .drag-handle-area {
    padding: 10px 0 4px;
    flex-shrink: 0;
    cursor: grab;
    display: flex;
    justify-content: center;
  }

  .drag-handle {
    width: 36px;
    height: 4px;
    background: #334155;
    border-radius: 2px;
  }

  .sheet-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 4px 18px 40px;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }

  /* ── Activity header ── */
  .activity-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid #252540;
  }

  .type-badge {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    color: #818cf8;
  }

  .activity-date {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #475569;
    flex: 1;
    text-align: right;
  }

  .historic-badge {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: #f59e0b;
    background: #2a200a;
    padding: 1px 6px;
    border-radius: 8px;
    border: 1px solid #3d2e0a;
  }

  /* ── Structured fields ── */
  .field-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    margin-bottom: 6px;
  }

  .field-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    flex-shrink: 0;
    min-width: 64px;
  }

  .field-value {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #94a3b8;
    word-break: break-word;
  }

  /* ── Document attachment ── */
  .doc-row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #13131f;
    border: 1px solid #252540;
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
  }

  .doc-icon { font-size: 20px; flex-shrink: 0; }

  .doc-info {
    flex: 1;
    min-width: 0;
  }

  .doc-name {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #e2e8f0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .doc-size {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #475569;
    margin: 2px 0 0;
  }

  .doc-open {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #818cf8;
    text-decoration: none;
    white-space: nowrap;
    padding: 4px 8px;
    border: 1px solid #818cf840;
    border-radius: 6px;
    flex-shrink: 0;
  }

  /* ── Body ── */
  .body-content {
    margin-bottom: 12px;
  }

  .plain-body {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    color: #e2e8f0;
    line-height: 1.6;
    white-space: pre-wrap;
    margin: 0;
  }

  /* Rich text from Tiptap */
  .rich-content {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    color: #e2e8f0;
    line-height: 1.6;
  }

  :global(.rich-content p)          { margin: 0 0 0.6em; }
  :global(.rich-content p:last-child) { margin-bottom: 0; }
  :global(.rich-content strong)     { color: #f1f5f9; font-weight: 700; }
  :global(.rich-content em)         { color: #cbd5e1; font-style: italic; }
  :global(.rich-content ul)         { padding-left: 1.4em; margin: 0.4em 0; }
  :global(.rich-content ol)         { padding-left: 1.4em; margin: 0.4em 0; }
  :global(.rich-content li)         { margin-bottom: 0.2em; }
  :global(.rich-content a)          { color: #818cf8; }
  :global(.rich-content blockquote) { border-left: 3px solid #334155; padding-left: 10px; color: #94a3b8; margin: 6px 0; }
  :global(.rich-content code)       { background: #1e2035; padding: 1px 4px; border-radius: 3px; font-size: 12px; }

  /* ── Summary ── */
  .summary-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    background: #13131f;
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 10px;
  }

  .summary-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
    flex-shrink: 0;
  }

  .summary-text {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
  }

  /* ── Modified ── */
  .modified-note {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #334155;
    margin: 0 0 16px;
  }

  /* ── Close button ── */
  .close-btn {
    width: 100%;
    min-height: 44px;
    background: transparent;
    border: 1px solid #252540;
    border-radius: 8px;
    color: #475569;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    cursor: pointer;
    touch-action: manipulation;
    margin-top: 8px;
  }
</style>
