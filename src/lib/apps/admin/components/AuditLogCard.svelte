<!-- src/lib/apps/admin/components/AuditLogCard.svelte -->
<!-- Individual audit log card with expandable details -->
<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '$lib/components/icons/Icon.svelte';
  import Badge from '$lib/components/common/Badge.svelte';
  import Button from '$lib/components/common/Button.svelte';
  import { fmtDateTime } from '$lib/utils/dates';

  export let log;
  export let selected = false;

  const dispatch = createEventDispatcher();

  let expanded = false;
  let showFlagDialog = false;
  let flagReason = '';
  let flagError = '';

  const severityColors = {
    info:     'bg-blue-600',
    warning:  'bg-amber-600',
    error:    'bg-red-600',
    critical: 'bg-purple-600'
  };

  const eventIcons = {
    login:               'login',
    logout:              'logout',
    failed_login:        'alert',
    create:              'plus',
    update:              'edit',
    delete:              'delete',
    permission_change:   'settings',
    password_reset:      'key',
    session_expired:     'clock',
    suspicious_activity: 'alert-triangle'
  };

  const eventColors = {
    login:               'text-green-400',
    logout:              'text-gray-400',
    failed_login:        'text-red-400',
    create:              'text-blue-400',
    update:              'text-yellow-400',
    delete:              'text-red-400',
    permission_change:   'text-purple-400',
    password_reset:      'text-amber-400',
    session_expired:     'text-gray-400',
    suspicious_activity: 'text-red-400'
  };

  // Keep in sync with logAudit() appId values across the codebase + legacy values.
  const appLabels = {
    admin:           { label: '👥 Admin',           color: 'bg-purple-600/20 text-purple-400' },
    users:           { label: '👥 Users',           color: 'bg-purple-600/20 text-purple-400' },
    issues:          { label: '📋 Issues',          color: 'bg-green-600/20 text-green-400' },
    building_assets: { label: '🏢 Building Assets', color: 'bg-blue-600/20 text-blue-400' },
    inspection:     { label: '🚶 Inspection',       color: 'bg-orange-600/20 text-orange-400' },
    maintenance:    { label: '🔧 Maintenance',      color: 'bg-yellow-600/20 text-yellow-400' },
    mobileplan:     { label: '📱 Mobile Plan',      color: 'bg-teal-600/20 text-teal-400' },
    plans:          { label: '🗺 Floor Plans',      color: 'bg-amber-600/20 text-amber-400' }
  };

  $: appMeta = log.app_id ? appLabels[log.app_id] : null;

  function handleSelect() { dispatch('select'); }
  function handleDelete() { dispatch('delete'); }

  function handleFlag() {
    if (!flagReason.trim()) {
      flagError = 'Please provide a reason for flagging this log';
      return;
    }
    flagError = '';
    dispatch('flag', flagReason);
    showFlagDialog = false;
    flagReason = '';
  }

  function handleUnflag() { dispatch('unflag'); }

  // fmtDateTime from dates.js gives "23 Feb 2026 14:35" (en-GB, no seconds).
  // For the audit log we want seconds, so we build that here using the same locale.
  function formatTimestamp(timestamp) {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
</script>

<div class="card {selected ? 'ring-2 ring-purple-500' : ''}">
  <div class="flex-between">
    <div class="flex items-start space-x-3 flex-1">
      <input
        type="checkbox"
        checked={selected}
        on:change={handleSelect}
        class="checkbox mt-1"
      />
      <div class="flex-shrink-0 mt-0.5">
        <Icon
          name={eventIcons[log.event_type] || 'info'}
          size={5}
          className={eventColors[log.event_type] || 'text-gray-400'}
        />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center flex-wrap gap-2 mb-1">
          <span class="font-semibold text-white">{log.user_email}</span>
          <span class="text-muted">•</span>
          <span class="text-sm capitalize {eventColors[log.event_type] || 'text-gray-400'}">
            {log.event_type.replace(/_/g, ' ')}
          </span>
          {#if log.target_name}
            <span class="text-muted">→</span>
            <span class="text-sm text-muted truncate">{log.target_name}</span>
          {/if}
          <Badge color={severityColors[log.severity] || 'bg-gray-600'}>{log.severity}</Badge>
          {#if log.flagged}
            <Badge color="bg-red-600">🚩 Flagged</Badge>
          {/if}
        </div>
        <div class="text-muted-sm mb-2">
          {formatTimestamp(log.created_at)}
          {#if log.user_ip_address}
            <span class="ml-2">• IP: {log.user_ip_address}</span>
          {/if}
        </div>
        <div class="flex items-center flex-wrap gap-2 text-xs">
          {#if appMeta}
            <span class="px-2 py-1 rounded {appMeta.color}">{appMeta.label}</span>
          {/if}
          <span class="pill-purple capitalize">{log.event_category}</span>
          <span class="pill-slate capitalize">{log.event_action}</span>
          {#if log.target_type}
            <span class="pill-slate capitalize">Target: {log.target_type}</span>
          {/if}
        </div>
        {#if log.changes}
          <button
            class="text-sm text-purple-400 hover:text-purple-300 mt-2 flex items-center space-x-1"
            on:click={() => expanded = !expanded}
          >
            <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={4} />
            <span>{expanded ? 'Hide' : 'View'} Changes</span>
          </button>
        {/if}
      </div>
      <div class="flex items-start space-x-1">
        {#if !log.flagged}
          <Button variant="secondary" size="small" icon="flag" title="Flag as suspicious" on:click={() => showFlagDialog = true} />
        {:else}
          <Button variant="secondary" size="small" icon="flag" title="Unflag" on:click={handleUnflag} />
        {/if}
        <Button variant="danger" size="small" icon="delete" title="Delete log (testing only)" on:click={handleDelete} />
      </div>
    </div>
  </div>

  {#if expanded && log.changes}
    <div class="mt-4 p-4 bg-slate-700/50 rounded border border-slate-600">
      <h4 class="font-semibold mb-3 flex items-center space-x-2">
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
            <div class="flex flex-wrap gap-2 mt-1">
              {#each log.changes.fields_changed as field}
                <span class="px-2 py-1 bg-amber-600/20 text-amber-400 rounded text-xs">{field}</span>
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

  {#if showFlagDialog}
    <div class="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded">
      <h4 class="font-semibold text-red-400 mb-3">Flag as Suspicious</h4>
      <textarea
        bind:value={flagReason}
        placeholder="Enter reason for flagging this activity..."
        rows="3"
        class="textarea mb-3"
      ></textarea>
      {#if flagError}
        <p class="text-sm text-red-400 mb-3">{flagError}</p>
      {/if}
      <div class="flex space-x-2">
        <Button variant="danger" size="small" on:click={handleFlag}>Flag Event</Button>
        <Button variant="secondary" size="small" on:click={() => { showFlagDialog = false; flagReason = ''; flagError = ''; }}>Cancel</Button>
      </div>
    </div>
  {/if}
</div>
