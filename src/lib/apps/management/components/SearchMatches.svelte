<!-- src/lib/apps/management/components/SearchMatches.svelte -->
<!-- What the search actually found in this issue.

     The old behaviour was a shorter list and nothing else: an issue with forty
     activities appeared because one of them mentioned the term, and the reader
     had to open it and use the browser's own find to discover which. This says
     where each hit is and shows the line, so the list answers the question
     rather than narrowing it.

     Clicking a match opens the section it lives in and then scrolls to the
     entry itself, marking it briefly — the same "you are here" the Dossier
     reader gives a search hit, through the same helper. -->
<script>
  import { createEventDispatcher } from 'svelte';

  /** [{ where, label, snippet: { text, from, to }, activityId?, actionId? }] */
  export let matches = [];

  const dispatch = createEventDispatcher();

  /**
   * Where clicking this match should take the reader.
   *
   * On an issue card that means opening the section the hit lives in and
   * scrolling to the entry. In the meetings list there is nothing to expand —
   * the whole minutes view is the destination — so the parent listens for
   * `open` instead and decides for itself.
   */
  function open(match) {
    dispatch('open', match);

    if (match.where === 'action' && match.actionId) {
      dispatch('openActions', { id: `action-${match.actionId}` });
    }
    if (match.where === 'activity' && match.activityId) {
      // A historic entry is filtered out of the list, so there is nothing to
      // scroll to. Open the section anyway; the label says why.
      dispatch('openActivity', { id: match.historic ? null : `activity-${match.activityId}` });
    }
  }
</script>

{#if matches.length}
  <div class="mt-2 pt-2 border-t border-slate-700/50 space-y-1">
    {#each matches as match}
      {@const clickable = true}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex items-start gap-2 text-xs {clickable ? 'cursor-pointer hover:bg-slate-700/30' : ''} rounded px-1 py-0.5"
        title="Go to this"
        on:click|stopPropagation={() => open(match)}
      >
        <span class="shrink-0 text-[10px] uppercase tracking-wide text-slate-500
                     pt-0.5 w-20 text-right">
          {match.label}{#if match.historic}<span class="block text-slate-600 normal-case">archived</span>{/if}
        </span>
        {#if match.issueName}
          <span class="shrink-0 text-[10px] text-slate-500 pt-0.5 max-w-[10rem] truncate"
                title={match.issueName}>{match.issueName}</span>
        {/if}
        <span class="text-slate-400 min-w-0">
          <!-- Sliced by the offsets the search returned, so text somebody typed
               is never interpolated into markup. -->
          {match.snippet.text.slice(0, match.snippet.from)}<mark
            class="bg-purple-500/30 text-purple-100 rounded px-0.5"
          >{match.snippet.text.slice(match.snippet.from, match.snippet.to)}</mark
          >{match.snippet.text.slice(match.snippet.to)}
        </span>
      </div>
    {/each}
  </div>
{/if}
