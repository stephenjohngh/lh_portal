<!-- src/lib/apps/plans/components/PlanUploader.svelte -->
<!-- Modal for uploading new floor plans -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { getLogger } from '$lib/utils/logger';
  import Modal from '$lib/components/common/Modal.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import { plansStore } from '../stores/plansStore';
  import { MAX_IMAGE_SIZE, ALLOWED_IMAGE_TYPES, FLOOR_LEVELS, DEFAULT_FLOOR_LEVEL } from '$lib/utils/planConstants';

  const logger = getLogger('PlanUploader');
  const dispatch = createEventDispatcher();

  let fileInput;
  let selectedFile = null;
  let previewUrl   = null;
  let dragActive   = false;
  let uploading    = false;
  let errors       = {};

  let formData = { name: '', building: '', floor_level: DEFAULT_FLOOR_LEVEL, description: '' };

  function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) processFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    dragActive = false;
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(event)  { event.preventDefault(); dragActive = true; }
  function handleDragLeave()      { dragActive = false; }

  function processFile(file) {
    logger('Processing file:', file.name, file.type, file.size);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert('Invalid file type. Please upload PNG, JPG, or SVG files.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      alert(`File too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { previewUrl = e.target.result; };
    reader.readAsDataURL(file);
    if (!formData.name) formData.name = file.name.replace(/\.[^/.]+$/, '');
  }

  function validate() {
    errors = {};
    if (!selectedFile)             errors.file     = 'Please select an image file';
    if (!formData.name.trim())     errors.name     = 'Plan name is required';
    if (!formData.building.trim()) errors.building = 'Building name is required';
    return Object.keys(errors).length === 0;
  }

  async function handleUpload() {
    if (!validate()) { logger('❌ Validation failed:', errors); return; }
    uploading = true;
    try {
      const { url }  = await plansStore.uploadImage(selectedFile);
      const dimensions = await plansStore.getImageDimensions(url);
      const plan = await plansStore.createPlan({
        name:         formData.name.trim(),
        building:     formData.building.trim(),
        floor_level:  formData.floor_level,
        description:  formData.description.trim() || null,
        image_url:    url,
        image_width:  dimensions.width,
        image_height: dimensions.height
      });
      logger('✅ Plan created:', plan.id);
      dispatch('created', { planId: plan.id });
    } catch (error) {
      logger('❌ Upload error:', error.message);
      alert('Failed to upload floor plan: ' + error.message);
    } finally {
      uploading = false;
    }
  }

  function handleClose()  { dispatch('close'); }
  function removeFile()   {
    selectedFile = null;
    previewUrl   = null;
    if (fileInput) fileInput.value = '';
  }
</script>

<Modal show={true} size="large" on:close={handleClose}>
  <h3 slot="header" class="text-xl font-bold">Upload Floor Plan</h3>

  <div class="section-spacing">
    <div>
      <p class="block text-sm font-medium mb-2">
        Floor Plan Image <span class="text-red-400">*</span>
      </p>

      {#if !selectedFile}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          role="region"
          aria-label="File drop zone"
          class="border-2 border-dashed rounded-lg p-8 text-center transition-colors {dragActive ? 'border-purple-500 bg-purple-500/10' : errors.file ? 'border-red-500' : 'border-slate-600 hover:border-slate-500'}"
          on:drop={handleDrop}
          on:dragover={handleDragOver}
          on:dragleave={handleDragLeave}
        >
          <Icon name="upload" size={12} className="text-gray-400 mx-auto mb-4" />
          <p class="text-lg mb-2">Drag and drop image here</p>
          <p class="text-sm text-gray-400 mb-4">or click to browse</p>
          <input type="file" accept=".png,.jpg,.jpeg,.svg"
            bind:this={fileInput} on:change={handleFileSelect} class="hidden" />
          <Button variant="primary" size="medium" icon="upload" on:click={() => fileInput.click()}>
            Browse Files
          </Button>
          <p class="text-xs text-gray-500 mt-4">
            PNG, JPG, or SVG · Max {MAX_IMAGE_SIZE / 1024 / 1024}MB
          </p>
        </div>
        {#if errors.file}<p class="field-error mt-1">{errors.file}</p>{/if}
      {:else}
        <div class="border border-slate-600 rounded-lg overflow-hidden">
          <div class="relative bg-slate-900 p-4">
            <img src={previewUrl} alt="Preview" class="max-h-64 mx-auto" />
            <button
              on:click={removeFile}
              class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-2"
            >
              <Icon name="close" size={4} />
            </button>
          </div>
          <div class="p-3 bg-slate-800 text-sm">
            <p class="font-medium">{selectedFile.name}</p>
            <p class="text-gray-400">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </div>
      {/if}
    </div>

    <div>
      <label for="upload-plan-name" class="block text-sm font-medium mb-2">
        Plan Name <span class="text-red-400">*</span>
      </label>
      <input id="upload-plan-name" type="text" bind:value={formData.name}
        placeholder="e.g., Ground Floor"
        class="input" class:error={errors.name} />
      {#if errors.name}<p class="field-error">{errors.name}</p>{/if}
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label for="upload-building" class="block text-sm font-medium mb-2">
          Building <span class="text-red-400">*</span>
        </label>
        <input id="upload-building" type="text" bind:value={formData.building}
          placeholder="e.g., Building A"
          class="input" class:error={errors.building} />
        {#if errors.building}<p class="field-error">{errors.building}</p>{/if}
      </div>
      <div>
        <label for="upload-floor" class="block text-sm font-medium mb-2">Floor Level</label>
        <select id="upload-floor" bind:value={formData.floor_level} class="select w-full">
          {#each FLOOR_LEVELS as level}
            <option value={level.value}>{level.label}</option>
          {/each}
        </select>
      </div>
    </div>

    <div>
      <label for="upload-description" class="block text-sm font-medium mb-2">Description</label>
      <textarea id="upload-description" bind:value={formData.description}
        placeholder="Optional description..." rows="2"
        class="textarea"></textarea>
    </div>
  </div>

  <div slot="footer" class="btn-group justify-end">
    <Button variant="secondary" size="large" on:click={handleClose} disabled={uploading}>Cancel</Button>
    <Button variant="primary"   size="large" icon="check" on:click={handleUpload} disabled={uploading || !selectedFile}>
      {uploading ? 'Uploading...' : 'Create Floor Plan'}
    </Button>
  </div>
</Modal>
