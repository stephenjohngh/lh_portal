<!-- src/lib/apps/admin/components/UserStats.svelte -->
<script>
  export let users = [];

  $: totalUsers = users.length;
  $: adminUsers = users.filter(u => u.is_admin).length;
  $: activeUsers = users.filter(u => !u.is_read_only).length;
  $: readOnlyUsers = users.filter(u => u.is_read_only).length;
</script>

<div class="mt-6 pt-4 border-t border-slate-700">
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <!-- Total Users -->
    <div class="bg-slate-700/30 rounded-lg p-4 text-center">
      <div class="text-3xl font-bold text-purple-400 mb-1">
        {totalUsers}
      </div>
      <div class="text-sm text-gray-400">Total Users</div>
    </div>

    <!-- Admin Users -->
    <div class="bg-slate-700/30 rounded-lg p-4 text-center">
      <div class="text-3xl font-bold text-blue-400 mb-1">
        {adminUsers}
      </div>
      <div class="text-sm text-gray-400">Admins</div>
    </div>

    <!-- Active Users -->
    <div class="bg-slate-700/30 rounded-lg p-4 text-center">
      <div class="text-3xl font-bold text-green-400 mb-1">
        {activeUsers}
      </div>
      <div class="text-sm text-gray-400">Active</div>
    </div>

    <!-- Read-Only Users -->
    <div class="bg-slate-700/30 rounded-lg p-4 text-center">
      <div class="text-3xl font-bold text-amber-400 mb-1">
        {readOnlyUsers}
      </div>
      <div class="text-sm text-gray-400">Read-Only</div>
    </div>
  </div>
</div>
