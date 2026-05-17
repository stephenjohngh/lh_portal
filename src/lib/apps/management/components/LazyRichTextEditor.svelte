<!-- src/lib/apps/management/components/LazyRichTextEditor.svelte -->
<!--
  Lazy wrapper around RichTextEditor.svelte. The real editor pulls in tiptap
  (~500 KB minified) which is only ever needed when the user is actively
  editing or composing an activity. By dynamic-importing it here, tiptap is
  excluded from the management app's initial bundle and only fetched the
  first time an editor instance is mounted (across the whole app — Vite
  dedupes the chunk).

  Forwards the same props and `change` event as RichTextEditor; no `bind:`
  is supported by callers, so <svelte:component> is sufficient.
-->
<script>
  import { onMount, createEventDispatcher } from 'svelte';

  export let value       = '';
  export let placeholder = 'Enter your note…';
  export let ringClass   = 'focus-within:ring-teal-500/50';
  /** @type {((rawText: string) => string | null | undefined) | null} */
  export let onPaste     = null;

  const dispatch = createEventDispatcher();

  /** @type {import('svelte').ComponentType | null} */
  let Editor = null;

  onMount(async () => {
    const mod = await import('./RichTextEditor.svelte');
    Editor    = mod.default;
  });

  function handleChange(e) {
    dispatch('change', e.detail);
  }
</script>

{#if Editor}
  <svelte:component
    this={Editor}
    {value}
    {placeholder}
    {ringClass}
    {onPaste}
    on:change={handleChange}
  />
{:else}
  <div class="border border-slate-700 rounded-lg px-3 py-2 min-h-[80px] flex items-center text-xs text-slate-500 {ringClass}">
    Loading editor…
  </div>
{/if}
