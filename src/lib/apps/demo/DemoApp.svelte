<!-- src/lib/apps/demo/DemoApp.svelte -->
<!-- Updated to use LoadingSpinner component -->
<script>
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth';
  import { permissions } from '$lib/stores/permissions';
  import { getLogger } from '$lib/utils/logger';
  import Button from '$lib/components/common/Button.svelte';
  import LoadingSpinner from '$lib/components/common/LoadingSpinner.svelte';

  const logger = getLogger('DemoApp');
  
  import ProtectedButton from '$lib/components/common/ProtectedButton.svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormTextarea from '$lib/components/common/FormTextarea.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Modal from '$lib/components/common/Modal.svelte';
  import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Checkbox from '$lib/components/common/Checkbox.svelte';

  // State management
  let items = [
    { id: 1, name: 'Example Item 1', status: 'active', priority: 'high', completed: false },
    { id: 2, name: 'Example Item 2', status: 'pending', priority: 'medium', completed: false },
    { id: 3, name: 'Example Item 3', status: 'active', priority: 'low', completed: true }
  ];

  let searchTerm = '';
  let selectedStatus = 'all';
  let showAllItems = true;
  let loading = false;

  // Modal states
  let showAddModal = false;
  let showEditModal = false;
  let showConfirmDelete = false;
  let itemToDelete = null;
  let editingItem = null;

  // Form state
  let newItem = {
    name: '',
    description: '',
    status: 'pending',
    priority: 'medium',
    completed: false
  };

  let formErrors = {
    name: '',
    description: ''
  };

  // Options for dropdowns
  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low Priority' },
    { value: 'medium', label: 'Medium Priority' },
    { value: 'high', label: 'High Priority' }
  ];

  // Computed - filtered items
  $: filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    const matchesCompleted = showAllItems || !item.completed;
    return matchesSearch && matchesStatus && matchesCompleted;
  });

  // Lifecycle
  onMount(async () => {
    // Initialize permissions for 'demo' app
    if ($auth.user) {
      await permissions.init($auth.user.id, 'demo');
    }
    
    logger('Demo App mounted');
  });

  // Functions
  function validateForm() {
    formErrors.name = '';
    formErrors.description = '';

    if (!newItem.name.trim()) {
      formErrors.name = 'Name is required';
      return false;
    }

    if (newItem.name.length < 3) {
      formErrors.name = 'Name must be at least 3 characters';
      return false;
    }

    return true;
  }

  function handleAddItem() {
    if (!validateForm()) return;

    const item = {
      id: Math.max(...items.map(i => i.id), 0) + 1,
      name: newItem.name,
      description: newItem.description,
      status: newItem.status,
      priority: newItem.priority,
      completed: false
    };

    items = [...items, item];
    resetForm();
    showAddModal = false;
  }

  function handleEditItem() {
    if (!editingItem) return;

    items = items.map(item => 
      item.id === editingItem.id ? { ...editingItem } : item
    );

    editingItem = null;
    showEditModal = false;
  }

  function confirmDelete(item) {
    itemToDelete = item;
    showConfirmDelete = true;
  }

  function handleDeleteConfirmed() {
    items = items.filter(item => item.id !== itemToDelete.id);
    itemToDelete = null;
    showConfirmDelete = false;
  }

  function toggleItemComplete(item) {
    items = items.map(i => 
      i.id === item.id ? { ...i, completed: !i.completed } : i
    );
  }

  function resetForm() {
    newItem = {
      name: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      completed: false
    };
    formErrors = {
      name: '',
      description: ''
    };
  }

  function openEditModal(item) {
    editingItem = { ...item };
    showEditModal = true;
  }

  function getPriorityColor(priority) {
    const colors = {
      low: 'bg-blue-600',
      medium: 'bg-yellow-600',
      high: 'bg-red-600'
    };
    return colors[priority] || colors.medium;
  }

  function getStatusColor(status) {
    const colors = {
      active: 'bg-green-600',
      pending: 'bg-orange-600',
      completed: 'bg-gray-600'
    };
    return colors[status] || colors.pending;
  }
</script>

<div class="bg-slate-800 rounded-xl p-6 border border-slate-700">
  <!-- Header -->
  <div class="flex justify-between items-start mb-6">
    <div>
      <h2 class="text-3xl font-bold mb-1">Component Demo App</h2>
      <p class="text-gray-400">Example app showcasing all common components and patterns</p>
    </div>
    <div class="flex space-x-2">
      <Button
        variant="primary"
        size="large"
        icon="chart"
      >
        View Report
      </Button>
      <ProtectedButton
        action="modify"
        variant="amber"
        size="large"
        icon="plus"
        on:click={() => showAddModal = true}
      >
        Add Item
      </ProtectedButton>
    </div>
  </div>

  <!-- Filters Section -->
  <div class="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
    <!-- Search Input -->
    <div class="md:col-span-2">
      <div class="relative">
        <input
          type="text"
          bind:value={searchTerm}
          placeholder="Search items..."
          class="w-full px-4 py-2 pl-10 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <Icon name="search" size={5} className="text-gray-400 absolute left-3 top-2.5" />
      </div>
    </div>

    <!-- Status Filter -->
    <div>
      <select
        bind:value={selectedStatus}
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {#each statusOptions as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Checkbox Example -->
  <div class="mb-4 flex items-center space-x-6">
    <Checkbox
      bind:checked={showAllItems}
      label="Show completed items"
    />
    <div class="text-sm text-gray-400">
      {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} found
    </div>
  </div>

  <!-- Quick Action Buttons Row -->
  <div class="mb-4 flex flex-wrap gap-2">
    <Button variant="primary" size="small" icon="refresh">
      Refresh
    </Button>
    <Button variant="blue" size="small" icon="download">
      Export
    </Button>
    <Button variant="secondary" size="small" icon="settings">
      Settings
    </Button>
    <ProtectedButton 
      action="modify"
      variant="danger" 
      size="small" 
      icon="delete"
    >
      Clear All
    </ProtectedButton>
  </div>

  <!-- Loading State Example -->
  {#if loading}
    <LoadingSpinner text="Loading demo data..." />

  <!-- Items List -->
  {:else if filteredItems.length === 0}
    <div class="text-center py-12">
      <Icon name="clipboard" size={16} className="text-gray-600 mx-auto mb-4" />
      <p class="text-gray-400">No items found. Click "Add Item" to create one.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each filteredItems as item}
        <div class="bg-slate-700/50 rounded-lg p-4 border border-slate-600 hover:border-purple-500 transition-colors">
          <div class="flex items-start justify-between">
            <div class="flex items-start space-x-3 flex-1">
              <!-- Checkbox for completion -->
              <div class="pt-1">
                <input
                  type="checkbox"
                  checked={item.completed}
                  on:change={() => toggleItemComplete(item)}
                  class="w-5 h-5 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                />
              </div>

              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <h3 class="text-lg font-semibold text-white {item.completed ? 'line-through text-gray-500' : ''}">
                    {item.name}
                  </h3>
                  <Badge color={getPriorityColor(item.priority)}>
                    {item.priority}
                  </Badge>
                  <Badge color={getStatusColor(item.status)}>
                    {item.status}
                  </Badge>
                  {#if item.completed}
                    <Badge color="bg-emerald-600">
                      ✓ Completed
                    </Badge>
                  {/if}
                </div>
                
                {#if item.description}
                  <p class="text-gray-300 text-sm">{item.description}</p>
                {/if}

                <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span class="flex items-center gap-1">
                    <Icon name="calendar" size={4} />
                    ID: {item.id}
                  </span>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex space-x-1">
              <ProtectedButton
                action="modify"
                variant="secondary"
                size="small"
                icon="edit"
                iconPosition="only"
                on:click={() => openEditModal(item)}
                title="Edit item"
              />
              <ProtectedButton
                action="modify"
                variant="danger"
                size="small"
                icon="delete"
                iconPosition="only"
                on:click={() => confirmDelete(item)}
                title="Delete item"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Stats Footer -->
  <div class="mt-6 pt-4 border-t border-slate-700">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
      <div class="bg-slate-700/30 rounded-lg p-3">
        <div class="text-2xl font-bold text-purple-400">{items.length}</div>
        <div class="text-sm text-gray-400">Total Items</div>
      </div>
      <div class="bg-slate-700/30 rounded-lg p-3">
        <div class="text-2xl font-bold text-green-400">
          {items.filter(i => i.status === 'active').length}
        </div>
        <div class="text-sm text-gray-400">Active</div>
      </div>
      <div class="bg-slate-700/30 rounded-lg p-3">
        <div class="text-2xl font-bold text-orange-400">
          {items.filter(i => i.status === 'pending').length}
        </div>
        <div class="text-sm text-gray-400">Pending</div>
      </div>
      <div class="bg-slate-700/30 rounded-lg p-3">
        <div class="text-2xl font-bold text-blue-400">
          {items.filter(i => i.completed).length}
        </div>
        <div class="text-sm text-gray-400">Completed</div>
      </div>
    </div>
  </div>
</div>

<!-- Add Item Modal -->
<Modal 
  bind:show={showAddModal}
  title="Add New Item"
  size="medium"
  on:close={resetForm}
>
  <div class="space-y-4">
    <FormInput
      label="Item Name"
      type="text"
      bind:value={newItem.name}
      placeholder="Enter item name"
      required={true}
      error={formErrors.name}
      on:input={() => formErrors.name = ''}
    />

    <FormTextarea
      label="Description"
      bind:value={newItem.description}
      placeholder="Optional description"
      rows={3}
      error={formErrors.description}
    />

    <div class="grid grid-cols-2 gap-4">
      <FormSelect
        label="Status"
        bind:value={newItem.status}
        options={statusOptions.slice(1)}
        required={true}
      />

      <FormSelect
        label="Priority"
        bind:value={newItem.priority}
        options={priorityOptions}
        required={true}
      />
    </div>
  </div>

  <div slot="footer" class="flex space-x-3">
    <Button
      variant="secondary"
      size="large"
      fullWidth={true}
      on:click={() => { showAddModal = false; resetForm(); }}
    >
      Cancel
    </Button>
    <ProtectedButton
      action="modify"
      variant="amber"
      size="large"
      fullWidth={true}
      icon="plus"
      on:click={handleAddItem}
    >
      Add Item
    </ProtectedButton>
  </div>
</Modal>

<!-- Edit Item Modal -->
{#if editingItem}
  <Modal 
    bind:show={showEditModal}
    title="Edit Item"
    size="medium"
    on:close={() => editingItem = null}
  >
    <div class="space-y-4">
      <FormInput
        label="Item Name"
        type="text"
        bind:value={editingItem.name}
        placeholder="Enter item name"
        required={true}
      />

      <FormTextarea
        label="Description"
        bind:value={editingItem.description}
        placeholder="Optional description"
        rows={3}
      />

      <div class="grid grid-cols-2 gap-4">
        <FormSelect
          label="Status"
          bind:value={editingItem.status}
          options={statusOptions.slice(1)}
          required={true}
        />

        <FormSelect
          label="Priority"
          bind:value={editingItem.priority}
          options={priorityOptions}
          required={true}
        />
      </div>

      <Checkbox
        bind:checked={editingItem.completed}
        label="Mark as completed"
      />
    </div>

    <div slot="footer" class="flex space-x-3">
      <Button
        variant="secondary"
        size="large"
        fullWidth={true}
        on:click={() => { showEditModal = false; editingItem = null; }}
      >
        Cancel
      </Button>
      <ProtectedButton
        action="modify"
        variant="primary"
        size="large"
        fullWidth={true}
        icon="edit"
        on:click={handleEditItem}
      >
        Save Changes
      </ProtectedButton>
    </div>
  </Modal>
{/if}

<!-- Delete Confirmation Dialog -->
<ConfirmDialog
  show={showConfirmDelete}
  title="Delete Item"
  message="Are you sure you want to delete '{itemToDelete?.name}'? This action cannot be undone."
  confirmText="Delete"
  cancelText="Cancel"
  danger={true}
  on:confirm={handleDeleteConfirmed}
  on:cancel={() => { showConfirmDelete = false; itemToDelete = null; }}
/>
