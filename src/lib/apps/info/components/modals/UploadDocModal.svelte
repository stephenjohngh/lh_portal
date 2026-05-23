<!-- src/lib/apps/info/components/modals/UploadDocModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal        from '$lib/components/common/Modal.svelte';
  import Button       from '$lib/components/common/Button.svelte';
  import FormInput    from '$lib/components/common/FormInput.svelte';
  import ErrorDisplay from '$lib/components/common/ErrorDisplay.svelte';
  import { fmtBytes } from '../../utils/infoHelpers.js';

  export let show = false;

  const dispatch = createEventDispatcher();
  const MAX_MB   = 50;

  let file        = null;
  let description = '';
  let uploading   = false;
  let error       = '';
  let fileInput;

  $: if (show) {
    file = null; description = ''; error = '';
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      error = `File exceeds ${MAX_MB} MB limit.`;
      fileInput.value = '';
      file = null;
      return;
    }
    file  = f;
    error = '';
  }

  async function handleUpload() {
    if (!file) { error = 'Please select a file.'; return; }
    uploading = true; error = '';
    try {
      dispatch('upload', { file, description: description.trim() || null });
    } catch (err) {
      error = err.message;
      uploading = false;
    }
  }

  export function done()  { uploading = false; }
  export function fail(e) { error = e; uploading = false; }

  function handleClose() { show = false; dispatch('close'); }
</script>

<Modal bind:show title="Upload Document" size="small" on:close={handleClose}>
  <div class="space-y-4">
    <ErrorDisplay message={error} onDismiss={() => error = ''} />

    <!-- File picker -->
    <div>
      <p class="text-xs text-slate-400 mb-2">File <span class="text-red-400">*</span></p>
      <label class="flex flex-col items-center gap-2 border-2 border-dashed border-slate-600
                    rounded-lg p-6 cursor-pointer hover:border-purple-500 transition-colors
                    {uploading ? 'opacity-50 pointer-events-none' : ''}">
        {#if file}
          <span class="text-2xl">📎</span>
          <span class="text-sm text-white font-medium text-center break-all">{file.name}</span>
          <span class="text-xs text-slate-500">{fmtBytes(file.size)}</span>
        {:else}
          <span class="text-2xl text-slate-500">↑</span>
          <span class="text-sm text-slate-400">Click to select a file</span>
          <span class="text-xs text-slate-600">Max {MAX_MB} MB</span>
        {/if}
        <input
          bind:this={fileInput}
          type="file"
          class="hidden"
          disabled={uploading}
          on:change={handleFileChange}
        />
      </label>
    </div>

    <FormInput
      label="Description (optional)"
      bind:value={description}
      placeholder="e.g. EWS1 form issued Jan 2026"
      disabled={uploading}
    />
  </div>

  <div slot="footer" class="flex gap-3">
    <Button variant="secondary" size="large" fullWidth={true}
            on:click={handleClose} disabled={uploading}>Cancel</Button>
    <Button variant="primary"   size="large" fullWidth={true}
            loading={uploading} disabled={uploading || !file}
            on:click={handleUpload}>Upload</Button>
  </div>
</Modal>
