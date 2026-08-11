<!-- src/lib/apps/dossier/components/AssetPickerModal.svelte -->
<!-- Pick a file from the pack's shelf to reference from a page.
     Deliberately a PICKER, not an uploader: a block may only reference a file
     that is already on the shelf, so P3 can enumerate exactly what a
     publication exposes. Upload happens in the sidebar Files panel. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal          from '$lib/components/common/Modal.svelte';
  import Button         from '$lib/components/common/Button.svelte';
  import FormInput      from '$lib/components/common/FormInput.svelte';
  import { fmtDate }    from '$lib/utils/dates';
  import { previewKind, fmtSize } from '../utils/assetPreview.js';

  export let show  = false;
  export let files = [];

  const dispatch = createEventDispatcher();

  let search = '';
  let selectedId = null;

  $: if (!show) { search = ''; selectedId = null; }

  $: visible = files.filter(f => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${f.display_name ?? ''} ${f.filename ?? ''}`.toLowerCase().includes(q);
  });

  const KIND_ICON = { image: '🖼', pdf: '📄', file: '📎' };

  function choose(file) {
    selectedId = file.id;
    dispatch('pick', file);
    show = false;
  }
</script>

<Modal bind:show title="Insert a file" size="medium" on:close={() => dispatch('close')}>
  <div class="space-y-3">
    {#if files.length === 0}
      <div class="py-10 text-center">
        <p class="text-sm text-slate-400">This pack has no files yet.</p>
        <p class="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
          Add them in the <span class="text-slate-400">Files</span> panel at the
          bottom of the page list, then insert them here.
        </p>
      </div>
    {:else}
      <FormInput label="" bind:value={search} placeholder="Search files…" />

      <div class="max-h-80 overflow-y-auto space-y-1">
        {#each visible as file (file.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-3 p-2 rounded cursor-pointer
                   hover:bg-slate-700 transition-colors
                   {selectedId === file.id ? 'bg-slate-700' : ''}"
            on:click={() => choose(file)}
          >
            <span class="text-base shrink-0">{KIND_ICON[previewKind(file.mime_type)]}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-200 truncate">
                {file.display_name || file.filename}
              </p>
              <p class="text-xs text-slate-500">
                {fmtSize(file.file_size)}{file.file_size ? ' · ' : ''}{fmtDate(file.created_at)}
              </p>
            </div>
          </div>
        {/each}

        {#if visible.length === 0}
          <p class="text-xs text-slate-500 text-center py-6">No files match “{search}”.</p>
        {/if}
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex justify-end">
    <Button variant="secondary" on:click={() => { show = false; dispatch('close'); }}>
      Cancel
    </Button>
  </div>
</Modal>
