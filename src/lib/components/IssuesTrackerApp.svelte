<!-- src/lib/components/IssuesTrackerApp.svelte -->
<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';

  // State
  let issues = [];
  let loading = true;
  let error = '';
  let searchTerm = '';
  let statusFilter = 'all';
  let showCompletedActions = true;
  
  // Expansion states
  let expandedIssues = {};
  let showComments = {};
  let showActions = {};
  
  // Modal states
  let showNewIssueModal = false;
  let showNewCommentModal = false;
  let showNewActionModal = false;
  let editingIssue = null;
  let editingComment = null;
  let editingAction = null;
  let selectedIssueId = null;
  
  // Form data
  let newIssue = { name: '', description: '' };
  let newComment = { comment_text: '' };
  let newAction = { action_text: '', name_text: '', date_deadline: '', status: 'pending' };

  // Fetch all data
  async function fetchIssues() {
    loading = true;
    error = '';
    
    try {
      // Fetch issues with their comments and actions
      const { data: issuesData, error: issuesError } = await supabase
        .from('current_issues')
        .select(`
          *,
          comments (
            id,
            comment_text,
            date,
            created_at
          ),
          actions (
            id,
            action_text,
            name_text,
            date_added,
            date_deadline,
            status,
            created_at
          )
        `)
        .order('original_date', { ascending: false });

      if (issuesError) throw issuesError;
      
      issues = issuesData || [];
    } catch (err) {
      error = err.message;
      console.error('Error fetching issues:', err);
    } finally {
      loading = false;
    }
  }

  // Add new issue
  async function addIssue() {
    if (!newIssue.name.trim()) {
      error = 'Issue name is required';
      return;
    }

    try {
      const { data, error: insertError } = await supabase
        .from('current_issues')
        .insert([{
          name: newIssue.name,
          description: newIssue.description,
          original_date: new Date().toISOString()
        }])
        .select();

      if (insertError) throw insertError;
      
      showNewIssueModal = false;
      newIssue = { name: '', description: '' };
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Update issue
  async function updateIssue(issue) {
    try {
      const { error: updateError } = await supabase
        .from('current_issues')
        .update({
          name: issue.name,
          description: issue.description
        })
        .eq('id', issue.id);

      if (updateError) throw updateError;
      
      editingIssue = null;
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Delete issue
  async function deleteIssue(issueId) {
    if (!confirm('Are you sure you want to delete this issue and all its comments and actions?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('current_issues')
        .delete()
        .eq('id', issueId);

      if (deleteError) throw deleteError;
      
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Add comment
  async function addComment() {
    if (!newComment.comment_text.trim()) return;

    try {
      const { error: insertError } = await supabase
        .from('comments')
        .insert([{
          issue_id: selectedIssueId,
          comment_text: newComment.comment_text,
          date: new Date().toISOString()
        }]);

      if (insertError) throw insertError;
      
      showNewCommentModal = false;
      newComment = { comment_text: '' };
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Update comment
  async function updateComment(comment) {
    try {
      const { error: updateError } = await supabase
        .from('comments')
        .update({ comment_text: comment.comment_text })
        .eq('id', comment.id);

      if (updateError) throw updateError;
      
      editingComment = null;
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Delete comment
  async function deleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (deleteError) throw deleteError;
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Add action
  async function addAction() {
    if (!newAction.action_text.trim()) return;

    try {
      const { error: insertError } = await supabase
        .from('actions')
        .insert([{
          issue_id: selectedIssueId,
          action_text: newAction.action_text,
          name_text: newAction.name_text,
          date_added: new Date().toISOString(),
          date_deadline: newAction.date_deadline || null,
          status: newAction.status
        }]);

      if (insertError) throw insertError;
      
      showNewActionModal = false;
      newAction = { action_text: '', name_text: '', date_deadline: '', status: 'pending' };
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Update action
  async function updateAction(action) {
    try {
      const { error: updateError } = await supabase
        .from('actions')
        .update({
          action_text: action.action_text,
          name_text: action.name_text,
          date_deadline: action.date_deadline,
          status: action.status
        })
        .eq('id', action.id);

      if (updateError) throw updateError;
      
      editingAction = null;
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Delete action
  async function deleteAction(actionId) {
    if (!confirm('Delete this action?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('actions')
        .delete()
        .eq('id', actionId);

      if (deleteError) throw deleteError;
      await fetchIssues();
    } catch (err) {
      error = err.message;
    }
  }

  // Filter issues
  $: filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         issue.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    
    const hasActions = issue.actions?.length > 0;
    if (statusFilter === 'no-actions') return matchesSearch && !hasActions;
    if (statusFilter === 'has-actions') return matchesSearch && hasActions;
    
    return matchesSearch;
  });

  // Format date
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  onMount(() => {
    fetchIssues();
  });
</script>

<div class="bg-slate-800 rounded-xl p-8 border border-slate-700">
  <!-- Header -->
  <div class="flex justify-between items-start mb-6">
    <div>
      <h2 class="text-3xl font-bold mb-2">Issues Tracker</h2>
      <p class="text-gray-400">Manage current issues, actions, and comments</p>
    </div>
    <button
      on:click={() => showNewIssueModal = true}
      class="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>
      <span>New Issue</span>
    </button>
  </div>

  <!-- Filters -->
  <div class="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="md:col-span-2">
      <input
        type="text"
        bind:value={searchTerm}
        placeholder="Search issues..."
        class="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
    </div>
    <select
      bind:value={statusFilter}
      class="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
    >
      <option value="all">All Issues</option>
      <option value="has-actions">With Actions</option>
      <option value="no-actions">No Actions</option>
    </select>
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex justify-between items-center">
      <p class="text-red-400">{error}</p>
      <button on:click={() => error = ''} class="text-red-400 hover:text-red-300">✕</button>
    </div>
  {/if}

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
    </div>

  <!-- Issues List -->
  {:else if filteredIssues.length === 0}
    <div class="text-center py-12 text-gray-400">
      No issues found. {searchTerm ? 'Try a different search.' : 'Click "New Issue" to create one.'}
    </div>

  {:else}
    <div class="space-y-4">
      {#each filteredIssues as issue}
        <div class="bg-slate-700/50 rounded-lg border border-slate-600 overflow-hidden">
          <!-- Issue Header -->
          <div class="p-4">
            <div class="flex justify-between items-start mb-2">
              {#if editingIssue?.id === issue.id}
                <div class="flex-1 mr-4 space-y-2">
                  <input
                    type="text"
                    bind:value={editingIssue.name}
                    class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                    placeholder="Issue name"
                  />
                  <textarea
                    bind:value={editingIssue.description}
                    class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                    rows="3"
                    placeholder="Description"
                  />
                  <div class="flex space-x-2">
                    <button
                      on:click={() => updateIssue(editingIssue)}
                      class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                    >
                      Save
                    </button>
                    <button
                      on:click={() => editingIssue = null}
                      class="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              {:else}
                <div class="flex-1">
                  <h3 class="text-xl font-semibold text-white mb-1">{issue.name}</h3>
                  {#if issue.description}
                    <p class="text-gray-300">{issue.description}</p>
                  {/if}
                  <div class="flex items-center space-x-4 mt-2 text-sm text-gray-400">
                    <span>Created: {formatDate(issue.original_date)}</span>
                    <span>•</span>
                    <span>{issue.comments?.length || 0} comments</span>
                    <span>•</span>
                    <span>{issue.actions?.length || 0} actions</span>
                  </div>
                </div>
                <div class="flex space-x-2">
                  <button
                    on:click={() => editingIssue = {...issue}}
                    class="p-2 hover:bg-slate-600 rounded"
                    title="Edit issue"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                    </svg>
                  </button>
                  <button
                    on:click={() => deleteIssue(issue.id)}
                    class="p-2 hover:bg-red-600/20 rounded text-red-400"
                    title="Delete issue"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                </div>
              {/if}
            </div>

            <!-- Action Buttons -->
            <div class="flex space-x-2 mt-3">
              <button
                on:click={() => showComments[issue.id] = !showComments[issue.id]}
                class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                {showComments[issue.id] ? 'Hide' : 'Show'} Comments ({issue.comments?.length || 0})
              </button>
              <button
                on:click={() => showActions[issue.id] = !showActions[issue.id]}
                class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
              >
                {showActions[issue.id] ? 'Hide' : 'Show'} Actions ({issue.actions?.length || 0})
              </button>
            </div>
          </div>

          <!-- Comments Section -->
          {#if showComments[issue.id]}
            <div class="border-t border-slate-600 bg-slate-800/50 p-4">
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-semibold">Comments</h4>
                <button
                  on:click={() => { selectedIssueId = issue.id; showNewCommentModal = true; }}
                  class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                >
                  Add Comment
                </button>
              </div>
              {#if issue.comments?.length > 0}
                <div class="space-y-2">
                  {#each issue.comments as comment}
                    <div class="bg-slate-700 rounded p-3">
                      {#if editingComment?.id === comment.id}
                        <textarea
                          bind:value={editingComment.comment_text}
                          class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white mb-2"
                          rows="2"
                        />
                        <div class="flex space-x-2">
                          <button
                            on:click={() => updateComment(editingComment)}
                            class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                          >
                            Save
                          </button>
                          <button
                            on:click={() => editingComment = null}
                            class="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      {:else}
                        <div class="flex justify-between items-start">
                          <div class="flex-1">
                            <p class="text-gray-200">{comment.comment_text}</p>
                            <p class="text-xs text-gray-500 mt-1">{formatDateTime(comment.date)}</p>
                          </div>
                          <div class="flex space-x-1">
                            <button
                              on:click={() => editingComment = {...comment}}
                              class="p-1 hover:bg-slate-600 rounded"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                              </svg>
                            </button>
                            <button
                              on:click={() => deleteComment(comment.id)}
                              class="p-1 hover:bg-red-600/20 rounded text-red-400"
                            >
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-gray-400 text-sm">No comments yet.</p>
              {/if}
            </div>
          {/if}

          <!-- Actions Section -->
          {#if showActions[issue.id]}
            <div class="border-t border-slate-600 bg-slate-800/50 p-4">
              <div class="flex justify-between items-center mb-3">
                <h4 class="font-semibold">Actions</h4>
                <button
                  on:click={() => { selectedIssueId = issue.id; showNewActionModal = true; }}
                  class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                >
                  Add Action
                </button>
              </div>
              {#if issue.actions?.length > 0}
                <div class="space-y-2">
                  {#each issue.actions as action}
                    {#if showCompletedActions || action.status !== 'completed'}
                      <div class="bg-slate-700 rounded p-3">
                        {#if editingAction?.id === action.id}
                          <div class="space-y-2">
                            <input
                              type="text"
                              bind:value={editingAction.action_text}
                              class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                              placeholder="Action description"
                            />
                            <input
                              type="text"
                              bind:value={editingAction.name_text}
                              class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                              placeholder="Assigned to"
                            />
                            <input
                              type="date"
                              bind:value={editingAction.date_deadline}
                              class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                            />
                            <select
                              bind:value={editingAction.status}
                              class="w-full px-3 py-2 bg-slate-600 border border-slate-500 rounded text-white"
                            >
                              <option value="pending">Pending</option>
                              <option value="in-progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                            <div class="flex space-x-2">
                              <button
                                on:click={() => updateAction(editingAction)}
                                class="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                              >
                                Save
                              </button>
                              <button
                                on:click={() => editingAction = null}
                                class="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        {:else}
                          <div class="flex justify-between items-start">
                            <div class="flex-1">
                              <p class="text-gray-200 font-medium">{action.action_text}</p>
                              <div class="flex flex-wrap gap-2 mt-2 text-xs">
                                {#if action.name_text}
                                  <span class="px-2 py-1 bg-blue-600/20 text-blue-300 rounded">👤 {action.name_text}</span>
                                {/if}
                                {#if action.date_deadline}
                                  <span class="px-2 py-1 bg-orange-600/20 text-orange-300 rounded">📅 Due: {formatDate(action.date_deadline)}</span>
                                {/if}
                                <span class="px-2 py-1 bg-purple-600/20 text-purple-300 rounded capitalize">{action.status}</span>
                              </div>
                              <p class="text-xs text-gray-500 mt-1">Added: {formatDate(action.date_added)}</p>
                            </div>
                            <div class="flex space-x-1">
                              <button
                                on:click={() => editingAction = {...action}}
                                class="p-1 hover:bg-slate-600 rounded"
                              >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                              </button>
                              <button
                                on:click={() => deleteAction(action.id)}
                                class="p-1 hover:bg-red-600/20 rounded text-red-400"
                              >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  {/each}
                </div>
              {:else}
                <p class="text-gray-400 text-sm">No actions yet.</p>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- New Issue Modal -->
{#if showNewIssueModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">New Issue</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Name</label>
          <input
            type="text"
            bind:value={newIssue.name}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="Issue name"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Description</label>
          <textarea
            bind:value={newIssue.description}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            rows="4"
            placeholder="Issue description"
          />
        </div>
        <div class="flex space-x-2 justify-end">
          <button
            on:click={() => showNewIssueModal = false}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            on:click={addIssue}
            class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
          >
            Create Issue
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- New Comment Modal -->
{#if showNewCommentModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">New Comment</h3>
      <div class="space-y-4">
        <textarea
          bind:value={newComment.comment_text}
          class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          rows="4"
          placeholder="Enter your comment..."
        />
        <div class="flex space-x-2 justify-end">
          <button
            on:click={() => showNewCommentModal = false}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            on:click={addComment}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded"
          >
            Add Comment
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- New Action Modal -->
{#if showNewActionModal}
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div class="bg-slate-800 rounded-lg p-6 max-w-lg w-full border border-slate-700">
      <h3 class="text-xl font-bold mb-4">New Action</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Action Description</label>
          <input
            type="text"
            bind:value={newAction.action_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="What needs to be done?"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Assigned To</label>
          <input
            type="text"
            bind:value={newAction.name_text}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            placeholder="Person or team name"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Deadline</label>
          <input
            type="date"
            bind:value={newAction.date_deadline}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Status</label>
          <select
            bind:value={newAction.status}
            class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          >
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div class="flex space-x-2 justify-end">
          <button
            on:click={() => showNewActionModal = false}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button
            on:click={addAction}
            class="px-4 py-2 bg-green-600 hover:bg-green-700 rounded"
          >
            Add Action
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
