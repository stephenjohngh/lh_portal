<script>
    import { issuesStore } from '$lib/apps/issues/stores/issuesStore';
    import { auth } from '$lib/stores/auth';
    import { getPriorityLabel, getPriorityColor, getPriorityBg } from '$lib/utils/priorities';
    import { formatDate, isOverdue } from '$lib/utils/dates';
    import { ISSUE_STATUS } from '$lib/utils/constants';
    import Icon from '$lib/components/icons/Icon.svelte';
    import Badge from '$lib/components/common/Badge.svelte';
    import { createEventDispatcher } from 'svelte';

    export let issue;

    const dispatch = createEventDispatcher();

    // COMMENT LOGIC
    // X = active, Y = historic. Hide if X is 0.
    $: activeComments = issue.comments?.filter(c => !c.historic) || [];
    $: historicCount = issue.comments?.filter(c => c.historic).length || 0;

    // ACTION LOGIC
    // X = outstanding (pending/in-progress), Y = overdue. Hide if X is 0.
    $: outstandingActions = issue.actions?.filter(a => a.status !== 'completed') || [];
    $: overdueCount = outstandingActions.filter(a => isOverdue(a.date_deadline)).length || 0;

    function handleEdit() {
        dispatch('edit', issue);
    }

    async function handleDelete() {
        if (confirm('Are you sure you want to delete this issue?')) {
            await issuesStore.deleteIssue(issue.id);
        }
    }

    function getStatusLabel(status) {
        switch (status) {
            case ISSUE_STATUS.CURRENT: return 'Current';
            case ISSUE_STATUS.COMPLETED: return 'Completed';
            case ISSUE_STATUS.ON_HOLD: return 'On Hold';
            default: return status;
        }
    }
</script>

<div class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors shadow-lg">
    <div class="p-5">
        <div class="flex justify-between items-start gap-4 mb-4">
            <div class="flex flex-wrap gap-2">
                <Badge color={getPriorityColor(issue.priority)}>
                    {getPriorityLabel(issue.priority)}
                </Badge>
                <Badge variant="outline" color={issue.status === ISSUE_STATUS.COMPLETED ? 'green' : 'blue'}>
                    {getStatusLabel(issue.status)}
                </Badge>
            </div>
            
            <div class="flex gap-1">
                <button 
                    on:click={handleEdit}
                    class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Edit Issue"
                >
                    <Icon name="edit" size="sm" />
                </button>
                <button 
                    on:click={handleDelete}
                    class="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Delete Issue"
                >
                    <Icon name="trash" size="sm" />
                </button>
            </div>
        </div>

        <h3 class="text-lg font-semibold text-white mb-2 line-clamp-1">{issue.name}</h3>
        <p class="text-slate-400 text-sm mb-4 line-clamp-2 min-h-[2.5rem]">
            {issue.description || 'No description provided.'}
        </p>

        <div class="flex flex-col gap-3">
            <div class="flex items-center gap-2 text-xs text-slate-500">
                <Icon name="clock" size="xs" />
                <span>Updated {formatDate(issue.updated_at)}</span>
                {#if issue.profiles}
                    <span>•</span>
                    <span class="flex items-center gap-1">
                        <Icon name="user" size="xs" />
                        {issue.profiles.full_name || issue.profiles.email}
                    </span>
                {/if}
            </div>

            <div class="flex flex-wrap gap-4 pt-4 border-t border-slate-700/50 mt-1">
                {#if activeComments.length > 0}
                    <div class="flex items-center gap-1.5 text-sm text-slate-400">
                        <Icon name="comment" size="sm" />
                        <span>
                            {activeComments.length} {activeComments.length === 1 ? 'comment' : 'comments'} 
                            {historicCount} historic
                        </span>
                    </div>
                {/if}

                {#if outstandingActions.length > 0}
                    <div class="flex items-center gap-1.5 text-sm text-amber-500">
                        <Icon name="action" size="sm" />
                        <span>
                            {outstandingActions.length} outstanding {outstandingActions.length === 1 ? 'action' : 'actions'} 
                            · {overdueCount} overdue
                        </span>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <button 
        on:click={handleEdit}
        class="w-full py-3 px-5 bg-slate-700/30 hover:bg-slate-700/50 text-slate-300 text-sm font-medium transition-colors flex items-center justify-center gap-2 border-t border-slate-700/50"
    >
        View Details & Updates
        <Icon name="chevron-right" size="sm" />
    </button>
</div>
