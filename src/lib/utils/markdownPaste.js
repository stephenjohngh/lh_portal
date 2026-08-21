// src/lib/utils/markdownPaste.js
// Understanding markdown pasted into an editor — pure, Type-1 testable, no DOM.
//
// Written for Dossier, where it is the other half of the archive:
// dossier/utils/packArchive.js writes a pack's pages out as markdown and this
// reads them back, so a page can be lifted out of a zip and dropped into a new
// pack without losing its headings, lists and emphasis.
//
// It lives in shared utils because the need is not Dossier's. Anyone who keeps
// notes in markdown — and pastes them into a comment, a note, an issue — hits
// the same wall of literal asterisks. The one Dossier-specific behaviour,
// links between pages of the same pack, is behind the `internalLinks` option
// and OFF by default: outside a pack there is no page for `./overview.md` to
// mean.
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

/**
 * Which heading tag a run of #s becomes.
 *
 * `minHeading` shifts the whole scale down for targets whose top level is not
 * h1 — a comment box, where the comment is the top level and an h1 inside it
 * would shout. Shifting rather than clamping keeps the document's own
 * hierarchy: `#` and `##` stay one step apart.
 *
 * Anything past the bottom clamps rather than disappearing. A heading rendered
 * one size too small is a blemish; a heading dropped by the schema takes its
 * text with it.
 */
function headingLevel(hashes, { minHeading = 1 } = {}) {
  const floor = Math.min(Math.max(minHeading, 1), MAX_HEADING);
  return Math.min(MAX_HEADING, hashes + floor - 1);
}

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
export function inlineMarkdown(escaped, { internalLinks = false } = {}) {
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
      //
      // Only where the paste target HAS other pages. In a comment box
      // `./overview.md` names nothing, and emitting an anchor no schema
      // recognises would drop the label's formatting for no gain.
      const slug = internalLinks ? internalSlug(href) : null;
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
/**
 * A line that could be a row of a GFM table.
 *
 * Deliberately loose — a pipe and something either side. What actually decides
 * a table is the DELIMITER row below the header, so this only has to be cheap
 * and not wrong about prose that happens to contain a pipe on its own.
 */
export function isTableRow(line) {
  return typeof line === 'string' && line.includes('|') && line.trim().length > 1;
}

/** The `|---|:--:|` row. Its presence is what makes the line above a header. */
export function isTableDelimiter(line) {
  if (typeof line !== 'string' || !line.includes('|')) return false;
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

/**
 * The cells of one row.
 *
 * The outer pipes are fences, not empty cells — `| a | b |` is two cells, not
 * four. An unfenced row (`a | b`) is equally valid GFM, hence trimming only
 * what is actually empty at the ends.
 */
export function tableCells(line) {
  const cells = String(line ?? '').trim().split('|').map(c => c.trim());
  if (cells.length && cells[0] === '') cells.shift();
  if (cells.length && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

/**
 * A table as the editor's schema wants it.
 *
 * Cells hold a paragraph because Tiptap's table cell takes block content —
 * bare text in a `<td>` parses to the same thing, but saying so is clearer
 * than relying on the parser to insert it.
 *
 * Ragged rows are padded to the header's width rather than dropped: a row with
 * a missing trailing pipe is a typo, and losing its content over that would be
 * the worst outcome available here. Column ALIGNMENT is deliberately not
 * carried — the schema has no attribute for it, so emitting it would only look
 * like it had survived.
 */
function renderTable(header, rows, options) {
  const width = Math.max(header.length, ...rows.map(r => r.length), 1);
  const cell = (tag, text) =>
    `<${tag}><p>${inlineMarkdown(escapeHtml(text ?? ''), options)}</p></${tag}>`;
  const row = (cells, tag) =>
    `<tr>${Array.from({ length: width }, (_, i) => cell(tag, cells[i])).join('')}</tr>`;

  return '<table><tbody>'
    + row(header, 'th')
    + rows.map(r => row(r, 'td')).join('')
    + '</tbody></table>';
}

export function markdownToHtml(markdown, options = {}) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  /** @type {{ tag: 'ul'|'ol', depth: number }[]} */
  const listStack = [];
  let paragraph = [];
  let quote = [];
  let fence = null;
  /**
   * Consecutive blank lines seen. The FIRST separates two blocks; every one
   * after it was put there by the author, and comes back as an empty paragraph
   * so the spacing they arranged survives the round trip.
   */
  let blankRun = 0;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMarkdown(escapeHtml(paragraph.join(' ')), options)}</p>`);
    paragraph = [];
  };
  /**
   * A quote's contents are markdown too.
   *
   * The collected lines have had their `>` removed, so what is left is an
   * ordinary document — and the way to read an ordinary document is this
   * function. Flattening it into one paragraph instead was wrong in a way that
   * only showed up once tables existed: a table inside a quote came out as a
   * line of pipes, and so did a list, a heading, or a second paragraph.
   *
   * Recursion is bounded by the text: each level strips one `>`, so a quote
   * inside a quote is strictly shorter than its parent.
   */
  const closeQuote = () => {
    if (!quote.length) return;
    const inner = markdownToHtml(quote.join('\n'), options);
    out.push(`<blockquote>${inner || '<p></p>'}</blockquote>`);
    quote = [];
  };
  const closeLists = (toDepth = -1) => {
    while (listStack.length && listStack[listStack.length - 1].depth > toDepth) {
      out.push(`</${listStack.pop().tag}>`);
    }
  };
  const closeAll = () => { closeParagraph(); closeQuote(); closeLists(); };
  /**
   * Turn the author's own blank lines into empty paragraphs.
   *
   * Nothing at the very start of a page: leading blank lines are whitespace
   * around a paste, not a layout choice somebody made.
   */
  const flushBlanks = () => {
    if (out.length) {
      for (let i = 1; i < blankRun; i++) out.push('<p></p>');
    }
    blankRun = 0;
  };

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
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
    if (fenceMark) { closeAll(); flushBlanks(); fence = []; continue; }

    if (!line.trim()) { closeAll(); blankRun++; continue; }
    flushBlanks();

    // ── Horizontal rule, before lists: `---` is not a bullet.
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      closeAll();
      out.push('<hr>');
      continue;
    }

    // ── Table. A header row is only a header row if a delimiter follows it,
    // which is what separates a real table from a line that happens to contain
    // pipes.
    if (options.tables && isTableRow(line) && isTableDelimiter(lines[index + 1])) {
      closeAll();
      const rows = [];
      index++;                                   // step over the delimiter
      while (index + 1 < lines.length && isTableRow(lines[index + 1])) {
        rows.push(tableCells(lines[++index]));
      }
      out.push(renderTable(tableCells(line), rows, options));
      continue;
    }

    // Where the target has no table node, each row becomes its own paragraph
    // and the delimiter is dropped. Not pretty, but the alternative is what
    // used to happen: every row joined into one paragraph, so a ten-row table
    // arrived as a single unreadable line of pipes.
    //
    // The run continues to the first line that is not a row, so it holds for a
    // whole table rather than for the two lines either side of the delimiter.
    if (!options.tables && isTableRow(line) && isTableDelimiter(lines[index + 1])) {
      closeAll();
      out.push(`<p>${inlineMarkdown(escapeHtml(line.trim()), options)}</p>`);
      index++;                                   // the delimiter itself is noise
      while (index + 1 < lines.length && isTableRow(lines[index + 1])) {
        const row = lines[++index].trim();
        out.push(`<p>${inlineMarkdown(escapeHtml(row), options)}</p>`);
      }
      continue;
    }

    // ── Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeAll();
      const level = headingLevel(heading[1].length, options);
      out.push(`<h${level}>${inlineMarkdown(escapeHtml(heading[2]), options)}</h${level}>`);
      continue;
    }

    // ── Blockquote. A bare `>` is the quote's own blank line — it separates
    // blocks INSIDE the quote, so it is kept rather than ending it.
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
      out.push(`<li><p>${inlineMarkdown(escapeHtml(match[2]), options)}</p></li>`);
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
  // A delimiter row under a row of pipes. Nothing else looks like that, and
  // without it a pasted table alone reads as prose and stays as pipes.
  const hasTable   = lines.some((l, i) => isTableRow(l) && isTableDelimiter(lines[i + 1]));
  if (hasHeading || hasFence || hasQuote || hasTable || listItems >= 2) return true;

  // Otherwise, inline marks — but more than one KIND, so a single emphasised
  // word in ordinary prose is left alone.
  const kinds = [
    /\*\*[^*]+\*\*/, /~~[^~]+~~/, /`[^`]+`/, /\[[^\]]+\]\([^)\s]+\)/,
  ].filter(pattern => pattern.test(value)).length;

  return kinds >= 2;
}
