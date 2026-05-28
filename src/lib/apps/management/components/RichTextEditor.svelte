<!-- src/lib/apps/management/components/RichTextEditor.svelte -->
<!--
  Lightweight WYSIWYG editor for note-type activities.
  Built on Tiptap (headless ProseMirror wrapper).

  Toolbar: Bold · Italic · Underline · Bullet list · Numbered list · Undo · Redo
  Keyboard shortcuts work natively: Ctrl+B, Ctrl+I, Ctrl+U.

  Props:
    value      — initial HTML content (read once on mount)
    placeholder — grey placeholder text when empty
    ringClass   — Tailwind focus-ring colour class (matches activity type)

  Events:
    change     — fires on every edit; detail is the current HTML string
                 (empty string when the doc is blank)
-->
<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';

  export let value       = '';
  export let placeholder = 'Enter your note…';
  export let ringClass   = 'focus-within:ring-teal-500/50';

  /**
   * Optional paste interceptor for parent components (e.g. email auto-parse).
   * Receives the raw plain-text paste string.
   * Return an HTML string → editor content is replaced with that HTML.
   * Return null/undefined → Tiptap handles the paste normally.
   * @type {((rawText: string) => string | null | undefined) | null}
   */
  export let onPaste = null;

  const dispatch = createEventDispatcher();

  let editorEl;
  let editor;

  /**
   * Tiptap parses its initial content as HTML, so raw newlines are collapsed.
   * If the stored body is legacy plain text (pre-editor), convert each line
   * to a <p> so whitespace is preserved on load.
   * Bodies already written by Tiptap start with '<' and pass through unchanged.
   */
  function initContent(raw) {
    if (!raw) return '';
    if (raw.trimStart().startsWith('<')) return raw; // already HTML
    return raw.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
  }

  onMount(() => {
    editor = new Editor({
      element: editorEl,
      extensions: [
        StarterKit.configure({
          // Keep: bold, italic, underline, bulletList, orderedList,
          //       hardBreak, history, paragraph, text, document
          heading:        false,
          blockquote:     false,
          codeBlock:      false,
          horizontalRule: false,
          strike:         false,
          code:           false,
          link:           false,
        }),
      ],
      content: initContent(value),
      editorProps: {
        attributes: { class: 'rte-prosemirror' },
        // Intercept paste so parent can pre-process content (e.g. email parsing).
        handlePaste: (view, event) => {
          if (!onPaste) return false;
          const raw = event.clipboardData?.getData('text/plain') || '';
          const html = onPaste(raw);
          if (html !== null && html !== undefined) {
            // Schedule after current event cycle so editor is ready.
            setTimeout(() => editor?.commands.setContent(html), 0);
            return true; // suppress Tiptap's default paste
          }
          return false;
        }
      },
      onTransaction: () => {
        // Re-assign to trigger Svelte reactivity (toolbar active states).
        editor = editor;
      },
      onUpdate: ({ editor: e }) => {
        const html = e.getHTML();
        dispatch('change', html === '<p></p>' ? '' : html);
      },
    });
  });

  onDestroy(() => editor?.destroy());

  // ── Toolbar helpers ────────────────────────────────────────────────────
  function toggle(cmd) {
    editor?.chain().focus()[cmd]().run();
  }

  // These are called from the template; they re-evaluate after each
  // onTransaction because editor = editor causes a full re-render.
  $: bold        = editor?.isActive('bold')        ?? false;
  $: italic      = editor?.isActive('italic')      ?? false;
  $: underline   = editor?.isActive('underline')   ?? false;
  $: bulletList  = editor?.isActive('bulletList')  ?? false;
  $: orderedList = editor?.isActive('orderedList') ?? false;
  $: canUndo     = editor?.can().undo()            ?? false;
  $: canRedo     = editor?.can().redo()            ?? false;
  $: isEmpty     = editor?.isEmpty                 ?? true;

  // Base toolbar button classes — kept as a const so they're not repeated 8×
  const TB  = 'flex items-center justify-center w-7 h-7 rounded text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors shrink-0';
  const TBO = 'bg-slate-600 text-white'; // active/on state extra classes

  // ── Reflow ────────────────────────────────────────────────────────────
  // Joins mid-paragraph hard line-breaks (common in text pasted from narrow
  // web columns) into single paragraphs while preserving:
  //   • bullet-glyph lines (•·–—) as new paragraph starts
  //   • numbered-list lines (1. / 1) ) as new paragraph starts
  //   • non-paragraph blocks (ul, ol) passed through unchanged
  //   • inline formatting (bold, italic, underline) — marks array is merged,
  //     not stripped, so Tiptap inline styles survive
  //
  // Works on the Tiptap JSON document model (getJSON/setContent) to avoid
  // HTML-parser round-trip ambiguities with blank paragraphs.
  function reflowContent() {
    if (!editor || editor.isEmpty) return;

    const nodes = editor.getJSON().content ?? [];
    const output = [];
    let group = null;   // content[] of the current merged paragraph

    function flush() {
      if (group) { output.push({ type: 'paragraph', content: group }); group = null; }
    }

    for (const node of nodes) {
      if (node.type !== 'paragraph') {
        // ul / ol / other blocks — pass through unchanged
        flush();
        output.push(node);
        continue;
      }

      const content = node.content ?? [];
      // A paragraph is blank if it has no content nodes, or a single hard break
      const isBlank = content.length === 0 ||
                      (content.length === 1 && content[0].type === 'hardBreak');

      if (isBlank) {
        flush();
        continue;
      }

      // Detect lines that should always start a new conceptual paragraph:
      //   • bullet glyph at position 0 (•, ·, –, —)
      //   • numbered-list marker (1. or 1) )
      const firstText = content.find(n => n.type === 'text')?.text ?? '';
      const isNew     = /^[•·–—]|^\d+[.)]\s/.test(firstText.trimStart());

      if (!group || isNew) {
        flush();
        group = [...content];
      } else {
        // Continuation — append a space then this paragraph's inline nodes
        group.push({ type: 'text', text: ' ' });
        group.push(...content);
      }
    }

    flush();

    // Interleave exactly one blank paragraph between every output block.
    // Using { type: 'paragraph' } (no content key) is the canonical Tiptap
    // representation of a blank line — no HTML-parser ambiguity.
    const finalContent = output.flatMap((node, i) =>
      i < output.length - 1
        ? [node, { type: 'paragraph' }]
        : [node]
    );

    editor.commands.setContent({ type: 'doc', content: finalContent });
    const html = editor.getHTML();
    dispatch('change', html === '<p></p>' ? '' : html);
  }
</script>

<div class="rte-wrap rounded border border-slate-600 bg-slate-800 focus-within:ring-2 {ringClass} overflow-hidden">

  <!-- ── Toolbar ──────────────────────────────────────────────────── -->
  <div class="flex items-center gap-0.5 px-1.5 py-1 bg-slate-750 border-b border-slate-700">

    <button type="button" class="{TB} {bold ? TBO : ''}"
      on:click={() => toggle('toggleBold')} title="Bold (Ctrl+B)">
      <strong>B</strong>
    </button>

    <button type="button" class="{TB} {italic ? TBO : ''}"
      on:click={() => toggle('toggleItalic')} title="Italic (Ctrl+I)">
      <em>I</em>
    </button>

    <button type="button" class="{TB} {underline ? TBO : ''}"
      on:click={() => toggle('toggleUnderline')} title="Underline (Ctrl+U)">
      <span style="text-decoration:underline">U</span>
    </button>

    <div class="w-px h-4 bg-slate-600 mx-1 shrink-0"></div>

    <button type="button" class="{TB} {bulletList ? TBO : ''}"
      on:click={() => toggle('toggleBulletList')} title="Bullet list">
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
        <circle cx="2" cy="4.5" r="1.5"/>
        <rect x="5" y="3.75" width="10" height="1.5" rx="0.5"/>
        <circle cx="2" cy="8" r="1.5"/>
        <rect x="5" y="7.25" width="10" height="1.5" rx="0.5"/>
        <circle cx="2" cy="11.5" r="1.5"/>
        <rect x="5" y="10.75" width="10" height="1.5" rx="0.5"/>
      </svg>
    </button>

    <button type="button" class="{TB} {orderedList ? TBO : ''}"
      on:click={() => toggle('toggleOrderedList')} title="Numbered list">
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3.5 h-3.5">
        <text x="0" y="6" font-size="6" font-family="monospace">1.</text>
        <rect x="5" y="3.75" width="10" height="1.5" rx="0.5"/>
        <text x="0" y="10.5" font-size="6" font-family="monospace">2.</text>
        <rect x="5" y="7.25" width="10" height="1.5" rx="0.5"/>
        <text x="0" y="15" font-size="6" font-family="monospace">3.</text>
        <rect x="5" y="10.75" width="10" height="1.5" rx="0.5"/>
      </svg>
    </button>

    <div class="w-px h-4 bg-slate-600 mx-1 shrink-0"></div>

    <button type="button" class="{TB} {canUndo ? '' : 'opacity-30 cursor-not-allowed'}"
      on:click={() => editor?.chain().focus().undo().run()}
      disabled={!canUndo} title="Undo (Ctrl+Z)">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="w-3.5 h-3.5">
        <path d="M3 6H10a4 4 0 010 8H5" stroke-linecap="round"/>
        <path d="M3 6L6 3M3 6L6 9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <button type="button" class="{TB} {canRedo ? '' : 'opacity-30 cursor-not-allowed'}"
      on:click={() => editor?.chain().focus().redo().run()}
      disabled={!canRedo} title="Redo (Ctrl+Y)">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" class="w-3.5 h-3.5">
        <path d="M13 6H6a4 4 0 000 8h5" stroke-linecap="round"/>
        <path d="M13 6L10 3M13 6L10 9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div class="w-px h-4 bg-slate-600 mx-1 shrink-0"></div>

    <button type="button"
      class="flex items-center gap-1 px-2 h-7 rounded text-xs text-slate-400
             hover:bg-slate-700 hover:text-slate-200 transition-colors shrink-0
             disabled:opacity-30 disabled:cursor-not-allowed"
      on:click={reflowContent}
      disabled={isEmpty}
      title="Join line-breaks within paragraphs — useful for text pasted from narrow web columns"
    >⟳ Reflow</button>

  </div>

  <!-- ── Editor area ──────────────────────────────────────────────── -->
  <div class="relative">
    <div bind:this={editorEl}></div>
    {#if isEmpty}
      <p class="rte-placeholder">{placeholder}</p>
    {/if}
  </div>

</div>

<style>
  /* Toolbar background — between slate-700 and slate-800 */
  .rte-wrap :global(.bg-slate-750) {
    background-color: #2a3344;
  }

  /* Placeholder */
  .rte-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    color: #6b7280;
    pointer-events: none;
    user-select: none;
  }

  /* ProseMirror editor content area */
  :global(.rte-prosemirror) {
    min-height: 8rem;
    padding: 0.5rem 0.75rem;
    color: #e2e8f0; /* slate-200 */
    font-size: 0.875rem;
    line-height: 1.6;
    outline: none;
  }

  :global(.rte-prosemirror p) {
    margin: 0 0 0.3rem 0;
  }
  :global(.rte-prosemirror p:last-child) {
    margin-bottom: 0;
  }
  :global(.rte-prosemirror ul) {
    list-style-type: disc;
    padding-left: 1.4rem;
    margin: 0.2rem 0;
  }
  :global(.rte-prosemirror ol) {
    list-style-type: decimal;
    padding-left: 1.4rem;
    margin: 0.2rem 0;
  }
  :global(.rte-prosemirror li) {
    margin: 0.1rem 0;
  }
  :global(.rte-prosemirror li > p) {
    margin: 0;
  }
  :global(.rte-prosemirror strong) {
    font-weight: 700;
    color: #f1f5f9; /* slightly brighter for bold */
  }
  :global(.rte-prosemirror em) {
    font-style: italic;
  }
  :global(.rte-prosemirror u) {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  /* ProseMirror selection highlight */
  :global(.rte-prosemirror ::selection) {
    background-color: rgba(139, 92, 246, 0.35);
  }
</style>
