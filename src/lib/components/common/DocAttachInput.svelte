<!-- src/lib/components/common/DocAttachInput.svelte -->
<!-- Inline, reusable file-picker for attaching a single document.
     Bind to `file` to get the selected File object.
     Call the exported reset() method (or set file = null from outside) to clear. -->
<script>
  import { fmtBytes, mimeIcon } from '$lib/utils/files.js';

  /** @type {File|null} */
  export let file     = null;
  export let accept   = '*/*';
  /** Max allowed file size in bytes (default 50 MB). */
  export let maxBytes = 50 * 1024 * 1024;

  let inputEl;
  let dragging = false;
  let error    = '';

  function handleFile(f) {
    error = '';
    if (!f) return;
    if (f.size > maxBytes) {
      error = `File too large — maximum is ${fmtBytes(maxBytes)}`;
      return;
    }
    file = f;
  }

  function onInput(e)    { handleFile(e.target.files?.[0]); }
  function onDrop(e)     { e.preventDefault(); dragging = false; handleFile(e.dataTransfer?.files?.[0]); }
  function onDragOver(e) { e.preventDefault(); dragging = true; }
  function onDragLeave() { dragging = false; }

  /** Clear the current selection. Can be called externally via bind:this. */
  export function reset() {
    file  = null;
    error = '';
    if (inputEl) inputEl.value = '';
  }
</script>

{#if file}
  <!-- Selected state -->
  <div class="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-600 bg-slate-800/50">
    <span class="text-lg shrink-0">{mimeIcon(file.type)}</span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-slate-200 truncate">{file.name}</p>
      <p class="text-xs text-slate-500">{fmtBytes(file.size)}</p>
    </div>
    <button
      type="button"
      class="text-xs text-slate-500 hover:text-red-400 transition-colors shrink-0
             px-2 py-0.5 rounded border border-slate-600 hover:border-red-500/50"
      on:click={reset}
    >Remove</button>
  </div>
{:else}
  <!-- Drop-zone. role=button + tabindex makes it keyboard-accessible. -->
  <div
    role="button"
    tabindex="0"
    class="flex flex-col items-center gap-1 px-4 py-4 rounded-lg border-2 border-dashed
           cursor-pointer select-none transition-colors
           {dragging
             ? 'border-purple-400 bg-purple-900/10'
             : 'border-slate-600 hover:border-slate-500 bg-slate-800/20 hover:bg-slate-700/20'}"
    on:click={() => inputEl?.click()}
    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputEl?.click(); } }}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:drop={onDrop}
  >
    <span class="text-2xl pointer-events-none">📎</span>
    <p class="text-xs text-slate-400 pointer-events-none">
      <span class="text-purple-400 font-medium">Choose a file</span>
      &nbsp;or drag and drop
    </p>
    <p class="text-[10px] text-slate-600 pointer-events-none">Max {fmtBytes(maxBytes)}</p>
  </div>
{/if}

{#if error}
  <p class="text-xs text-red-400 mt-1">{error}</p>
{/if}

<!-- Hidden file input -->
<input
  bind:this={inputEl}
  type="file"
  {accept}
  class="hidden"
  on:change={onInput}
/>
