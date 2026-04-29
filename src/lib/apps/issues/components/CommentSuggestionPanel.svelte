<!-- src/lib/apps/issues/components/CommentSuggestionPanel.svelte -->
<!--
  The inline panel that opens under a comment when the user clicks the
  per-comment action button. Five modes, driven by the `mode` prop:

    'ai'              — LLM produced an action_text
    'ai_declined'     — LLM said no clear action; field empty by default
    'ai_failed'       — API error / network failure; field falls back to comment text
    'comment'         — feature flag off (Day 0.5 fallback): comment text verbatim
    'already_linked'  — comment already has a linked action; show it with
                        View / Delete buttons instead of the suggestion form

  The panel has no internal mutation logic. It dispatches up:
    'dismiss'             — close the panel
    'addAction'           — user committed the draft (parent should open ActionForm)
    'viewLinked'          — jump to the linked action in the Actions section
    'deleteLinkedRequest' — open the delete-linked-action confirm dialog
-->
<script>
  import { createEventDispatcher } from 'svelte';
  import Icon              from '$lib/components/icons/Icon.svelte';
  import Button            from '$lib/components/common/Button.svelte';
  import ProtectedButton   from '$lib/components/common/ProtectedButton.svelte';

  /** @type {'ai'|'ai_declined'|'ai_failed'|'comment'|'already_linked'} */
  export let mode             = 'comment';
  export let linkedAction     = null;
  export let loading          = false;
  export let draft            = '';     // bindable
  export let info             = '';
  export let error            = '';
  export let saving           = false;
  export let linkedDeleteError = '';

  const dispatch = createEventDispatcher();
</script>

{#if mode === 'already_linked'}
  <!-- Linked-action display: action text + View / Delete buttons -->
  <div class="mt-2 bg-amber-900/15 border border-amber-700/40 rounded p-3 space-y-2">
    {#if linkedAction}
      <div class="px-3 py-2 rounded bg-slate-800/80 border-l-2 border-amber-400">
        <p class="text-sm text-gray-200 whitespace-pre-wrap">{linkedAction.action_text}</p>
        <div class="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
          <span class="px-1.5 py-0.5 rounded bg-purple-600/20 text-purple-300 border border-purple-200/30 capitalize">
            {linkedAction.status}
          </span>
          {#if linkedAction.name_text}
            <span class="text-gray-500">👤 {linkedAction.name_text}</span>
          {/if}
        </div>
      </div>
    {:else}
      <p class="text-xs text-gray-500 italic">Linked action is no longer available.</p>
    {/if}

    {#if linkedDeleteError}
      <p class="text-xs text-red-400">{linkedDeleteError}</p>
    {/if}

    {#if linkedAction}
      <div class="flex justify-end gap-2 flex-wrap">
        <Button
          variant="secondary"
          size="small"
          icon="clipboard"
          on:click={() => dispatch('viewLinked', linkedAction)}
          title="Expand the Actions section and scroll to this action"
        >
          View in Actions
        </Button>
        <ProtectedButton
          action="modify"
          variant="danger"
          size="small"
          icon="delete"
          on:click={() => dispatch('deleteLinkedRequest', linkedAction)}
          title="Delete the linked action (a new one can then be created)"
        >
          Delete linked action
        </ProtectedButton>
      </div>
    {/if}
  </div>

{:else}
  <!-- Suggestion form: header, optional spinner, draft textarea, footer -->
  <div class="mt-2 bg-amber-900/15 border border-amber-700/40 rounded p-3 space-y-2">
    <div class="flex items-center justify-between gap-2">
      <p class="text-xs font-semibold text-amber-300 flex items-center gap-1.5 flex-wrap">
        <span>
          💡
          {#if loading}
            AI suggestion — thinking…
          {:else if mode === 'ai'}
            AI-suggested action
          {:else if mode === 'ai_declined'}
            Suggested action (AI declined)
          {:else if mode === 'ai_failed'}
            Suggested action (AI unavailable)
          {:else}
            Suggested action from comment
          {/if}
        </span>
        {#if !loading}
          <span class="text-amber-500/60 font-normal italic text-[10px]">draft — review before adding</span>
        {/if}
      </p>
      <button
        on:click={() => dispatch('dismiss')}
        class="text-gray-400 hover:text-white text-sm leading-none"
        title="Dismiss"
        aria-label="Dismiss suggestion"
      >✕</button>
    </div>

    {#if loading}
      <div class="flex items-center gap-2 px-2 py-3 text-sm text-amber-300/70">
        <Icon name="refresh" size={4} className="animate-spin" />
        <span>Asking the AI for a suggested action…</span>
      </div>
    {:else}
      <textarea
        bind:value={draft}
        rows="2"
        placeholder="Action description"
        class="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-y"
      ></textarea>
      {#if info}
        <p class="text-[11px] text-amber-200/60 italic">{info}</p>
      {/if}
    {/if}

    {#if error}
      <p class="text-xs text-red-400">{error}</p>
    {/if}

    <div class="flex justify-end gap-2">
      <Button variant="secondary" size="small" on:click={() => dispatch('dismiss')}>
        Dismiss
      </Button>
      <ProtectedButton
        action="modify"
        variant="amber"
        size="small"
        icon="plus"
        disabled={loading || saving || !draft.trim()}
        on:click={() => dispatch('addAction')}
        title="Open the action form pre-filled with this text"
      >
        {saving ? 'Adding…' : 'Add Action…'}
      </ProtectedButton>
    </div>
  </div>
{/if}
