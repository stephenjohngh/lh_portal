// src/lib/apps/dossier/utils/embedGuard.js
// Deciding how an embedded page should render — pure, Type-1 testable.
//
// Transclusion is the one feature in this app that can hang a browser: a page
// embedding a page that embeds the first will recurse forever, and a deep chain
// will expand exponentially. The merge doc (§5.2, decision D12) requires the
// guard to DEGRADE rather than fail — a repeated node renders as a link card
// with a note, never an error and never a loop.
//
// Keeping the decision here, separate from the renderer, is what makes it
// testable without a DOM and impossible for a caller to skip.

/**
 * How deep transclusion resolves. A page embedded at this depth renders as a
 * card instead of expanding. Spec 2 §5.2 suggests 2; 3 gives a little room
 * while still bounding the work.
 */
export const MAX_EMBED_DEPTH = 3;

/** Render modes an author can ask for. */
export const EMBED_MODES = ['full', 'summary', 'link_card'];

export const EMBED_MODE_LABEL = {
  full:      'Full content',
  summary:   'Summary',
  link_card: 'Link only',
};

/** Coerce an unrecognised mode rather than letting it reach the renderer. */
export function normaliseEmbedMode(mode) {
  return EMBED_MODES.includes(mode) ? mode : 'full';
}

/**
 * Decide how one embed renders, given where it sits.
 *
 * @param {object}   params
 * @param {string}   params.requested   - the mode the author chose
 * @param {string}   params.targetId    - the page being embedded
 * @param {string[]} params.ancestry    - ids already being rendered, outermost first
 * @param {boolean}  params.exists      - whether the target is still in the pack
 * @param {number}  [params.maxDepth]
 * @returns {{ mode: 'full'|'summary'|'link_card', note: null|'missing'|'cycle'|'depth' }}
 */
export function resolveEmbedRender({
  requested, targetId, ancestry = [], exists = true, maxDepth = MAX_EMBED_DEPTH,
}) {
  // A deleted page still shows as a card, so the author can see the reference
  // is stale rather than the embed silently vanishing.
  if (!exists) return { mode: 'link_card', note: 'missing' };

  // The cycle guard. Includes the self-embed case, since a page is always the
  // first entry in its own ancestry.
  if (ancestry.includes(targetId)) return { mode: 'link_card', note: 'cycle' };

  // Depth is measured in how many pages are already open above this one.
  if (ancestry.length >= maxDepth) return { mode: 'link_card', note: 'depth' };

  return { mode: normaliseEmbedMode(requested), note: null };
}

/** What to tell the reader when an embed could not be expanded. */
export const EMBED_NOTE_TEXT = {
  missing: 'This page no longer exists.',
  cycle:   'Already shown above — expanding it again would loop.',
  depth:   'Nested too deeply to show inline.',
};

/**
 * First paragraph of a page, for `summary` mode. Walks the JSON directly, so no
 * DOM is needed and the P3 reader can call it against a snapshot.
 *
 * @param {object} blocks
 * @param {number} [limit]
 */
export function firstParagraphText(blocks, limit = 240) {
  const content = Array.isArray(blocks?.content) ? blocks.content : [];

  for (const node of content) {
    if (node?.type !== 'paragraph') continue;
    const text = collectText(node).trim();
    if (text) return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
  }
  return '';
}

function collectText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.text === 'string') return node.text;
  if (!Array.isArray(node.content)) return '';
  return node.content.map(collectText).join('');
}
