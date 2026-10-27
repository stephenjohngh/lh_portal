<!-- src/lib/apps/admin/components/AuditLogFilters.svelte -->
<!-- Advanced filtering for audit logs -->
<script>
  import { today, addDaysISO, addMonthsISO } from '#lib/utils/dates.js';
  import { createEventDispatcher } from 'svelte';
  import FormInput from '#lib/components/common/FormInput.svelte';
  import FormSelect from '#lib/components/common/FormSelect.svelte';
  import Button from '#lib/components/common/Button.svelte';

  export let filters;

  const dispatch = createEventDispatcher();


  const eventTypes = [
    { value: null,                 label: 'All Event Types' },
    { value: 'login',              label: '✓ Login' },
    { value: 'logout',             label: '⎋ Logout' },
    { value: 'failed_login',       label: '✗ Failed Login' },
    { value: 'create',             label: '+ Create' },
    { value: 'update',             label: '✎ Update' },
    { value: 'delete',             label: '⌫ Delete' },
    { value: 'permission_change',  label: '⚙ Permission Change' },
    { value: 'password_reset',     label: '🔑 Password Reset' },
    { value: 'session_expired',    label: '⏱ Session Expired' },
    { value: 'suspicious_activity',label: '⚠ Suspicious Activity' },
    { value: 'ai_suggest',         label: '🤖 AI Suggestion' }
  ];

  const categories = [
    { value: null,          label: 'All Categories' },
    { value: 'auth',        label: '🔐 Authentication' },
    { value: 'users',       label: '👥 Users' },
    { value: 'issues',      label: '📋 Issues' },
    { value: 'comments',    label: '💬 Comments' },
    { value: 'actions',     label: '✓ Actions' },
    { value: 'plans',       label: '🗺 Floor Schematics' },
    { value: 'permissions', label: '⚙ Permissions' },
    { value: 'security',    label: '🛡 Security' },
    { value: 'system',      label: '⚡ System' },
    { value: 'ai_assist',   label: '🤖 AI Assist' }
  ];

  const severities = [
    { value: null,       label: 'All Severities' },
    { value: 'info',     label: 'ℹ Info' },
    { value: 'warning',  label: '⚠ Warning' },
    { value: 'error',    label: '✗ Error' },
    { value: 'critical', label: '🔴 Critical' }
  ];

  function handleApply() {
    dispatch('change');
  }

  function handleReset() {
    filters = {
      appId:         null,
      userId:        null,
      eventType:     null,
      eventCategory: null,
      severity:      null,
      startDate:     null,
      endDate:       null,
      search:        '',
      flaggedOnly:   false,
      limit:         100,
      offset:        0
    };
    dispatch('change');
  }

  function setQuickFilter(type) {
    switch(type) {
      case 'today':
        filters.startDate = today();
        filters.endDate   = today();
        break;
      case 'week': {
        filters.startDate = addDaysISO(today(), -7);
        filters.endDate   = today();
        break;
      }
      case 'month': {
        filters.startDate = addMonthsISO(today(), -1);
        filters.endDate   = today();
        break;
      }
      case 'auth':     filters.eventCategory = 'auth';     break;
      case 'critical': filters.severity      = 'critical'; break;
    }
    dispatch('change');
  }

  $: hasActiveFilters = !!(
    filters.search || filters.appId || filters.eventType ||
    filters.eventCategory || filters.severity ||
    filters.startDate || filters.endDate || filters.flaggedOnly
  );
</script>

<div class="card mb-6">
  <!-- Quick Filters -->
  <div class="flex flex-wrap gap-2 mb-4 pb-4 border-b border-slate-600">
    <span class="text-label self-center">Quick:</span>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('today')}>Today</Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('week')}>Last 7 Days</Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('month')}>Last 30 Days</Button>
    <span class="text-muted mx-1">|</span>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('auth')}>🔐 Auth</Button>
    <Button variant="secondary" size="small" on:click={() => setQuickFilter('critical')}>🔴 Critical</Button>
  </div>

  <!-- Advanced filters. Search, App and Flagged are in the toolbar above (AuditLogsView), not repeated here. -->
  <!-- Compact: each control is about 9.5rem wide, as many per row as fit (four or
       more), so the filters take a row or two and the results stay in view. -->
  <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));">
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

    <!-- Date Range -->
    <FormInput label="Start Date" type="date" bind:value={filters.startDate} on:change={handleApply} />
    <FormInput label="End Date"   type="date" bind:value={filters.endDate}   on:change={handleApply} />
  </div>

  <!-- Footer -->
  <div class="flex justify-between items-center mt-4 pt-4 border-t border-slate-600">
    <div class="text-muted-sm">
      {hasActiveFilters ? 'Filters active' : 'No filters applied'}
    </div>
    <Button variant="secondary" size="medium" on:click={handleReset}>
      Reset All Filters
    </Button>
  </div>
</div>
