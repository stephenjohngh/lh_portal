<!-- src/lib/apps/users/components/UserAuditTab.svelte -->
<!-- Tab integration for UserListApp to add Audit Logs -->
<script>
  import AuditLogsView from './AuditLogsView.svelte';
  
  // This component is a simple wrapper to add Audit Logs as a tab in UserListApp
  // Usage in UserListApp.svelte:
  /*
  <script>
    import UserAuditTab from './components/UserAuditTab.svelte';
    
    let activeTab = 'users'; // 'users' or 'audit'
  </script>

  <div class="app-container">
    <!-- Tabs -->
    <div class="flex space-x-2 mb-6 border-b border-slate-600">
      <button
        class="px-4 py-2 {activeTab === 'users' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400'}"
        on:click={() => activeTab = 'users'}
      >
        👥 Users
      </button>
      <button
        class="px-4 py-2 {activeTab === 'audit' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400'}"
        on:click={() => activeTab = 'audit'}
      >
        📋 Audit Logs
      </button>
    </div>

    <!-- Content -->
    {#if activeTab === 'users'}
      <!-- Existing user management UI -->
      <UserFilters ... />
      <div class="grid-cards">
        ...existing user cards...
      </div>
    {:else if activeTab === 'audit'}
      <UserAuditTab />
    {/if}
  </div>
  */
</script>

<AuditLogsView />
