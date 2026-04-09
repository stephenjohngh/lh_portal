<script>
  // src/lib/apps/v2plan/components/ComponentSheet.svelte
  // Read-only bottom sheet showing component detail.
  // States: hidden | half (55vh) | full (90vh)
  // Drag handle; drag down >30% to dismiss; tap backdrop to dismiss.

  import { createEventDispatcher, onDestroy } from 'svelte';
  import { v2planStore } from '../stores/v2planStore.js';
  import { fmtDateTime } from '$lib/utils/dates.js';

  const dispatch = createEventDispatcher();

  export let component   = null;   // component row
  export let types       = [];
  export let attrDefs    = {};     // { [typeId]: attr defs[] } (unused here — attrs come from store)
  export let inspections = {};     // { [componentId]: latest inspection }

  // ── Sheet state ──────────────────────────────────────────────────────────────

  let sheetState   = 'hidden';  // 'hidden' | 'half' | 'full'
  let loadingAttrs = false;

  $: if (component) {
    sheetState = 'half';
    loadAttrs();
  } else {
    sheetState = 'hidden';
  }

  async function loadAttrs() {
    if (!component) return;
    loadingAttrs = true;
    await v2planStore.loadComponentAttrs(component.id);
    loadingAttrs = false;
  }

  // ── Subscribe to store for componentAttrs ─────────────────────────────────────

  let componentAttrs = {};
  const unsub = v2planStore.subscribe(s => {
    componentAttrs = s.componentAttrs;
  });
  onDestroy(() => unsub());

  $: attrs = component ? (componentAttrs[component.id] ?? []) : [];

  // ── Attribute display (same rules as report) ─────────────────────────────────

  function fmtAttrs(attrValues) {
    return attrValues
      .filter(a => {
        const v = a.value ?? '';
        return v !== 'None' && v !== 'No' && v !== 'Unknown' && v !== '';
      })
      .map(a => {
        if (a.display_type === 'number')   return `${a.attr_name}: ${a.value}`;
        if (a.display_type === 'dropdown') return a.value;
        return a.attr_name;
      });
  }

  $: fmtAttrList = fmtAttrs(attrs);

  // ── Type lookup ──────────────────────────────────────────────────────────────

  function getType(typeCode) {
    return types.find(t => t.code === typeCode) ?? null;
  }

  $: type = component ? getType(component.type_code) : null;

  // ── Result display ───────────────────────────────────────────────────────────

  function resultLabel(r) {
    switch (r) {
      case 'ok':       return '✓ OK';
      case 'failed':   return '✗ FAILED';
      case 'problem':  return '⚙ PROBLEM';
      case 'inactive': return '— INACTIVE';
      default:         return r ?? '—';
    }
  }

  function resultClass(r) {
    switch (r) {
      case 'ok':       return 'ok';
      case 'failed':   return 'failed';
      case 'problem':  return 'problem';
      case 'inactive': return 'inactive';
      default:         return '';
    }
  }

  $: latestInsp = component ? inspections[component.id] : null;

  // ── Drag to dismiss ──────────────────────────────────────────────────────────

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
    if (dragging && dragCurrentY > threshold) {
      dispatch('close');
    } else if (dragging && dragCurrentY < -60 && sheetState === 'half') {
      sheetState = 'full';
    }
    dragStartY   = null;
    dragCurrentY = 0;
    dragging     = false;
  }

  function dismiss() {
    dispatch('close');
  }

  function toggleFullHalf() {
    sheetState = sheetState === 'full' ? 'half' : 'full';
  }
</script>

<!-- Backdrop -->
{#if sheetState !== 'hidden'}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click={dismiss}></div>
{/if}

<div
  class="sheet"
  class:hidden={sheetState === 'hidden'}
  class:half={sheetState === 'half'}
  class:full={sheetState === 'full'}
  bind:this={sheetEl}
  role="dialog"
  aria-modal="true"
  aria-label="Component details"
>

  {#if component}
    <div class="sheet-scroll">

      <!-- Header -->
      <div class="sheet-header">
        <div class="header-main">
          <span class="asset-id">{component.asset_id ?? '—'}</span>
          {#if type}
            <span
              class="type-chip"
              style="background: #{(type.colour ?? '64748b')}22; color: #{type.colour ?? '64748b'};"
            >
              {type.name}
            </span>
          {/if}
          <span class="status-chip {resultClass(component.status)}">
            {resultLabel(component.status)}
          </span>
        </div>
        {#if component.label}
          <p class="component-label">{component.label}</p>
        {/if}
      </div>

      <hr class="divider" />

      <!-- Attributes -->
      {#if fmtAttrList.length > 0}
        <div class="section">
          <p class="section-title">Attributes</p>
          <ul class="attr-list">
            {#each fmtAttrList as a}
              <li>{a}</li>
            {/each}
          </ul>
        </div>
      {:else if loadingAttrs}
        <div class="section"><p class="muted">Loading…</p></div>
      {/if}

      <!-- Notes -->
      {#if component.notes}
        <div class="section">
          <p class="section-title">Notes</p>
          <p class="notes-text">{component.notes}</p>
        </div>
      {/if}

      <!-- Last Inspection -->
      <div class="section">
        <p class="section-title">Last Inspection</p>
        {#if latestInsp}
          <div class="insp-row">
            <span class="insp-date">{fmtDateTime(latestInsp.inspected_at)}</span>
            <span class="insp-result {resultClass(latestInsp.inspection_result)}">
              {resultLabel(latestInsp.inspection_result)}
            </span>
          </div>
          {#if latestInsp.inspector_notes}
            <p class="insp-notes">"{latestInsp.inspector_notes}"</p>
          {/if}
        {:else}
          <p class="muted">No inspection recorded</p>
        {/if}
      </div>

      <!-- Linked ref -->
      {#if component.linked_component_ref}
        <div class="section">
          <p class="section-title">Reference</p>
          <p class="ref-text">{component.linked_component_ref}</p>
        </div>
      {/if}

      <!-- Expand / collapse -->
      <button class="expand-btn" on:click={toggleFullHalf}>
        {sheetState === 'full' ? '▼ Collapse' : '▲ Expand'}
      </button>

    </div>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 140;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: #1a1a2e;
    border-radius: 16px 16px 0 0;
    z-index: 150;
    display: flex;
    flex-direction: column;
    transition: transform 0.25s ease-out, height 0.25s ease-out;
    max-width: 640px;
    margin: 0 auto;
  }

  .sheet.hidden { transform: translateY(100%); height: 55vh; }
  .sheet.half   { transform: translateY(0);    height: 55vh; }
  .sheet.full   { transform: translateY(0);    height: 90vh; }

  .sheet-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 16px 32px;
    scrollbar-width: thin;
    scrollbar-color: #252540 transparent;
  }

  .sheet-header { margin-bottom: 12px; }

  .header-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .asset-id {
    font-family: 'DM Mono', monospace;
    font-size: 17px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .type-chip {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .component-label {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }

  .divider {
    border: none;
    border-top: 1px solid #252540;
    margin: 10px 0;
  }

  .section { margin-bottom: 16px; }

  .section-title {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    margin: 0 0 6px;
  }

  .attr-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .attr-list li {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #e2e8f0;
  }

  .notes-text, .ref-text {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #e2e8f0;
    margin: 0;
    line-height: 1.5;
  }

  .muted {
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }

  .insp-row {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 4px;
  }

  .insp-date {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #64748b;
  }

  .insp-notes {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #94a3b8;
    font-style: italic;
    margin: 0;
    line-height: 1.5;
  }

  .expand-btn {
    margin-top: 8px;
    width: 100%;
    min-height: 44px;
    background: transparent;
    border: 1px solid #252540;
    border-radius: 8px;
    color: #64748b;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    cursor: pointer;
    touch-action: manipulation;
  }

  /* Status colours */
  .status-chip {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
  }

  .ok       { color: #16a34a; background: #16a34a22; }
  .failed   { color: #dc2626; background: #dc262622; }
  .problem  { color: #d97706; background: #d9770622; }
  .inactive { color: #6b7280; background: #6b728022; }

  .insp-result { background: transparent; padding: 0; }
  .insp-result.ok       { color: #16a34a; }
  .insp-result.failed   { color: #dc2626; }
  .insp-result.problem  { color: #d97706; }
  .insp-result.inactive { color: #6b7280; }
</style>
