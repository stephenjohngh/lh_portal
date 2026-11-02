<!-- src/lib/components/common/DocAttachInput.svelte -->
<!-- Inline, reusable file-picker for attaching a document.
     Bind to `file` to get the selected File object.
     With `multiple`, bind to `files` instead: any number of files can be chosen or
     dropped, added to what is already listed, and each removed on its own.
     Call the exported reset() method (or set file = null from outside) to clear. -->
<script>
  import Button from '#lib/components/common/Button.svelte';
  import { fmtBytes, mimeIcon } from '#lib/utils/files.js';
  import { pickFiles } from '#lib/utils/pickFiles.js';

  /** @type {File|null} */
  export let file     = null;
  /** Several files at once (bind:files). Ignored unless `multiple`. @type {File[]} */
  export let files    = [];
  export let multiple = false;
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

  /** Add the chosen files to the list; a file already listed (same name and size) is not added twice. */
  function handleMany(list) {
    error = '';
    const tooBig = [];
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      if (f.size > maxBytes) { tooBig.push(f.name); continue; }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    files = next;
    if (tooBig.length) error = `Too large (maximum ${fmtBytes(maxBytes)}): ${tooBig.join(', ')}`;
  }

  /** Open the chooser at the last-used folder where the browser can; else the plain input. */
  async function openChooser() {
    const picked = await pickFiles({ multiple, accept });
    if (picked === null) { inputEl?.click(); return; }
    if (!picked.length) return;
    if (multiple) handleMany(picked); else handleFile(picked[0]);
  }

  function removeAt(i) { files = files.filter((_, k) => k !== i); if (inputEl) inputEl.value = ''; }

  function onInput(e)    { multiple ? handleMany(e.target.files) : handleFile(e.target.files?.[0]); if (multiple && inputEl) inputEl.value = ''; }
  function onDrop(e)     { e.preventDefault(); dragging = false; multiple ? handleMany(e.dataTransfer?.files) : handleFile(e.dataTransfer?.files?.[0]); }
  function onDragOver(e) { e.preventDefault(); dragging = true; }
  function onDragLeave() { dragging = false; }

  /** Clear the current selection. Can be called externally via bind:this. */
  export function reset() {
    file  = null;
    files = [];
    error = '';
    if (inputEl) inputEl.value = '';
  }
</script>

{#if multiple}
  {#if files.length}
    <div class="space-y-1 mb-2" data-testid="selected-files">
      {#each files as f, i (f.name + f.size + i)}
        <div class="flex items-center gap-3 px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/50">
          <span class="text-lg shrink-0">{mimeIcon(f.type)}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-200 truncate">{f.name}</p>
            <p class="text-xs text-slate-500">{fmtBytes(f.size)}</p>
          </div>
          <Button variant="danger" size="xs" ariaLabel="Remove {f.name}" on:click={() => removeAt(i)}>Remove</Button>
        </div>
      {/each}
    </div>
  {/if}
  <div
    role="button"
    tabindex="0"
    class="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 border-dashed
           cursor-pointer select-none transition-colors
           {dragging
             ? 'border-purple-400 bg-purple-900/10'
             : 'border-slate-600 hover:border-slate-500 bg-slate-800/20 hover:bg-slate-700/20'}"
    on:click={openChooser}
    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChooser(); } }}
    on:dragover={onDragOver}
    on:dragleave={onDragLeave}
    on:drop={onDrop}
  >
    <span class="text-2xl pointer-events-none">📎</span>
    <p class="text-xs text-slate-400 pointer-events-none">
      <span class="text-purple-400 font-medium">{files.length ? 'Add more files' : 'Choose files'}</span>
      &nbsp;or drag and drop
    </p>
    <p class="text-[10px] text-slate-600 pointer-events-none">Max {fmtBytes(maxBytes)} each</p>
  </div>
{:else if file}
  <!-- Selected state -->
  <div class="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-600 bg-slate-800/50">
    <span class="text-lg shrink-0">{mimeIcon(file.type)}</span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-slate-200 truncate">{file.name}</p>
      <p class="text-xs text-slate-500">{fmtBytes(file.size)}</p>
    </div>
    <Button variant="danger" size="xs" on:click={reset}>Remove</Button>
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
    on:click={openChooser}
    on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChooser(); } }}
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
  {multiple}
  class="hidden"
  on:change={onInput}
/>
