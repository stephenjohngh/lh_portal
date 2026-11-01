<!-- src/lib/apps/dossier/components/AssetPickerModal.svelte -->
<!-- Pick a file from the pack's shelf to reference from a page.
     Deliberately a PICKER, not an uploader: a block may only reference a file
     that is already on the shelf, so P3 can enumerate exactly what a
     publication exposes. Upload happens in the sidebar Files panel. -->
<script>
  import { matchesSearch } from '#lib/utils/textSearch.js';
  import { createEventDispatcher } from 'svelte';
  import Modal          from '#lib/components/common/Modal.svelte';
  import Button         from '#lib/components/common/Button.svelte';
  import FormInput      from '#lib/components/common/FormInput.svelte';
  import { fmtDate }    from '#lib/utils/dates.js';
  import { previewKind, fmtSize } from '../utils/assetPreview.js';
  import { folderLabel, placementMap, buildFileTree, flattenFileTree } from '../utils/fileTree.js';

  export let show  = false;
  export let files = [];
  /** The pack's folders and placements, so each file can say where it is. */
  export let folders = [];
  export let placements = [];
  /** Ids of files that come from the pack's template. */
  export let fromTemplate = new Set();

  $: where = placementMap(placements);

  const dispatch = createEventDispatcher();

  let search = '';
  let selectedId = null;

  $: if (!show) { search = ''; selectedId = null; }

  // Search what is shown, including the description — otherwise a file is
  // visibly labelled with words that will not find it.
  // With nothing typed the files show as the same folder tree as the Files panel;
  // searching flattens to matches, each saying which folder it is in.
  let collapsed = {};
  const toggle = (id) => { collapsed = { ...collapsed, [id]: !collapsed[id] }; };
  $: searching = !!search.trim();
  $: rows = flattenFileTree(buildFileTree(folders, files, placements), collapsed);
  $: visible = files.filter(f => matchesSearch([f.display_name, f.filename, f.description, folderLabel(folders, where.get(f.id))], search));

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
        {#if !searching}
          {#each rows as row (row.type === 'folder' ? 'd' + row.node.id : 'f' + row.file.id)}
            {#if row.type === 'folder'}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="flex items-center gap-1.5 py-1 pr-2 rounded cursor-pointer hover:bg-slate-700/50"
                   style="padding-left: {row.depth * 16 + 4}px" data-testid="picker-folder"
                   on:click={() => toggle(row.node.id)}>
                <span class="w-4 text-[10px] text-slate-500 text-center">{collapsed[row.node.id] ? '▶' : '▼'}</span>
                <span class="text-sm">📁</span>
                <span class="flex-1 min-w-0 truncate text-sm text-slate-300">{row.node.name}</span>
                <span class="text-[10px] text-slate-500">{row.count}</span>
              </div>
            {:else}
              <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
              <div class="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-slate-700 transition-colors {selectedId === row.file.id ? 'bg-slate-700' : ''}"
                   style="padding-left: {row.depth * 16 + 8}px" data-testid="picker-file"
                   on:click={() => choose(row.file)}>
                <span class="text-base shrink-0 self-start mt-0.5">{KIND_ICON[previewKind(row.file.mime_type)]}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-slate-200 truncate">
                    {row.file.display_name || row.file.filename}
                    {#if fromTemplate.has(row.file.id)}<span class="ml-1 rounded bg-purple-900/50 px-1 text-[10px] text-purple-200">template</span>{/if}
                  </p>
                  {#if row.file.description}<p class="text-xs text-slate-400 line-clamp-2">{row.file.description}</p>{/if}
                  <p class="text-xs text-slate-500">{fmtSize(row.file.file_size)}{row.file.file_size ? ' · ' : ''}{fmtDate(row.file.created_at)}</p>
                </div>
              </div>
            {/if}
          {/each}
        {:else}
        {#each visible as file (file.id)}
          <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
          <div
            class="flex items-center gap-3 p-2 rounded cursor-pointer
                   hover:bg-slate-700 transition-colors
                   {selectedId === file.id ? 'bg-slate-700' : ''}"
            on:click={() => choose(file)}
          >
            <span class="text-base shrink-0 self-start mt-0.5">
              {KIND_ICON[previewKind(file.mime_type)]}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-slate-200 truncate">
                {file.display_name || file.filename}
                {#if fromTemplate.has(file.id)}<span class="ml-1 rounded bg-purple-900/50 px-1 text-[10px] text-purple-200">template</span>{/if}
              </p>
              {#if file.description}
                <!-- The filename alone rarely distinguishes two scans of the
                     same thing; the description is what the author wrote to
                     tell them apart, so it belongs at the moment of choosing. -->
                <p class="text-xs text-slate-400 line-clamp-2">{file.description}</p>
              {/if}
              {#if where.get(file.id)}
                <p class="text-xs text-slate-500 truncate">📁 {folderLabel(folders, where.get(file.id))}</p>
              {/if}
              <p class="text-xs text-slate-500">
                {fmtSize(file.file_size)}{file.file_size ? ' · ' : ''}{fmtDate(file.created_at)}
              </p>
            </div>
          </div>
        {/each}

        {/if}
        {#if searching && visible.length === 0}
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
