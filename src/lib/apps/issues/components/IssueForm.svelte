<!-- src/lib/apps/issues/components/IssueForm.svelte -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/common/Button.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import { PRIORITIES } from '$lib/utils/priorities';
  import { ISSUE_STATUS, ISSUE_STATUS_OPTIONS } from '$lib/utils/constants';

  export let show = false;
  export let issue = null; // null for new, object for edit
  
  const dispatch = createEventDispatcher();
  
  let formData = {
    name: issue?.name || '',
    description: issue?.description || '',
    priority: issue?.priority || 3,
    status: issue?.status || ISSUE_STATUS.CURRENT
  };

  let formErrors = {
    name: ''
  };

  $: if (issue) {
    formData = {
      name: issue.name,
      description: issue.description,
      priority: parseInt(issue.priority) || 3,
      status: issue.status || ISSUE_STATUS.CURRENT
    };
  }

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
    dispatch('submit', formData);
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
  title={issue ? 'Edit Issue' : 'New Issue'}
  size="medium"
  on:close={close}
>
  <div class="space-y-4">
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
