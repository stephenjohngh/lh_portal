// src/lib/apps/dossier/utils/markdownPaste.js
// Understanding markdown pasted into a page — pure, Type-1 testable, no DOM.
//
// The other half of the archive. utils/packArchive.js writes a pack's pages out
// as markdown; this reads them back, so a page can be lifted out of a zip and
// dropped into a new pack without losing its headings, lists and emphasis.
//
// ── Why a parser here rather than a markdown dependency ─────────────────────
// It only has to understand the subset we EMIT — headings, lists, quotes, code
// fences, rules and the five inline marks — because that is the round trip the
// feature is for. A general markdown library would bring a much larger surface
// (tables, footnotes, HTML passthrough, reference links) of which the editor's
// schema can represent almost nothing, and HTML passthrough in particular is a
// sanitiser problem we do not need to acquire.
//
// ── Order matters: escape first, then mark up ───────────────────────────────
// Every value is HTML-escaped BEFORE any markdown is applied, so pasted text
// can never introduce markup of its own. The inline patterns then run over
// already-escaped text, which is why they only ever match characters that
// escaping leaves alone.

/** Schema allows h1–h3; deeper headings clamp rather than disappear. */
const MAX_HEADING = 3;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A link target we are willing to put in an href.
 *
 * Same rule as the editor's own link control: anything that is not http(s) or
 * mailto renders as plain text rather than as a link. `javascript:` in a
 * document built to be handed to an outsider has no business existing even
 * transiently, and the sanitiser at render is not the place to first notice it.
 */
function safeHref(raw) {
  const href = String(raw ?? '').trim();
  if (!href) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  // A bare domain is the common case in pasted prose.
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(href)) return `https://${href}`;
  return null;
}

/**
 * A link pointing at another page in the same pack, and the slug it names.
 *
 * blocksToMarkdown() writes a cross-link as `[label](./overview.md)`, so
 * without this the archive's own internal links come back as plain text — the
 * navigation between pages, which is most of what makes a pack a pack rather
 * than a folder, silently lost on re-import.
 *
 * Accepts the forms an archive and a person actually produce: `./overview.md`,
 * `overview.md`, `pages/2-overview.md` (the numbered layout inside the zip),
 * and `#overview` (the href a published pack renders).
 *
 * A SLUG, never an id: pasted text cannot know an id, and a slug is the durable
 * address here anyway — a page's slug deliberately survives a rename.
 *
 * @param {string} raw
 * @returns {string|null}
 */
export function internalSlug(raw) {
  const href = String(raw ?? '').trim();
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;   // absolute: not ours

  const anchor = /^#([\w-]+)$/.exec(href);
  if (anchor) return anchor[1];

  const path = /^(?:\.\/|\.\.\/)?(?:pages\/)?(?:\d+-)?([\w-]+)\.md$/i.exec(href);
  return path ? path[1] : null;
}

/**
 * Inline marks within one line of already-escaped text.
 *
 * Code spans are taken FIRST and their contents held aside, because `**` inside
 * a code span is literal — marking it up would corrupt exactly the text a
 * reader was trying to quote verbatim.
 */
export function inlineMarkdown(escaped) {
  const held = [];
  let text = String(escaped ?? '').replace(/`([^`]+)`/g, (_, code) => {
    held.push(`<code>${code}</code>`);
    // Delimited by a control character, not by spaces round a number: "in 2026
    // the" would otherwise be restored as a code span that was never there.
    return `\u0001${held.length - 1}\u0001`;
  });

  text = text
    // One level of balanced parentheses inside the target, so a Wikipedia-style
    // ...(disambiguation) URL survives — and so `javascript:alert(1)` is
    // recognised whole and refused, rather than truncated at the first bracket
    // and leaving a stray one behind.
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (whole, label, href) => {
      // A cross-link to another page in this pack comes first: it is not a URL
      // and would fail every test below.
      // Deliberately NO href: StarterKit's link mark parses `a[href]`, so an
      // anchor carrying both would be ambiguous between the two marks. The
      // docLink mark writes its own href when it renders.
      const slug = internalSlug(href);
      if (slug) return `<a data-doc-slug="${escapeHtml(slug)}">${label}</a>`;

      const url = safeHref(href);
      return url
        ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${label}</a>`
        : label;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    // Single * and _ last, and only when not adjacent to their doubled forms,
    // or **bold** would be eaten one asterisk at a time.
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_]+)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');

  return text.replace(/\u0001(\d+)\u0001/g, (_, i) => held[Number(i)]);
}

/** How deeply a list item is indented, in levels of two spaces. */
function indentOf(line) {
  const spaces = /^(\s*)/.exec(line)[1].replace(/\t/g, '  ').length;
  return Math.min(3, Math.floor(spaces / 2));
}

/**
 * Markdown → HTML the editor's schema can parse.
 *
 * Block-level and line-based, which is all the emitted subset needs. Anything
 * unrecognised falls through as a paragraph rather than being dropped: losing
 * a line silently would be far worse than rendering it plainly.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToHtml(markdown) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  /** @type {{ tag: 'ul'|'ol', depth: number }[]} */
  const listStack = [];
  let paragraph = [];
  let quote = [];
  let fence = null;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMarkdown(escapeHtml(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };
  const closeQuote = () => {
    if (!quote.length) return;
    out.push(`<blockquote><p>${inlineMarkdown(escapeHtml(quote.join(' ')))}</p></blockquote>`);
    quote = [];
  };
  const closeLists = (toDepth = -1) => {
    while (listStack.length && listStack[listStack.length - 1].depth > toDepth) {
      out.push(`</${listStack.pop().tag}>`);
    }
  };
  const closeAll = () => { closeParagraph(); closeQuote(); closeLists(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    // ── Fenced code. Everything inside is literal, including blank lines.
    const fenceMark = /^\s*```/.test(line);
    if (fence !== null) {
      if (fenceMark) {
        out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else {
        fence.push(raw);
      }
      continue;
    }
    if (fenceMark) { closeAll(); fence = []; continue; }

    if (!line.trim()) { closeAll(); continue; }

    // ── Horizontal rule, before lists: `---` is not a bullet.
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      closeAll();
      out.push('<hr>');
      continue;
    }

    // ── Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeAll();
      const level = Math.min(MAX_HEADING, heading[1].length);
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    // ── Blockquote
    const blockquote = /^\s*>\s?(.*)$/.exec(line);
    if (blockquote) {
      closeParagraph(); closeLists();
      quote.push(blockquote[1]);
      continue;
    }
    closeQuote();

    // ── List item
    const bullet  = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const ordered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      closeParagraph();
      const match = bullet ?? ordered;
      const tag   = bullet ? 'ul' : 'ol';
      const depth = indentOf(match[1]);

      closeLists(depth);
      const top = listStack[listStack.length - 1];
      if (!top || top.depth < depth) {
        out.push(`<${tag}>`);
        listStack.push({ tag, depth });
      } else if (top.tag !== tag) {
        // The kind changed at the same level — a numbered list following a
        // bulleted one is two lists, not one with mixed items.
        out.push(`</${listStack.pop().tag}>`, `<${tag}>`);
        listStack.push({ tag, depth });
      }
      out.push(`<li><p>${inlineMarkdown(escapeHtml(match[2]))}</p></li>`);
      continue;
    }
    closeLists();

    paragraph.push(line.trim());
  }

  if (fence !== null) out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
  closeAll();

  return out.join('');
}

/**
 * Is this pasted text worth treating as markdown?
 *
 * Deliberately conservative. Converting text the author meant literally is the
 * annoying failure — a paste that quietly becomes a bulleted list is harder to
 * undo than one that stays plain — so a single stray asterisk is not enough.
 * A whole page lifted out of an archive trips several of these at once.
 *
 * @param {string} text
 */
export function looksLikeMarkdown(text) {
  const value = String(text ?? '');
  if (value.trim().length < 3) return false;

  const lines = value.split(/\r\n?|\n/);

  // Strong, structural signals: one of these alone is enough.
  const hasHeading = lines.some(l => /^#{1,6}\s+\S/.test(l));
  const hasFence   = lines.filter(l => /^\s*```/.test(l)).length >= 2;
  const hasQuote   = lines.some(l => /^\s*>\s+\S/.test(l));
  const listItems  = lines.filter(l => /^\s*([-*+]|\d+[.)])\s+\S/.test(l)).length;
  if (hasHeading || hasFence || hasQuote || listItems >= 2) return true;

  // Otherwise, inline marks — but more than one KIND, so a single emphasised
  // word in ordinary prose is left alone.
  const kinds = [
    /\*\*[^*]+\*\*/, /~~[^~]+~~/, /`[^`]+`/, /\[[^\]]+\]\([^)\s]+\)/,
  ].filter(pattern => pattern.test(value)).length;

  return kinds >= 2;
}
