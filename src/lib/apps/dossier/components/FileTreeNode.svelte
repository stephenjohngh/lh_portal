<!-- src/lib/apps/dossier/components/FileTreeNode.svelte -->
<!-- One level of a pack's file tree: its folders (each with its own contents,
     rendered by this component again) and then its files. Like DocTree it has no
     buttons of its own — a row only SELECTS; the actions live in PackFiles'
     toolbar and act on the selection, so nothing covers a name and touch works. -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { fmtBytes, mimeIcon } from '#lib/utils/files.js';
  import { filesUnder } from '../utils/fileTree.js';
  import { fileViewUrl } from '#lib/utils/driveUtils.js';

  /** Folder nodes from buildFileTree, then the files at this level. */
  export let folders = [];
  export let files = [];
  /** @type {{ kind: 'folder'|'file', id: string }|null} */
  export let selected = null;
  export let depth = 0;
  export let collapsed = {};
  /** Show a small picture for image files. */
  export let thumbnails = false;
  const isImage = (f) => String(f.mime_type || '').startsWith('image/') && !!f.web_view_url;

  const dispatch = createEventDispatcher();

  function toggle(id) {
    collapsed = { ...collapsed, [id]: !collapsed[id] };
  }
  const isSel = (kind, id) => selected?.kind === kind && selected?.id === id;
</script>

<ul class="list-none m-0 p-0">
  {#each folders as node (node.id)}
    <li>
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex items-center gap-1 pr-1 py-1 rounded cursor-pointer hover:bg-slate-700/50 transition-colors
               {isSel('folder', node.id) ? 'bg-slate-700' : ''}"
        style="padding-left: {depth * 12 + 4}px"
        title={node.name}
        data-testid="folder-row"
        on:click={() => dispatch('select', { kind: 'folder', id: node.id })}
      >
        <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
        <span class="w-4 shrink-0 text-[10px] text-slate-500 text-center"
              title={collapsed[node.id] ? 'Expand' : 'Collapse'}
              on:click|stopPropagation={() => toggle(node.id)}>{collapsed[node.id] ? '▶' : '▼'}</span>
        <span class="shrink-0 text-sm">📁</span>
        <span class="flex-1 min-w-0 truncate text-sm {isSel('folder', node.id) ? 'text-white' : 'text-slate-300'}">{node.name}</span>
        <span class="text-[10px] text-slate-500 shrink-0">{filesUnder(node)}</span>
      </div>
      {#if !collapsed[node.id]}
        <svelte:self
          folders={node.children}
          files={node.files}
          {selected}
          depth={depth + 1}
          bind:collapsed
          {thumbnails}
          on:select
        />
      {/if}
    </li>
  {/each}

  {#each files as file (file.id)}
    <li>
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex items-center gap-1.5 pr-1 py-1 rounded cursor-pointer hover:bg-slate-700/50 transition-colors
               {isSel('file', file.id) ? 'bg-slate-700' : ''}"
        style="padding-left: {depth * 12 + 24}px"
        title={file.description || file.display_name || file.filename}
        data-testid="file-row"
        on:click={() => dispatch('select', { kind: 'file', id: file.id })}
      >
        {#if thumbnails && isImage(file)}
          <img class="shrink-0 h-8 w-8 rounded object-cover bg-slate-800" src={fileViewUrl(file.web_view_url)}
               alt="" loading="lazy" data-testid="file-thumb" />
        {:else}
          <span class="shrink-0 text-sm">{mimeIcon(file.mime_type)}</span>
        {/if}
        <span class="flex-1 min-w-0 truncate text-xs {isSel('file', file.id) ? 'text-white' : 'text-slate-300'}">{file.display_name || file.filename}</span>
        {#if file.file_size}<span class="text-[10px] text-slate-500 shrink-0">{fmtBytes(file.file_size)}</span>{/if}
      </div>
    </li>
  {/each}
</ul>
