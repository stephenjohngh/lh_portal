<!-- src/lib/components/common/EditorFindBar.svelte -->
<!-- Find-in-editor, for any Tiptap editor carrying the EditorSearch extension.

     One component rather than a copy in each editor's toolbar: the two are the
     same bar, and a find that counts differently or answers Escape differently
     depending on which box you are typing in is worse than no find at all.

     The matching lives in $lib/utils/editorSearch.js (pure) and
     editorSearchExtension.js (the ProseMirror plugin). -->
<script>
  import { tick } from 'svelte';
  import { searchState } from '$lib/utils/editorSearchExtension.js';
  import { describeMatches } from '$lib/utils/editorSearch.js';

  /** The Tiptap editor to search. */
  export let editor = null;
  /** Bound by the parent, which owns the toolbar button that opens this. */
  export let open = false;
  /** Smaller controls for a compact toolbar. */
  export let compact = false;

  let query = '';
  let input;

  // Recomputed on every transaction: both editors re-assign `editor` in
  // onTransaction, which is what makes this reactive at all.
  $: state = editor ? searchState(editor) : { count: 0, index: -1 };
  $: summary = describeMatches(state.count, state.index, query);

  // Focus follows opening. Guarded on the primitive so an unrelated parent
  // update does not steal focus back mid-typing.
  let focusedFor = false;
  $: if (open !== focusedFor) {
    focusedFor = open;
    if (open) tick().then(() => { input?.select(); input?.focus(); });
  }

  $: if (editor && open) editor.commands.setSearchQuery(query);

  export function close() {
    open = false;
    query = '';
    editor?.commands.setSearchQuery('');
    editor?.commands.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter') {
      event.preventDefault();
      editor?.commands.goToMatch(event.shiftKey ? -1 : 1);
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
            on:click={() => editor?.commands.goToMatch(-1)}>↑</button>
    <button type="button" title="Next match (Enter)" class={btn}
            on:click={() => editor?.commands.goToMatch(1)}>↓</button>
    <button type="button" title="Close (Esc)" class={btn} on:click={close}>✕</button>
  </div>
{/if}
