<!-- src/lib/apps/users/components/AuditLogCard.svelte -->
<!-- REFACTORED: Uses new CSS utility classes -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import { formatDate } from '$lib/utils/dates';

  export let log;
  export let selected = false;

  const dispatch = createEventDispatcher();

  let expanded = false;
  let showFlagDialog = false;
  let flagReason = '';

  const severityColors = {
    info: 'bg-blue-600',
    warning: 'bg-amber-600',
    error: 'bg-red-600',
    critical: 'bg-purple-600'
  };

  const eventIcons = {
    login: 'login',
    logout: 'logout',
    failed_login: 'alert',
    create: 'plus',
    update: 'edit',
    delete: 'delete',
    permission_change: 'settings',
    password_reset: 'key',
    session_expired: 'clock',
    suspicious_activity: 'alert-triangle'
  };

  const eventColors = {
    login: 'text-green-400',
    logout: 'text-gray-400',
    failed_login: 'text-red-400',
    create: 'text-blue-400',
    update: 'text-yellow-400',
    delete: 'text-red-400',
    permission_change: 'text-purple-400',
    password_reset: 'text-amber-400',
    session_expired: 'text-gray-400',
    suspicious_activity: 'text-red-400'
  };

  function handleSelect() {
    dispatch('select');
  }

  function handleDelete() {
    dispatch('delete');
  }

  function handleFlag() {
    if (!flagReason.trim()) {
      alert('Please provide a reason for flagging this log');
      return;
    }
    dispatch('flag', flagReason);
    showFlagDialog = false;
    flagReason = '';
  }

  function handleUnflag() {
    dispatch('unflag');
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
</script>

<div class="card {selected ? 'ring-2 ring-purple-500' : ''}">
  <div class="flex-between">
    <div class="flex-row-md items-start flex-1">
      <!-- Checkbox -->
      <input
        type="checkbox"
        checked={selected}
        on:change={handleSelect}
        class="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-500 focus:ring-purple-500"
      />

      <!-- Icon -->
      <div class="flex-shrink-0 mt-0.5">
        <Icon 
          name={eventIcons[log.event_type] || 'info'} 
          size={5}
          className={eventColors[log.event_type] || 'text-gray-400'}
        />
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <!-- Header Row -->
        <div class="flex-row-wrap gap-2 mb-1">
          <span class="font-semibold text-white">{log.user_email}</span>
          <span class="text-muted">•</span>
          <span class="text-sm capitalize {eventColors[log.event_type] || 'text-gray-400'}">
            {log.event_type.replace(/_/g, ' ')}
          </span>
          {#if log.target_name}
            <span class="text-muted">→</span>
            <span class="text-sm text-muted truncate">{log.target_name}</span>
          {/if}
          
          <!-- Badges -->
          <Badge color={severityColors[log.severity] || 'bg-gray-600'}>
            {log.severity}
          </Badge>
          {#if log.flagged}
            <Badge color="bg-red-600">🚩 Flagged</Badge>
          {/if}
        </div>

        <!-- Timestamp & Details -->
        <div class="text-muted-sm mb-2">
          {formatTimestamp(log.created_at)}
          {#if log.user_ip_address}
            <span class="ml-2">• IP: {log.user_ip_address}</span>
          {/if}
        </div>

        <!-- Category & Action Pills -->
        <div class="flex-row-wrap text-xs">
          <span class="pill-purple">
            {log.event_category}
          </span>
          <span class="pill-slate">
            {log.event_action}
          </span>
          {#if log.target_type}
            <span class="pill-slate">
              Target: {log.target_type}
            </span>
          {/if}
        </div>

        <!-- Changes Preview -->
        {#if log.changes}
          <button
            class="text-sm text-purple-400 hover:text-purple-300 mt-2 flex-row-sm"
            on:click={() => expanded = !expanded}
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={4} />
            <span>{expanded ? 'Hide' : 'View'} Changes</span>
          </button>
        {/if}
      </div>

      <!-- Actions -->
      <div class="flex-row-sm items-start">
        {#if !log.flagged}
          <Button
            variant="secondary"
            size="small"
            icon="flag"
            title="Flag as suspicious"
            on:click={() => showFlagDialog = true}
          />
        {:else}
          <Button
            variant="secondary"
            size="small"
            icon="flag"
            title="Unflag"
            on:click={handleUnflag}
          />
        {/if}
        <Button
          variant="danger"
          size="small"
          icon="delete"
          title="Delete log (testing only)"
          on:click={handleDelete}
        />
      </div>
    </div>
  </div>

  <!-- Expanded Details -->
  {#if expanded && log.changes}
    <div class="mt-4 p-4 bg-slate-700/50 rounded border border-slate-600">
      <h4 class="font-semibold mb-3 flex-row">
        <Icon name="info" size={4} />
        <span>Change Details</span>
      </h4>
      
      {#if log.changes.before && log.changes.after}
        <div class="grid grid-cols-2 gap-4">
          <div>
            <h5 class="text-sm font-semibold text-red-400 mb-2">Before:</h5>
            <pre class="code-block">{JSON.stringify(log.changes.before, null, 2)}</pre>
          </div>
          <div>
            <h5 class="text-sm font-semibold text-green-400 mb-2">After:</h5>
            <pre class="code-block">{JSON.stringify(log.changes.after, null, 2)}</pre>
          </div>
        </div>
        {#if log.changes.fields_changed}
          <div class="mt-3">
            <span class="text-sm font-semibold">Fields Changed:</span>
            <div class="flex-row-wrap mt-1">
              {#each log.changes.fields_changed as field}
                <span class="pill-amber">
                  {field}
                </span>
              {/each}
            </div>
          </div>
        {/if}
      {:else}
        <pre class="code-block">{JSON.stringify(log.changes, null, 2)}</pre>
      {/if}

      {#if log.metadata}
        <div class="mt-4">
          <h5 class="text-sm font-semibold mb-2">Metadata:</h5>
          <pre class="code-block">{JSON.stringify(log.metadata, null, 2)}</pre>
        </div>
      {/if}

      {#if log.user_agent}
        <div class="mt-3 text-xs text-muted">
          <strong>User Agent:</strong> {log.user_agent}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Flag Dialog -->
  {#if showFlagDialog}
    <div class="mt-4 card-warning-light">
      <h4 class="font-semibold text-red-400 mb-3">Flag as Suspicious</h4>
      <textarea
        bind:value={flagReason}
        placeholder="Enter reason for flagging this activity..."
        rows="3"
        class="textarea mb-3"
      />
      <div class="btn-group">
        <Button
          variant="danger"
          size="small"
          on:click={handleFlag}
        >
          Flag Event
        </Button>
        <Button
          variant="secondary"
          size="small"
          on:click={() => { showFlagDialog = false; flagReason = ''; }}
        >
          Cancel
        </Button>
      </div>
    </div>
  {/if}
</div>
