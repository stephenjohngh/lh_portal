<!-- plan/AnnotationSidebar.svelte -->
<!-- Edit / delete a text annotation placed on a plan.
     Owns its own form state; dispatches 'saved', 'deleted', 'close' to parent. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore } from '../../stores/buildingAssetsStore.js';
  import { inp } from '../../ui.js';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

  export let annotation; // plan_annotations row
  export let readOnly = false; // hide save/delete (View mode or read-only users)

  const dispatch = createEventDispatcher();

  const FONT_SIZES = [
    { value: 'xs', label: 'XS — tiny'   },
    { value: 'sm', label: 'S — small'   },
    { value: 'md', label: 'M — medium'  },
    { value: 'lg', label: 'L — large'   },
    { value: 'xl', label: 'XL — x-large'},
  ];

  let text      = annotation.text      ?? '';
  let font_size = annotation.font_size ?? 'sm';
  let colour    = '#' + (annotation.colour ?? 'fbbf24');
  let bold      = annotation.bold      ?? false;
  let notes     = annotation.notes     ?? '';

  let saving       = false;
  let deleting     = false;
  let pendingDelete = false;  // confirmation state
  let error        = '';

  // Dirty tracking
  $: dirty =
    text      !== (annotation.text      ?? '')      ||
    font_size !== (annotation.font_size ?? 'sm')    ||
    colour    !== '#' + (annotation.colour ?? 'fbbf24') ||
    bold      !== (annotation.bold      ?? false)   ||
    notes     !== (annotation.notes     ?? '');

  // Reset form when a different annotation is selected
  $: {
    annotation; // reactive dependency
    text      = annotation.text      ?? '';
    font_size = annotation.font_size ?? 'sm';
    colour    = '#' + (annotation.colour ?? 'fbbf24');
    bold      = annotation.bold      ?? false;
    notes     = annotation.notes     ?? '';
    error     = '';
  }

  async function save() {
    if (!text.trim()) { error = 'Text cannot be empty'; return; }
    saving = true; error = '';
    try {
      const updated = await buildingAssetsStore.updateAnnotation(annotation.id, {
        text:      text.trim(),
        font_size,
        colour:    colour.replace('#', ''),
        bold,
        notes,
      });
      dispatch('saved', { annotation: updated });
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }

  function requestDeleteAnnotation() {
    pendingDelete = true;
  }

  async function confirmDeleteAnnotation() {
    deleting = true; error = '';
    try {
      await buildingAssetsStore.deleteAnnotation(annotation.id);
      dispatch('deleted');
    } catch (err) {
      error = err.message;
      deleting = false;
    } finally {
      pendingDelete = false;
    }
  }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">

  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700">
    <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Annotation</p>
    <button
      on:click={() => dispatch('close')}
      class="text-slate-500 hover:text-white transition-colors"
    >✕</button>
  </div>

  <div class="p-4 flex flex-col gap-3">

    {#if error}
      <p class="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{error}</p>
    {/if}

    <!-- Text content -->
    <div>
      <label for="ann-text" class="text-xs text-slate-400 mb-1 block">Text</label>
      <textarea
        id="ann-text"
        bind:value={text}
        rows="3"
        class="{inp} resize-none"
        placeholder="Annotation text…"
        disabled={readOnly}
      ></textarea>
    </div>

    <!-- Font size -->
    <div>
      <label for="ann-size" class="text-xs text-slate-400 mb-1 block">Size</label>
      <select id="ann-size" bind:value={font_size} class="{inp} cursor-pointer" disabled={readOnly}>
        {#each FONT_SIZES as fs (fs.value)}
          <option value={fs.value}>{fs.label}</option>
        {/each}
      </select>
    </div>

    <!-- Colour -->
    <div>
      <label for="ann-colour" class="text-xs text-slate-400 mb-1 block">Colour</label>
      <div class="flex gap-2 items-center">
        <input id="ann-colour" type="color" bind:value={colour}
               class="h-[30px] w-10 rounded border border-slate-600 cursor-pointer bg-slate-900 p-0.5 shrink-0"
               disabled={readOnly} />
        <input bind:value={colour} class="{inp} font-mono" placeholder="#fbbf24" maxlength="7" disabled={readOnly} />
      </div>
    </div>

    <!-- Bold -->
    <label class="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
      <input type="checkbox" bind:checked={bold} class="rounded accent-purple-500" disabled={readOnly} />
      Bold text
    </label>

    <!-- Notes (internal) -->
    <div>
      <label for="ann-notes" class="text-xs text-slate-400 mb-1 block">Notes (internal)</label>
      <input id="ann-notes" bind:value={notes} class={inp} placeholder="Optional internal notes…" disabled={readOnly} />
    </div>

    <!-- Preview -->
    <div>
      <p class="text-xs text-slate-400 mb-1">Preview</p>
      <div class="rounded p-2 border"
           style="background-color:{colour}22; border-color:{colour}55">
        <span
          class="{bold ? 'font-bold' : 'font-medium'} leading-tight break-words"
          style="color:{colour}; font-size:{
            font_size === 'xs' ? '10px'
            : font_size === 'sm' ? '12px'
            : font_size === 'md' ? '14px'
            : font_size === 'lg' ? '16px'
            : '18px'
          }">{text || 'Annotation text…'}</span>
      </div>
    </div>

    <!-- Actions — hidden when readOnly (View mode or read-only user) -->
    {#if !readOnly}
      <div class="flex gap-2 pt-1">
        <button
          on:click={save}
          disabled={saving || !dirty}
          class="flex-1 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-500
                 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium
                 transition-colors"
        >{saving ? 'Saving…' : 'Save'}</button>
        <button
          on:click={requestDeleteAnnotation}
          disabled={deleting}
          class="px-3 py-2 text-sm rounded-lg bg-red-900/40 hover:bg-red-800/50
                 disabled:opacity-40 text-red-400 border border-red-800/40 transition-colors"
          title="Delete annotation"
        >{deleting ? '…' : '🗑'}</button>
      </div>
    {/if}

  </div>
</div>

<ConfirmDialog
  show={pendingDelete}
  title="Delete annotation"
  message="Delete this annotation?"
  confirmText="Delete"
  danger={true}
  processing={deleting}
  on:confirm={confirmDeleteAnnotation}
  on:cancel={() => pendingDelete = false}
/>
