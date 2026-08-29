<!-- src/lib/apps/management/components/SearchMatches.svelte -->
<!-- What the search actually found in this issue.

     The old behaviour was a shorter list and nothing else: an issue with forty
     activities appeared because one of them mentioned the term, and the reader
     had to open it and use the browser's own find to discover which. This says
     where each hit is and shows the line, so the list answers the question
     rather than narrowing it.

     Clicking a match opens the section it lives in, which is as far as this
     goes deliberately — scrolling to the individual activity would need every
     activity to carry an anchor, and the section is usually enough to see it. -->
<script>
  import { createEventDispatcher } from 'svelte';

  /** [{ where, label, snippet: { text, from, to }, activityId?, actionId? }] */
  export let matches = [];

  const dispatch = createEventDispatcher();

  /** Where clicking this match should take the reader. */
  function open(match) {
    if (match.where === 'action')   dispatch('openActions');
    if (match.where === 'activity') dispatch('openActivity');
  }
</script>

{#if matches.length}
  <div class="mt-2 pt-2 border-t border-slate-700/50 space-y-1">
    {#each matches as match}
      {@const clickable = match.where === 'action' || match.where === 'activity'}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
      <div
        class="flex items-start gap-2 text-xs {clickable ? 'cursor-pointer hover:bg-slate-700/30' : ''} rounded px-1 py-0.5"
        title={clickable ? 'Open the section this is in' : ''}
        on:click|stopPropagation={() => open(match)}
      >
        <span class="shrink-0 text-[10px] uppercase tracking-wide text-slate-500
                     pt-0.5 w-20 text-right">{match.label}</span>
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
