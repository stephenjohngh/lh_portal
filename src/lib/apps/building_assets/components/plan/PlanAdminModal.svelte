<!-- plan/PlanAdminModal.svelte -->
<!-- Admin panel for creating, editing and copying floor plans.
     mode: 'new' | 'edit' | 'copy'
     plan: the currently selected plan (required for edit/copy, ignored for new). -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { buildingAssetsStore } from '../../stores/buildingAssetsStore.js';
  import Modal    from '$lib/components/common/Modal.svelte';
  import Button   from '$lib/components/common/Button.svelte';

  export let show   = false;
  export let mode   = 'new';   // 'new' | 'edit' | 'copy'
  export let plan   = null;    // selected plan (needed for edit / copy)
  export let floors = [];      // all floors for the picker

  const dispatch = createEventDispatcher();

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

  // -- Form state ----------------------------------------------------
  let editName     = '';
  let editBuilding = '';
  let editFloorId  = '';
  let editDesc     = '';
  let imageFile    = null;
  let imagePreview = null;  // object URL for preview thumbnail
  let dragOver     = false;

  // Copy progress: null = not started; { done, total } = in-progress / done
  let copyProgress = null;

  // Import mode — target plan selection
  let importTargetPlanId = '';

  // Copy/import — optional single component-type filter ('' = all types)
  let copyTypeCode = '';

  // Plans on the currently-selected floor (excluding the source plan itself)
  $: plansOnEditFloor = editFloorId
    ? $buildingAssetsStore.plans.filter(p => p.floor_id === editFloorId && p.id !== plan?.id)
    : [];

  // Components on the source plan, and the distinct types among them (with
  // counts) — drives the "component type to copy" dropdown in copy/import modes.
  $: sourcePlanComponents = (mode === 'copy' || mode === 'import') && plan
    ? $buildingAssetsStore.components.filter(c => c.plan_id === plan.id)
    : [];
  $: sourceTypeOptions = [...new Set(sourcePlanComponents.map(c => c.type_code))]
    .map(code => ({
      code,
      name:  $buildingAssetsStore.types.find(t => t.code === code)?.name ?? code,
      count: sourcePlanComponents.filter(c => c.type_code === code).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  let saving     = false;
  let errorMsg   = '';
  let confirming = false;  // delete confirm

  // Count of components that will be removed alongside the plan
  $: planComponentCount = plan
    ? $buildingAssetsStore.components.filter(c => c.plan_id === plan.id).length
    : 0;

  // Reset form state on every false → true transition of `show`, plus when
  // mode or selected plan changes while the modal is already open. This
  // ensures a fresh slate every time the user opens the modal — even if it's
  // the same plan+mode as last time (previously the loadedKey-only check
  // skipped the reset, leaving stale errorMsg / image preview behind).
  let lastShow  = false;
  let loadedKey = null;
  $: {
    const key      = `${mode}-${plan?.id ?? 'new'}`;
    const opening  = show && !lastShow;
    const keyMoved = show && key !== loadedKey;
    if (opening || keyMoved) {
      loadedKey    = key;
      errorMsg     = '';
      confirming   = false;
      saving       = false;
      copyProgress = null;
      clearImage();
      if (mode === 'edit' && plan) {
        editName           = plan.name        ?? '';
        editBuilding       = plan.building    ?? '';
        editFloorId        = plan.floor_id    ?? '';
        editDesc           = plan.description ?? '';
        importTargetPlanId = '';
      } else if (mode === 'copy' && plan) {
        editName           = `Copy of ${plan.name ?? plan.building ?? 'Plan'}`;
        editBuilding       = plan.building ?? '';
        editFloorId        = plan.floor_id ?? '';
        editDesc           = '';
        importTargetPlanId = '';
      } else if (mode === 'import' && plan) {
        editName           = '';
        editBuilding       = '';
        editFloorId        = '';
        editDesc           = '';
        importTargetPlanId = '';
      } else {
        editName           = '';
        editBuilding       = '';
        editFloorId        = '';
        editDesc           = '';
        importTargetPlanId = '';
      }
      copyTypeCode = '';   // default to "all types" every open
    }
    lastShow = show;
  }

  $: title = mode === 'new'    ? 'New Floor Plan'
           : mode === 'edit'   ? 'Edit Plan Info'
           : mode === 'import' ? 'Copy Components to Plan'
           :                     'Copy Plan';

  // -- Image handling ------------------------------------------------
  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    imageFile    = null;
    imagePreview = null;
    dragOver     = false;
  }

  function acceptFile(file) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      errorMsg = 'Unsupported file type. Use JPG, PNG, WebP or GIF.';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      errorMsg = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB — max 15 MB).`;
      return;
    }
    errorMsg = '';
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    imageFile    = file;
    imagePreview = URL.createObjectURL(file);
  }

  function onFileInput(e)  { acceptFile(e.target.files?.[0]); e.target.value = ''; }
  function onDragOver(e)   { e.preventDefault(); dragOver = true; }
  function onDragLeave()   { dragOver = false; }
  function onDrop(e)       { e.preventDefault(); dragOver = false; acceptFile(e.dataTransfer.files?.[0]); }

  // -- Submit handlers -----------------------------------------------
  async function handleNew() {
    if (!editBuilding.trim()) { errorMsg = 'Building name is required.'; return; }
    if (!imageFile)           { errorMsg = 'Please select a plan image.'; return; }
    saving = true; errorMsg = '';
    try {
      const created = await buildingAssetsStore.createPlan({
        name:        editName.trim()  || null,
        building:    editBuilding.trim(),
        floor_id:    editFloorId      || null,
        description: editDesc.trim()  || null,
      }, imageFile);
      dispatch('done', { plan: created, action: 'created' });
      show = false;
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleEdit() {
    if (!editBuilding.trim()) { errorMsg = 'Building name is required.'; return; }
    saving = true; errorMsg = '';
    try {
      let updated = await buildingAssetsStore.updatePlanInfo(plan.id, {
        name:        editName.trim()  || null,
        building:    editBuilding.trim(),
        floor_id:    editFloorId      || null,
        description: editDesc.trim()  || null,
      });
      if (imageFile) {
        updated = await buildingAssetsStore.replacePlanImage(plan.id, imageFile);
      }
      dispatch('done', { plan: { ...plan, ...updated }, action: 'updated' });
      show = false;
    } catch (err) {
      errorMsg = err.message;
    } finally {
      saving = false;
    }
  }

  async function handleCopy() {
    if (!editBuilding.trim()) { errorMsg = 'Building name is required.'; return; }
    saving = true; errorMsg = '';
    copyProgress = { done: 0, total: null };
    try {
      const { plan: newPlan, copied } = await buildingAssetsStore.copyPlan(
        plan.id,
        {
          name:     editName.trim()    || null,
          building: editBuilding.trim(),
          floor_id: editFloorId        || null,
          typeCode: copyTypeCode       || null,
        },
        (done, total) => { copyProgress = { done, total }; }
      );
      dispatch('done', { plan: newPlan, action: 'copied', copied });
      show = false;
    } catch (err) {
      errorMsg     = err.message;
      copyProgress = null;
    } finally {
      saving = false;
    }
  }

  async function handleImport() {
    if (!importTargetPlanId) { errorMsg = 'Please select a target plan.'; return; }
    saving = true; errorMsg = '';
    copyProgress = { done: 0, total: null };
    try {
      const { plan: targetPlan, copied } = await buildingAssetsStore.importComponentsToExistingPlan(
        plan.id, importTargetPlanId,
        (done, total) => { copyProgress = { done, total }; },
        { typeCode: copyTypeCode || null }
      );
      dispatch('done', { plan: targetPlan, action: 'imported', copied });
      show = false;
    } catch (err) {
      errorMsg     = err.message;
      copyProgress = null;
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!confirming) { confirming = true; return; }
    saving = true; errorMsg = '';
    // Capture plan.id before the await — after deletePlan resolves Svelte 5
    // flushes reactive effects synchronously, which causes selectedPlan in the
    // parent to become null and the plan prop here to go null before we can
    // read plan.id again.
    const planId = plan.id;
    try {
      await buildingAssetsStore.deletePlan(planId);
      dispatch('deleted', { planId });
      show = false;
    } catch (err) {
      errorMsg   = err.message;
      saving     = false;
      confirming = false;
    }
  }

  function handleClose() {
    if (saving) return;
    clearImage();
    dispatch('close');
    show = false;
  }
</script>

<Modal bind:show {title} size="medium" on:close={handleClose}>

  <div class="flex flex-col gap-4">

    <!-- Error -->
    {#if errorMsg}
      <p class="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2">
        {errorMsg}
      </p>
    {/if}

    <!-- -- Copy progress bar ------------------------------------- -->
    {#if copyProgress !== null}
      <div class="flex flex-col gap-1.5">
        <p class="text-xs text-slate-400">
          {#if copyProgress.total === null}
            {mode === 'import' ? 'Preparing…' : 'Creating plan…'}
          {:else if copyProgress.done < copyProgress.total}
            Copying components: {copyProgress.done} / {copyProgress.total}
          {:else}
            Done — {copyProgress.done} component{copyProgress.done !== 1 ? 's' : ''} copied.
          {/if}
        </p>
        {#if copyProgress.total !== null && copyProgress.total > 0}
          <div class="h-1.5 rounded-full bg-slate-700 overflow-hidden">
            <div
              class="h-full bg-purple-500 transition-all duration-200"
              style="width:{Math.round((copyProgress.done / copyProgress.total) * 100)}%"
            ></div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- -- Source plan info (copy / import mode) ---------------- -->
    {#if (mode === 'copy' || mode === 'import') && plan}
      <div class="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2.5">
        <p class="text-xs text-slate-500 mb-1">{mode === 'import' ? 'Copying components from' : 'Copying from'}</p>
        <p class="text-sm text-white font-medium">{plan.building}</p>
        {#if plan.name}
          <p class="text-xs text-slate-400">{plan.name}</p>
        {/if}
        {#if plan.image_url}
          <img
            src={plan.image_url}
            alt="Source plan"
            class="mt-2 rounded h-16 object-cover opacity-70"
          />
        {/if}
      </div>
    {/if}

    <!-- -- Component type filter (copy / import) ---------------- -->
    {#if (mode === 'copy' || mode === 'import') && plan}
      <div class="flex flex-col gap-1">
        <label for="pa-copy-type" class="text-xs text-slate-400">Component type to copy</label>
        <select
          id="pa-copy-type"
          bind:value={copyTypeCode}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          disabled={saving}
        >
          <option value="">All types ({sourcePlanComponents.length})</option>
          {#each sourceTypeOptions as t (t.code)}
            <option value={t.code}>{t.name} ({t.count})</option>
          {/each}
        </select>
      </div>
    {/if}

    <!-- -- Floor picker ------------------------------------------ -->
    <div class="flex flex-col gap-1">
      <label for="pa-floor" class="text-xs text-slate-400">Floor</label>
      <select
        id="pa-floor"
        bind:value={editFloorId}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500"
        disabled={saving}
      >
        <option value="">— none —</option>
        {#each floors as f (f.id)}
          <option value={f.id}>{f.name} ({f.short_name})</option>
        {/each}
      </select>
    </div>

    <!-- -- Target plan picker (import mode only) ---------------- -->
    {#if mode === 'import'}
      {#if editFloorId}
        {#if plansOnEditFloor.length === 0}
          <p class="text-xs text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded px-3 py-2">
            No existing plans on this floor. Select a different floor, or use Copy Plan to create one.
          </p>
        {:else}
          <div class="flex flex-col gap-1">
            <label for="pa-target-plan" class="text-xs text-slate-400">
              Target plan <span class="text-red-400">*</span>
            </label>
            <select
              id="pa-target-plan"
              bind:value={importTargetPlanId}
              class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                     focus:outline-none focus:border-purple-500"
              disabled={saving}
            >
              <option value="">— select target plan —</option>
              {#each plansOnEditFloor as p (p.id)}
                <option value={p.id}>{p.building}{p.name ? ` — ${p.name}` : ''}</option>
              {/each}
            </select>
          </div>
          <!-- Preview of selected target plan image -->
          {#if importTargetPlanId}
            {@const targetPlan = plansOnEditFloor.find(p => p.id === importTargetPlanId)}
            {#if targetPlan?.image_url}
              <img
                src={targetPlan.image_url}
                alt="Target plan"
                class="rounded h-16 object-cover opacity-60 border border-slate-600"
              />
            {/if}
          {/if}
        {/if}
      {/if}
    {/if}

    <!-- -- Building ---------------------------------------------- -->
    {#if mode !== 'import'}
    <div class="flex flex-col gap-1">
      <label for="pa-building" class="text-xs text-slate-400">
        Building <span class="text-red-400">*</span>
      </label>
      <input
        id="pa-building"
        type="text"
        bind:value={editBuilding}
        placeholder="e.g. Lonsdale House"
        disabled={saving}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500 disabled:opacity-50"
      />
    </div>

    <!-- -- Name (optional) --------------------------------------- -->
    <div class="flex flex-col gap-1">
      <label for="pa-name" class="text-xs text-slate-400">
        Plan name
        <span class="text-slate-600 font-normal ml-1">— optional, e.g. "Ground Floor Main"</span>
      </label>
      <input
        id="pa-name"
        type="text"
        bind:value={editName}
        placeholder="Optional plan name…"
        disabled={saving}
        class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
               focus:outline-none focus:border-purple-500 disabled:opacity-50"
      />
    </div>

    {/if}<!-- /mode !== 'import' -->

    <!-- -- Description (new/edit only) -------------------------- -->
    {#if mode !== 'copy' && mode !== 'import'}
      <div class="flex flex-col gap-1">
        <label for="pa-desc" class="text-xs text-slate-400">Description</label>
        <textarea
          id="pa-desc"
          rows="2"
          bind:value={editDesc}
          placeholder="Optional description…"
          disabled={saving}
          class="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white
                 focus:outline-none focus:border-purple-500 disabled:opacity-50 resize-none"
        ></textarea>
      </div>
    {/if}

    <!-- -- Image upload (new, and replace section for edit) ----- -->
    {#if mode === 'new' || mode === 'edit'}
      <div class="flex flex-col gap-1.5">
        <p class="text-xs text-slate-400">
          {mode === 'edit' ? 'Replace image' : 'Plan image'}
          {#if mode === 'new'}<span class="text-red-400"> *</span>{/if}
          {#if mode === 'edit'}<span class="text-slate-600 font-normal ml-1">— optional; clears scale if changed</span>{/if}
        </p>

        <!-- Current image preview (edit mode, before replacement) -->
        {#if mode === 'edit' && plan?.image_url && !imagePreview}
          <img
            src={plan.image_url}
            alt="Current plan"
            class="rounded h-20 object-cover opacity-60 border border-slate-600"
          />
        {/if}

        <!-- New image preview -->
        {#if imagePreview}
          <div class="relative w-fit">
            <img
              src={imagePreview}
              alt="Selected plan"
              class="rounded h-24 object-cover border border-purple-500/50"
            />
            <button
              on:click={clearImage}
              class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 border border-slate-600
                     text-slate-400 hover:text-white flex items-center justify-center text-xs leading-none"
              title="Remove selected image"
              disabled={saving}
            >✕</button>
          </div>
        {/if}

        <!-- Drop zone -->
        <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
        <div
          class="border-2 border-dashed rounded-lg px-4 py-5 text-center transition-colors
                 {dragOver
                   ? 'border-purple-400 bg-purple-900/20'
                   : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'}
                 {saving ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}"
          on:dragover={onDragOver}
          on:dragleave={onDragLeave}
          on:drop={onDrop}
          on:click={() => !saving && document.getElementById('pa-file-input').click()}
        >
          <p class="text-sm text-slate-400 mb-1">
            {imageFile ? imageFile.name : 'Drop an image here, or click to browse'}
          </p>
          <p class="text-xs text-slate-600">JPG · PNG · WebP · GIF · max 15 MB</p>
        </div>
        <input
          id="pa-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          class="hidden"
          on:change={onFileInput}
        />
      </div>
    {/if}

  </div><!-- /.body -->

  <!-- -- Footer --------------------------------------------------- -->
  <svelte:fragment slot="footer">
    <div class="flex gap-2 w-full">

      <!-- Delete button (edit mode only) -->
      {#if mode === 'edit' && plan}
        {#if confirming}
          {#if planComponentCount > 0}
            <p class="text-xs text-red-400 self-center">
              ⚠ Also deletes {planComponentCount} component{planComponentCount !== 1 ? 's' : ''}
            </p>
          {/if}
          <button
            on:click={() => confirming = false}
            disabled={saving}
            class="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600
                   text-slate-300 disabled:opacity-40 transition-colors"
          >Keep</button>
          <button
            on:click={handleDelete}
            disabled={saving}
            class="px-4 py-1.5 text-xs rounded-lg bg-red-700 hover:bg-red-600
                   text-white font-medium disabled:opacity-40 transition-colors"
          >{saving ? 'Deleting…' : 'Confirm delete'}</button>
        {:else}
          <button
            on:click={handleDelete}
            disabled={saving}
            class="px-3 py-1.5 text-xs rounded-lg bg-red-900/40 hover:bg-red-800/50
                   text-red-400 border border-red-800/40 disabled:opacity-40 transition-colors"
          >Delete</button>
        {/if}
      {/if}

      <div class="flex gap-2 ml-auto">
        <Button variant="secondary" on:click={handleClose} disabled={saving}>Cancel</Button>

        {#if mode === 'new'}
          <Button variant="primary" on:click={handleNew} disabled={saving || !editBuilding.trim() || !imageFile}>
            {saving ? 'Creating…' : 'Create Plan'}
          </Button>

        {:else if mode === 'edit'}
          <Button variant="primary" on:click={handleEdit} disabled={saving || !editBuilding.trim()}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>

        {:else if mode === 'copy'}
          <Button variant="primary" on:click={handleCopy} disabled={saving || !editBuilding.trim()}>
            {saving ? 'Copying…' : 'Copy Plan'}
          </Button>

        {:else if mode === 'import'}
          <Button variant="primary" on:click={handleImport} disabled={saving || !importTargetPlanId}>
            {saving ? 'Copying…' : 'Copy Components'}
          </Button>
        {/if}
      </div>

    </div>
  </svelte:fragment>

</Modal>
