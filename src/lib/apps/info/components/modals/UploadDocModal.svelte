<!-- src/lib/apps/info/components/modals/UploadDocModal.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Modal          from '$lib/components/common/Modal.svelte';
  import Button         from '$lib/components/common/Button.svelte';
  import FormInput      from '$lib/components/common/FormInput.svelte';
  import ErrorDisplay   from '$lib/components/common/ErrorDisplay.svelte';
  // Shared file picker — supports both click-to-choose and drag-and-drop
  // (same component the Management activity-document upload uses).
  import DocAttachInput from '$lib/components/common/DocAttachInput.svelte';

  export let show = false;

  const dispatch = createEventDispatcher();

  /** @type {File|null} */
  let file        = null;
  let description = '';
  let uploading   = false;
  let error       = '';
  let docInput;     // DocAttachInput instance — for reset()

  $: if (show) {
    file = null; description = ''; error = '';
    docInput?.reset?.();
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

    <!-- File picker (click or drag-and-drop) -->
    <div class={uploading ? 'opacity-50 pointer-events-none' : ''}>
      <p class="text-xs text-slate-400 mb-2">File <span class="text-red-400">*</span></p>
      <DocAttachInput bind:this={docInput} bind:file />
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
