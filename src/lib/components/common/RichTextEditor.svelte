<!-- src/lib/components/common/RichTextEditor.svelte -->
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
  import { MarkdownPaste } from '$lib/utils/markdownPasteExtension.js';
  import { EditorSearch } from '$lib/utils/editorSearchExtension.js';
  import EditorFindBar from './EditorFindBar.svelte';
  // Link is bundled into StarterKit v3 — configured via its `link` option below.

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

  /**
   * Understand markdown when it is pasted in.
   *
   * Someone who keeps notes in markdown pastes them into a comment box and gets
   * a wall of asterisks. With this on, `## Heading` and `- item` arrive as a
   * heading and a list.
   *
   * It also ENABLES the nodes markdown produces — headings, quotes, code
   * blocks, rules, strikethrough — which this editor otherwise turns off.
   * Without that the paste converts and ProseMirror then drops what its schema
   * cannot hold, which is worse than not converting: the text goes too.
   *
   * The toolbar does not grow buttons for them. They arrive by paste, they
   * render, they save (the sanitiser has always allowed these tags) — but
   * writing a heading by hand is not what a comment box is for.
   */
  export let markdown = false;

  const dispatch = createEventDispatcher();

  let editorEl;
  let editor;

  // ── Link toolbar state ─────────────────────────────────────────────
  let linkInputVisible = false;
  let pendingUrl       = '';
  let linkInputEl;

  function openLinkInput() {
    // Pre-fill with the current link href if cursor is inside a link
    pendingUrl = editor?.getAttributes('link').href ?? '';
    linkInputVisible = true;
    // Focus the input after Svelte renders it
    setTimeout(() => linkInputEl?.focus(), 0);
  }

  function applyLink() {
    const url = pendingUrl.trim();
    if (!url) { removeLink(); return; }
    // Prepend https:// if no protocol supplied
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    editor?.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank' }).run();
    closeLinkInput();
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    closeLinkInput();
  }

  function closeLinkInput() {
    linkInputVisible = false;
    pendingUrl       = '';
  }

  function onLinkKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
    if (e.key === 'Escape') closeLinkInput();
  }

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
          //
          // The rest are off because the toolbar does not offer them — except
          // when `markdown` is set, where a paste can produce them and the
          // schema has to be able to hold what it produces. h1 is still off:
          // the top level of a comment is the comment.
          heading:        markdown ? { levels: [2, 3] } : false,
          blockquote:     markdown,
          codeBlock:      markdown,
          horizontalRule: markdown,
          strike:         markdown,
          code:           markdown,
          // Link ships inside StarterKit v3 — configure it here rather than
          // registering @tiptap/extension-link separately (which duplicates it).
          link: {
            // Auto-convert typed/pasted URLs to links
            autolink:   true,
            // Don't open in the editor on click (allows cursor placement)
            openOnClick: false,
            HTMLAttributes: {
              target: '_blank',
              rel:    'noopener noreferrer',
              class:  'rte-link',
            },
          },
        }),
        // After StarterKit, and only when asked for: it reads the clipboard
        // before Tiptap's own handler but after editorProps.handlePaste below,
        // which is the order that matters — an email paste in an email
        // activity is not a markdown paste.
        // minHeading 2 to match `levels: [2, 3]` above — a converted `#`
        // must be a tag this schema can hold, or the line is dropped.
        ...(markdown ? [MarkdownPaste.configure({ minHeading: 2 })] : []),
        // Find-in-editor. Always on: the browser's Ctrl+F searches the whole
        // page, which for an editor inside a dialog means it matches — and
        // scrolls to — text behind the dialog that nobody can see.
        EditorSearch,
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
  $: isLink      = editor?.isActive('link')        ?? false;
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

    <!-- Link button + inline URL input -->
    {#if linkInputVisible}
      <div class="flex items-center gap-1 ml-1">
        <input
          bind:this={linkInputEl}
          bind:value={pendingUrl}
          type="text"
          placeholder="https://…"
          on:keydown={onLinkKeydown}
          class="h-7 px-2 rounded bg-slate-900 border border-slate-500 text-xs text-white
                 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 w-48"
        />
        <button type="button" class="{TB} text-emerald-400 hover:text-emerald-300"
          on:click={applyLink} title="Apply link">✓</button>
        {#if isLink}
          <button type="button" class="{TB} text-red-400 hover:text-red-300"
            on:click={removeLink} title="Remove link">✕</button>
        {/if}
        <button type="button" class="{TB} text-slate-500"
          on:click={closeLinkInput} title="Cancel">✕</button>
      </div>
    {:else}
      <button type="button"
        class="{TB} {isLink ? TBO + ' text-purple-300' : ''}"
        on:click={isLink ? removeLink : openLinkInput}
        title={isLink ? 'Remove link' : 'Insert / edit link'}>
        🔗
      </button>
    {/if}

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

    <div class="flex-1"></div>

    <!-- Find. Pushed to the right, so it reads as a way of looking at the text
         rather than as another way of changing it. -->
    <EditorFindBar {editor} compact={true} />

  </div>

  <!-- ── Editor area ──────────────────────────────────────────────── -->
  <!-- `rte-scroll` gives long content its own scrollbar so the toolbar above it
       stays put — the same shape the Dossier editor has always had. Without it
       a long note scrolled the toolbar, and with it the find bar, off the top
       of the window just when they were being used. -->
  <div class="relative rte-scroll">
    <div bind:this={editorEl}></div>
    {#if isEmpty}
      <p class="rte-placeholder">{placeholder}</p>
    {/if}
  </div>

</div>

<style>
  /* The editing surface scrolls, not the page.
     max-height rather than a fixed one, so a two-line comment is still two
     lines high: the limit only arrives when there is enough content to need
     it. 60vh leaves the toolbar, the surrounding form and its buttons all on
     screen at once on a laptop. */
  .rte-scroll {
    max-height: 60vh;
    overflow-y: auto;
  }

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
  /* Only reachable with `markdown` set — pasted, never typed. Sized close to
     body text: this is a comment, and a pasted heading should organise it, not
     dominate the thread it sits in. */
  :global(.rte-prosemirror h2),
  :global(.rte-prosemirror h3) {
    font-weight: 600;
    color: #f1f5f9;
    margin: 0.75em 0 0.35em;
    line-height: 1.3;
  }
  :global(.rte-prosemirror h2) { font-size: 1.05em; }
  :global(.rte-prosemirror h3) { font-size: 0.95em; }

  :global(.rte-prosemirror blockquote) {
    border-left: 2px solid #475569;
    padding-left: 0.75em;
    margin: 0.5em 0;
    color: #cbd5e1;
  }

  :global(.rte-prosemirror pre) {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.25rem;
    padding: 0.5em 0.65em;
    margin: 0.5em 0;
    overflow-x: auto;
    font-size: 0.85em;
  }
  :global(.rte-prosemirror code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
  }
  /* An inline code span needs the chip; one inside a fence already has the
     block's background and would otherwise draw a box inside a box. */
  :global(.rte-prosemirror :not(pre) > code) {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 0.2rem;
    padding: 0.05em 0.3em;
  }

  :global(.rte-prosemirror hr) {
    border: 0;
    border-top: 1px solid #475569;
    margin: 0.85em 0;
  }

  :global(.rte-prosemirror s) {
    text-decoration: line-through;
  }

  :global(.rte-prosemirror a.rte-link) {
    color: #7dd3cc;           /* teal-300 — visible on dark bg */
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: text;             /* editor cursor, not pointer — click places caret */
  }
  :global(.rte-prosemirror a.rte-link:hover) {
    color: #5eead4;
  }
  /* ProseMirror selection highlight */
  :global(.rte-prosemirror ::selection) {
    background-color: rgba(139, 92, 246, 0.35);
  }
</style>
