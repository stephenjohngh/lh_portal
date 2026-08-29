<!-- src/lib/components/common/EditorFindBar.svelte -->
<!-- Find-in-editor, for any Tiptap editor carrying the EditorSearch extension.

     One component rather than a copy in each editor's toolbar: the two are the
     same bar, and a find that counts differently or answers Escape differently
     depending on which box you are typing in is worse than no find at all.

     The matching lives in $lib/utils/editorSearch.js (pure) and
     editorSearchExtension.js (the ProseMirror plugin). -->
<script>
  import { tick, onDestroy } from 'svelte';
  import { searchState } from '$lib/utils/editorSearchExtension.js';
  import { describeMatches } from '$lib/utils/editorSearch.js';
  import { scrollParent, stickyOffset } from '$lib/utils/revealElement.js';

  /** The Tiptap editor to search. */
  export let editor = null;
  /** Bound by the parent, which owns the toolbar button that opens this. */
  export let open = false;
  /** Smaller controls for a compact toolbar. */
  export let compact = false;

  let query = '';
  let input;

  /**
   * The count, kept by subscribing to the editor rather than by reading it in a
   * reactive statement.
   *
   * Reading it reactively did not work, and the reason is worth writing down: a
   * `$:` block re-runs when the variables it NAMES change, and `editor` is the
   * same object for the editor's whole life. Typing changes `query`, which the
   * count expression does not mention, so it never re-ran — the number only
   * moved when something else happened to re-render the parent, which is
   * exactly what a click or Enter does. Same family of fault as the status
   * dropdown that stopped filtering.
   *
   * A transaction is the honest signal: the plugin recomputes its matches on
   * every one, so this is told the moment there is something new to say.
   */
  let count = 0;
  let index = -1;
  let summary = '';

  /**
   * `summary` is ASSIGNED here rather than derived with `$:`.
   *
   * As a derivation it depended on count, index and query — and Svelte runs
   * reactive statements in dependency order, so it could be evaluated with the
   * new query and the previous count, which is exactly the "one behind" the
   * number showed. Assigning all three together removes the ordering question.
   */
  function refresh() {
    const state = searchState(editor);
    count = state.count;
    index = state.index;
    summary = describeMatches(count, index, query);
  }

  let boundTo = null;
  $: if (editor !== boundTo) {
    boundTo?.off('transaction', refresh);
    boundTo = editor;
    boundTo?.on('transaction', refresh);
    refresh();
  }
  onDestroy(() => boundTo?.off('transaction', refresh));


  // Focus follows opening. Guarded on the primitive so an unrelated parent
  // update does not steal focus back mid-typing.
  let focusedFor = false;
  $: if (open !== focusedFor) {
    focusedFor = open;
    if (open) tick().then(() => { input?.select(); input?.focus(); });
  }

  /**
   * Send the query only when it has actually changed.
   *
   * Guarded on the string, not just on `editor && open`, because the editors
   * re-assign `editor` on every transaction to refresh their toolbars — so this
   * block re-ran on every transaction the search itself caused, re-sending the
   * same query in a loop.
   *
   * Read straight back afterwards: the command dispatches synchronously, so the
   * plugin's answer is there immediately and waiting for the transaction event
   * would be a render later.
   */
  let sentQuery = null;
  $: if (editor && open && query !== sentQuery) {
    sentQuery = query;
    editor.commands.setSearchQuery(query);
    refresh();
  }

  export function close() {
    open = false;
    query = '';
    sentQuery = null;      // so re-opening sends the next query afresh
    editor?.commands.setSearchQuery('');
    editor?.commands.focus();
  }

  /** Breathing room above and below the match. */
  const PAD = 24;

  /**
   * Bring the current match into view — whichever thing does the scrolling.
   *
   * ProseMirror's own `tr.scrollIntoView()` used to do this and was wrong twice
   * over: it stops at the first scrollable ancestor, and it aims for the top of
   * whatever that is. In a page editor that is a box with its own scrollbar and
   * it worked; in a Management or Info note the PAGE scrolls, and the match
   * landed under the app's fixed nav — or, on a long note, nowhere at all.
   *
   * Only scrolls when the match is actually out of view, so walking through
   * hits near each other does not jerk the page about.
   */
  function scrollToMatch() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    let coords;
    try {
      coords = { top: editor.view.coordsAtPos(from).top,
                 bottom: editor.view.coordsAtPos(to).bottom };
    } catch { return; }          // a position that no longer resolves

    const box = scrollParent(editor.view.dom);

    if (box) {
      const bounds = box.getBoundingClientRect();
      if (coords.top < bounds.top + PAD) {
        box.scrollTop += coords.top - bounds.top - PAD;
      } else if (coords.bottom > bounds.bottom - PAD) {
        box.scrollTop += coords.bottom - bounds.bottom + PAD;
      }
      return;
    }

    // The window scrolls. The top of it is covered by the app's nav and
    // whatever the app sticks beneath it, so that is where "the top" begins.
    const top = stickyOffset();
    if (coords.top < top + PAD) {
      window.scrollTo({ top: window.scrollY + coords.top - top - PAD, behavior: 'smooth' });
    } else if (coords.bottom > window.innerHeight - PAD) {
      window.scrollTo({
        top: window.scrollY + coords.bottom - window.innerHeight + PAD,
        behavior: 'smooth',
      });
    }
  }

  /** Step, then show. Both buttons and both keys come through here. */
  function goTo(step) {
    editor?.commands.goToMatch(step);
    scrollToMatch();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter') {
      event.preventDefault();
      goTo(event.shiftKey ? -1 : 1);
    }
  }

  const btn = 'min-w-6 h-6 rounded text-xs text-slate-400 hover:bg-slate-700 hover:text-white';
</script>

{#if open}
  <div class="flex items-center gap-1 shrink-0">
    <input
      bind:this={input}
      bind:value={query}
      on:keydown={onKeydown}
      type="text"
      placeholder="Find"
      class="{compact ? 'w-28' : 'w-40'} px-2 py-0.5 text-xs bg-slate-900 border
             border-slate-600 rounded text-white placeholder-slate-500
             focus:outline-none focus:ring-1 focus:ring-purple-500"
    />
    <!-- Fixed width and tabular figures, so the arrows do not shuffle sideways
         as the count changes under them. -->
    <span class="text-[11px] text-slate-500 w-16 tabular-nums">{summary}</span>
    <button type="button" title="Previous match (Shift+Enter)" class={btn}
            on:click={() => goTo(-1)}>↑</button>
    <button type="button" title="Next match (Enter)" class={btn}
            on:click={() => goTo(1)}>↓</button>
    <button type="button" title="Close (Esc)" class={btn} on:click={close}>✕</button>
  </div>
{/if}
