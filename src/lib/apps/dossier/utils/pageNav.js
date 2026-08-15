// src/lib/apps/dossier/utils/pageNav.js
// Getting around a pack — pure, Type-1 testable, no DOM.
//
// Four features that look separate and are not: deep links to a page, a page
// outline, a reading-time estimate, and landing on a search hit. All four are
// the same question — "where in this pack is that, and how do I point at it?" —
// so they share one module and one anchoring scheme.
//
// ── The anchors already exist ────────────────────────────────────────────────
// Every addressable block carries a `uid` (blockId.js), and the BlockId
// extension round-trips it to `data-uid` in the rendered HTML, which the
// sanitiser keeps because ALLOW_DATA_ATTR is on. So there is nothing to add to
// the stored content: a block has been addressable since P0 and nothing has
// ever addressed one.
//
// ── Why slugs, not ids, in a URL ─────────────────────────────────────────────
// A published pack's deep link is `/pack/<token>#chronology`. The slug is the
// address a person can read, it survives a rename by design, and it does not
// leak a database id to a recipient. `#<uid>` would do neither.

/** Words a minute. Deliberately slower than a blog: a briefing is dense. */
export const WORDS_PER_MINUTE = 200;

/**
 * The headings of one page, in document order.
 *
 * Only headings — a paragraph is addressable but is not a landmark, and an
 * outline listing every block is a second copy of the page.
 *
 * @param {object|null} blocks
 * @returns {{ uid: string|null, level: number, text: string }[]}
 */
export function pageOutline(blocks) {
  const found = [];

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'heading') {
      const text = inlineText(node).trim();
      // A heading with no text is a landmark to nowhere.
      if (text) {
        found.push({
          uid: node.attrs?.uid ?? null,
          level: Math.min(3, Math.max(1, node.attrs?.level ?? 1)),
          text,
        });
      }
    }

    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk(blocks);
  return found;
}

/**
 * Indent an outline relative to its own shallowest heading.
 *
 * A page whose headings are all h2 should render flush, not indented one level
 * because no h1 happens to be present. Authors are not consistent about which
 * level they start at, and an outline that punishes them for it looks broken.
 *
 * @param {{ level: number }[]} outline
 */
export function outlineDepths(outline = []) {
  if (!outline.length) return [];
  const top = Math.min(...outline.map(h => h.level));
  return outline.map(h => ({ ...h, depth: h.level - top }));
}

/**
 * Plain text of a node and its descendants.
 *
 * The separator depends on what the children are, and getting it wrong is
 * quietly wrong rather than visibly wrong. Inline children — the pieces a mark
 * splits "the **notice** was" into — must join with nothing, or the text gains
 * spaces that were never typed. BLOCK children must join with a space, or the
 * end of one paragraph fuses to the start of the next and two words are counted
 * as one.
 */
function inlineText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.text === 'string') return node.text;

  const children = node.content ?? [];
  const inline = children.every(child => typeof child?.text === 'string');
  return children.map(inlineText).join(inline ? '' : ' ');
}

/**
 * How many words a page holds.
 *
 * @param {object|null} blocks
 */
export function wordCount(blocks) {
  const text = inlineText(blocks).replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

/**
 * How long a page takes to read, in words that mean something to a reader.
 *
 * Spec 1's success criterion is that a reader with no prior knowledge
 * understands the matter in 15-20 minutes. A recipient cannot judge that
 * without knowing what they are holding, so a pack that says "about 12 minutes"
 * is setting the expectation the whole product is measured against.
 *
 * Rounded honestly: an estimate reported as "7 minutes" claims a precision it
 * does not have, so everything past a minute is "about N".
 *
 * @param {number} words
 * @returns {string} '' when there is nothing to read
 */
export function describeReadingTime(words) {
  if (!words) return '';
  const minutes = words / WORDS_PER_MINUTE;
  if (minutes < 1) return 'under a minute to read';
  return `about ${Math.round(minutes)} minute${Math.round(minutes) === 1 ? '' : 's'} to read`;
}

/**
 * The whole pack's reading time, so the contents page can state it up front.
 *
 * @param {{ blocks?: object }[]} docs
 */
export function packReadingTime(docs = []) {
  return describeReadingTime(
    docs.reduce((total, doc) => total + wordCount(doc?.blocks), 0));
}

/**
 * Which page a URL fragment is asking for.
 *
 * Tolerates the `#` and percent-encoding, because the fragment arrives from
 * wherever the recipient pasted the link — an email client may have encoded it.
 *
 * @param {string} hash
 * @param {{ id: string, slug?: string }[]} docs
 * @returns {string|null} doc id, or null for "no page named" / "not found"
 */
export function docIdFromHash(hash, docs = []) {
  const slug = decodeFragment(hash);
  if (!slug) return null;
  return docs.find(d => d.slug === slug)?.id ?? null;
}

/** The bare slug inside a fragment, or '' when there is none. */
export function decodeFragment(hash) {
  const raw = String(hash ?? '').replace(/^#/, '').trim();
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * The fragment for a page — '' for the contents page, which is the pack's
 * front door and does not need naming.
 *
 * @param {{ slug?: string }|null} doc
 */
export function hashForDoc(doc) {
  return doc?.slug ? `#${encodeURIComponent(doc.slug)}` : '';
}
