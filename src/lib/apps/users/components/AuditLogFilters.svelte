<!-- src/lib/apps/users/components/AuditLogFilters.svelte -->
<!-- Advanced filtering for audit logs -->
<script>
  import { createEventDispatcher } from 'svelte';
  import FormInput from '$lib/components/common/FormInput.svelte';
  import FormSelect from '$lib/components/common/FormSelect.svelte';
  import Button from '$lib/components/common/Button.svelte';

  export let filters;
  
  const dispatch = createEventDispatcher();

  const eventTypes = [
    { value: null, label: 'All Event Types' },
    { value: 'login', label: '✓ Login' },
    { value: 'logout', label: '⎋ Logout' },
    { value: 'failed_login', label: '✗ Failed Login' },
    { value: 'create', label: '+ Create' },
    { value: 'update', label: '✎ Update' },
    { value: 'delete', label: '⌫ Delete' },
    { value: 'permission_change', label: '⚙ Permission Change' },
    { value: 'password_reset', label: '🔑 Password Reset' },
    { value: 'session_expired', label: '⏱ Session Expired' },
    { value: 'suspicious_activity', label: '⚠ Suspicious Activity' }
  ];

  const categories = [
    { value: null, label: 'All Categories' },
    { value: 'auth', label: '🔐 Authentication' },
    { value: 'users', label: '👥 Users' },
    { value: 'issues', label: '📋 Issues' },
    { value: 'comments', label: '💬 Comments' },
    { value: 'actions', label: '✓ Actions' },
    { value: 'permissions', label: '⚙ Permissions' },
    { value: 'security', label: '🛡 Security' },
    { value: 'system', label: '⚡ System' }
  ];

  const severities = [
    { value: null, label: 'All Severities' },
    { value: 'info', label: 'ℹ Info' },
    { value: 'warning', label: '⚠ Warning' },
    { value: 'error', label: '✗ Error' },
    { value: 'critical', label: '🔴 Critical' }
  ];

  function handleApply() {
    dispatch('change');
  }

  function handleReset() {
    filters = {
      userId: null,
      eventType: null,
      eventCategory: null,
      severity: null,
      startDate: null,
      endDate: null,
      search: '',
      flaggedOnly: false,
      limit: 100,
      offset: 0
    };
    dispatch('change');
  }

  function setQuickFilter(type) {
    switch(type) {
      case 'today':
        filters.startDate = new Date().toISOString().split('T')[0];
        filters.endDate = new Date().toISOString().split('T')[0];
        break;
      case 'week':
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        filters.startDate = weekAgo.toISOString().split('T')[0];
        filters.endDate = new Date().toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filters.startDate = monthAgo.toISOString().split('T')[0];
        filters.endDate = new Date().toISOString().split('T')[0];
        break;
      case 'auth':
        filters.eventCategory = 'auth';
        break;
      case 'critical':
        filters.severity = 'critical';
        break;
      case 'flagged':
        filters.flaggedOnly = true;
        break;
    }
    dispatch('change');
  }
</script>

<div class="card mb-6">
  <!-- Quick Filters -->
  <div class="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-600">
    <span class="text-label">Quick Filters:</span>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('today')}>
      Today
    </Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('week')}>
      Last 7 Days
    </Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('month')}>
      Last 30 Days
    </Button>
    <span class="text-muted mx-2">|</span>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('auth')}>
      🔐 Auth Events
    </Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('critical')}>
      🔴 Critical
    </Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('flagged')}>
      🚩 Flagged
    </Button>
  </div>

  <!-- Advanced Filters -->
  <div class="grid-form">
    <!-- Search -->
    <div class="col-span-2">
      <FormInput
        label="Search"
        type="text"
        bind:value={filters.search}
        placeholder="Search by user email or target name..."
        on:input={handleApply}
      />
    </div>

    <!-- Event Type -->
    <FormSelect
      label="Event Type"
      bind:value={filters.eventType}
      options={eventTypes}
      on:change={handleApply}
    />

    <!-- Category -->
    <FormSelect
      label="Category"
      bind:value={filters.eventCategory}
      options={categories}
      on:change={handleApply}
    />

    <!-- Severity -->
    <FormSelect
      label="Severity"
      bind:value={filters.severity}
      options={severities}
      on:change={handleApply}
    />

    <!-- Flagged Only Checkbox -->
    <div class="flex items-center space-x-2 pt-6">
      <input
        type="checkbox"
        id="flagged-only"
        bind:checked={filters.flaggedOnly}
        on:change={handleApply}
        class="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
      />
      <label for="flagged-only" class="text-label cursor-pointer">
        🚩 Flagged Only
      </label>
    </div>

    <!-- Date Range -->
    <FormInput
      label="Start Date"
      type="date"
      bind:value={filters.startDate}
      on:change={handleApply}
    />

    <FormInput
      label="End Date"
      type="date"
      bind:value={filters.endDate}
      on:change={handleApply}
    />
  </div>

  <!-- Actions -->
  <div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-600">
    <div class="text-muted-sm">
      {#if filters.search || filters.eventType || filters.eventCategory || filters.severity || filters.startDate || filters.endDate || filters.flaggedOnly}
        Filters active
      {:else}
        No filters applied
      {/if}
    </div>
    <Button
      variant="secondary"
      size="medium"
      on:click={handleReset}
    >
      Reset All Filters
    </Button>
  </div>
</div>
