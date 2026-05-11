<!-- src/lib/apps/management/components/IssueForm.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import { PRIORITIES } from '$lib/utils/constants';
  import { ISSUE_STATUS, ISSUE_STATUS_OPTIONS } from '$lib/utils/constants';
  import { fmtDate, toDateTimeLocal } from '$lib/utils/dates.js';
  import { permissions } from '$lib/stores/permissions';

  export let show = false;
  export let issue = null; // null for new, object for edit

  const dispatch = createEventDispatcher();

  let formData = {
    name: issue?.name || '',
    description: issue?.description || '',
    priority: issue?.priority || 3,
    status: issue?.status || ISSUE_STATUS.CURRENT
  };

  let formErrors = { name: '' };

  // Admin-only date overrides (edit mode only)
  let adminCreatedAt = '';
  let adminUpdatedAt = '';

  // Populate form when editing an existing issue
  $: if (issue) {
    formData = {
      name: issue.name,
      description: issue.description,
      priority: parseInt(issue.priority) || 3,
      status: issue.status || ISSUE_STATUS.CURRENT
    };
    adminCreatedAt = toDateTimeLocal(issue.created_at);
    adminUpdatedAt = toDateTimeLocal(issue.updated_at);
  }

  // Reset to blank each time the modal opens for a new issue.
  // The component is reused between opens so formData must be cleared explicitly.
  $: if (show && !issue) {
    formData  = { name: '', description: '', priority: 3, status: ISSUE_STATUS.CURRENT };
    formErrors = { name: '' };
  }

  // NEW: Dynamic modal title with issue number
  $: modalTitle = issue && issue.issue_number 
    ? `Edit Issue #${issue.issue_number}`
    : issue 
    ? 'Edit Issue' 
    : 'New Issue';

  function validateForm() {
    formErrors.name = '';
    
    if (!formData.name.trim()) {
      formErrors.name = 'Issue name is required';
      return false;
    }
    
    return true;
  }

  function handleSubmit() {
    if (!validateForm()) return;
    const payload = { ...formData };
    if ($permissions.isAdmin && issue) {
      if (adminCreatedAt) payload.override_created_at = new Date(adminCreatedAt).toISOString();
      if (adminUpdatedAt) payload.override_updated_at = new Date(adminUpdatedAt).toISOString();
    }
    dispatch('submit', payload);
    close();
  }

  function close() {
    formErrors = { name: '' };
    dispatch('close');
  }

  // Convert PRIORITIES array to select options format
  $: priorityOptions = PRIORITIES.map(p => ({
    value: p.value,
    label: `${p.value} - ${p.label}`
  }));
</script>

<Modal 
  bind:show
  title={modalTitle}
  size="medium"
  on:close={close}
>
  <div class="space-y-4">
    <!-- NEW: Issue Number Display when editing -->
    {#if issue?.issue_number}
      <div class="p-3 bg-purple-500/10 border border-purple-500/50 rounded-lg">
        <div class="flex items-center space-x-2">
          <span class="text-2xl">🔢</span>
          <div>
            <p class="text-sm font-semibold text-purple-400">
              Issue #{issue.issue_number}
            </p>
            <p class="text-xs text-gray-400">
              Created {fmtDate(issue.created_at)}
            </p>
          </div>
        </div>
      </div>
    {/if}
    <!-- END NEW CODE -->
    
    <FormInput
      label="Name"
      type="text"
      bind:value={formData.name}
      placeholder="Issue name"
      required={true}
      error={formErrors.name}
      on:input={() => formErrors.name = ''}
    />
    
    <FormTextarea
      label="Description"
      bind:value={formData.description}
      placeholder="Issue description (optional)"
      rows={4}
    />
    
    <div class="grid grid-cols-2 gap-4">
      <FormSelect
        label="Priority"
        bind:value={formData.priority}
        options={priorityOptions}
        required={true}
      />

      <FormSelect
        label="Status"
        bind:value={formData.status}
        options={ISSUE_STATUS_OPTIONS}
        required={true}
      />
    </div>

    {#if issue && $permissions.isAdmin}
      <div class="border-t border-slate-600 pt-4">
        <div class="flex items-start gap-2 px-3 py-2 rounded bg-amber-900/20 border border-amber-700/40 text-xs text-amber-200 mb-3">
          <span class="shrink-0">⚠️</span>
          <span><strong>Admin only — record timestamps.</strong> In normal use leave these as their automatic values. Only edit to correct a historical data-entry error.</span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="issue-admin-created" class="block text-xs font-medium text-slate-400 mb-1">Created</label>
            <input
              id="issue-admin-created"
              type="datetime-local"
              bind:value={adminCreatedAt}
              class="w-full px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div>
            <label for="issue-admin-updated" class="block text-xs font-medium text-slate-400 mb-1">Modified</label>
            <input
              id="issue-admin-updated"
              type="datetime-local"
              bind:value={adminUpdatedAt}
              class="w-full px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex space-x-3">
    <Button
      variant="secondary"
      size="large"
      fullWidth={true}
      on:click={close}
    >
      Cancel
    </Button>
    <Button
      variant="primary"
      size="large"
      fullWidth={true}
      icon={issue ? 'edit' : 'plus'}
      on:click={handleSubmit}
    >
      {issue ? 'Update' : 'Create'} Issue
    </Button>
  </div>
</Modal>
