<!-- src/lib/apps/issues/components/IssueForm.svelte -->
<!-- ✨ REFACTORED: Now uses Modal, FormInput, FormTextarea, FormSelect, and validation -->
<script>
  import { createEventDispatcher } from 'svelte';
  import { PRIORITIES } from '$lib/utils/priorities';
  import { ISSUE_STATUS, ISSUE_STATUS_OPTIONS } from '$lib/utils/constants';
  import { isRequired, isValidLength } from '$lib/utils/validation';
  
  // ✨ NEW: Import reusable components
  import Modal from '$lib/components/common/Modal.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';

  export let show = false;
  export let issue = null; // null for new, object for edit
  
  const dispatch = createEventDispatcher();
  
  let formData = {
    name: issue?.name || '',
    description: issue?.description || '',
    priority: issue?.priority || 3,
    status: issue?.status || ISSUE_STATUS.CURRENT
  };

  // ✨ NEW: Validation errors
  let errors = {
    name: ''
  };

  $: if (issue) {
    formData = {
      name: issue.name,
      description: issue.description,
      priority: parseInt(issue.priority) || 3,
      status: issue.status || ISSUE_STATUS.CURRENT
    };
    // Clear errors when issue changes
    errors = { name: '' };
  }

  function handleSubmit() {
    // ✨ NEW: Proper validation
    errors = { name: '' };
    
    if (!isRequired(formData.name)) {
      errors.name = 'Issue name is required';
      return;
    }
    
    if (!isValidLength(formData.name, 3, 200)) {
      errors.name = 'Issue name must be between 3 and 200 characters';
      return;
    }
    
    dispatch('submit', formData);
    close();
  }

  function close() {
    // Clear errors when closing
    errors = { name: '' };
    dispatch('close');
  }
</script>

<!-- ✨ REFACTORED: Using Modal component instead of custom HTML -->
<Modal 
  bind:show={show} 
  title={issue ? 'Edit Issue' : 'New Issue'}
  size="medium"
  on:close={close}
>
  <!-- Modal body -->
  <div class="space-y-4">
    <!-- ✨ REFACTORED: Using FormInput instead of raw input -->
    <FormInput
      label="Name"
      bind:value={formData.name}
      required={true}
      error={errors.name}
      placeholder="Enter issue name"
      helpText="Brief description of the issue"
      maxlength={200}
    />
    
    <!-- ✨ REFACTORED: Using FormTextarea instead of raw textarea -->
    <FormTextarea
      label="Description"
      bind:value={formData.description}
      rows={4}
      placeholder="Detailed description of the issue"
      helpText="Provide as much detail as needed"
    />
    
    <div class="grid grid-cols-2 gap-4">
      <!-- ✨ REFACTORED: Using FormSelect instead of raw select -->
      <FormSelect
        label="Priority"
        bind:value={formData.priority}
        options={PRIORITIES}
        required={true}
      />
      
      <!-- ✨ REFACTORED: Using FormSelect instead of raw select -->
      <FormSelect
        label="Status"
        bind:value={formData.status}
        options={ISSUE_STATUS_OPTIONS}
        required={true}
      />
    </div>
  </div>
  
  <!-- Modal footer -->
  <div slot="footer" class="flex justify-end space-x-2">
    <button
      on:click={close}
      class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
    >
      Cancel
    </button>
    <button
      on:click={handleSubmit}
      class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
    >
      {issue ? 'Update' : 'Create'} Issue
    </button>
  </div>
</Modal>
