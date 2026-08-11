// src/lib/apps/dossier/utils/blockRender.js
// The read half of the shared renderer (merge doc §11, decision D10).
//
// Composer and the P3 public reader must render from ONE definition, so that
// what the author sees is what the recipient gets. That is achieved by both
// modes going through `buildExtensions()` and the `.dossier-prose` stylesheet
// in components/BlockContent.svelte — the only difference is whether a live
// Editor is attached (mode 'edit') or static HTML is generated (mode 'read').
//
// Nothing here touches the DB or Svelte, so the P3 reader can call it from a
// snapshot without loading any authoring code.

import { generateHTML } from '@tiptap/core';
import DOMPurify        from 'dompurify';
import { getLogger }    from '$lib/utils/logger';
import { buildExtensions, EMPTY_DOC } from './blockSchema.js';
import { isProxyUrl } from './assetPreview.js';
import {
  resolveEmbedRender, firstParagraphText, EMBED_NOTE_TEXT, MAX_EMBED_DEPTH,
} from './embedGuard.js';

const logger = getLogger('dossierBlockRender');

// A Dossier-specific allow-list rather than the shared $lib/utils/sanitizeHtml:
// that one is documented as matching StarterKit output, and this schema adds
// callout and toggle. Their styling and every block anchor ride on data-*
// attributes, so those must survive — hence ALLOW_DATA_ATTR is explicit rather
// than left to DOMPurify's default.
const ALLOWED_TAGS = [
  'p', 'br', 'hr',
  'h1', 'h2', 'h3',
  'blockquote', 'ul', 'ol', 'li',
  'code', 'pre',
  'strong', 'em', 's', 'b', 'i', 'u',
  'a', 'span', 'div',
  // Asset previews (P1 step 2). `img` only — neither `iframe` nor `object` is
  // admitted. PDFs render as an open-in-new-tab card rather than an embedded
  // viewer (see assetPreview.js), which means no frame primitive needs to
  // exist in the one feature built to be handed to an outsider.
  'img',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'src', 'alt', 'title'];

/**
 * Sanitise generated block HTML before it reaches {@html}.
 *
 * The HTML is produced from our own schema, so this is defence in depth rather
 * than the primary control — but a pack is the one thing in this portal built
 * to be handed to an outsider, so the render path is belt and braces.
 */
export function sanitizeBlockHtml(html) {
  if (typeof html !== 'string' || html === '') return '';
  // DOMPurify needs a window; during SSR there is nothing to render into.
  if (typeof window === 'undefined') return html;

  // Confine <img> to this app's own file proxy, so a stored block cannot point
  // at an external URL — which would leak a reader's IP to a third party the
  // moment a published pack is opened.
  const hook = (node) => {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'img' && !isProxyUrl(node.getAttribute('src'))) {
      node.remove();
    }
  };

  DOMPurify.addHook('afterSanitizeAttributes', hook);
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: true,
      ADD_ATTR: ['target', 'rel'],
    });
  } finally {
    // DOMPurify hooks are global; leaving this one installed would silently
    // change every other sanitise call in the app.
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

/**
 * Render stored ProseMirror JSON to sanitised HTML.
 *
 * Returns '' for anything unrenderable rather than throwing: stored JSON that
 * no longer matches the schema must not take a whole page — or a published
 * pack — down with it. The caller distinguishes "empty" from "broken".
 *
 * @param {object} blocks - dossier_docs.blocks
 * @returns {string}
 */
export function renderBlocksToHtml(blocks, opts = {}) {
  const json = blocks && typeof blocks === 'object' && blocks.type ? blocks : EMPTY_DOC;
  try {
    const html = sanitizeBlockHtml(generateHTML(json, buildExtensions()));
    return expandEmbeds(html, opts);
  } catch (err) {
    logger('⚠ could not render blocks', err);
    return '';
  }
}

/**
 * The "resolve references" stage of the pipeline (spec 2 §11).
 *
 * Embed nodes render only a placeholder, because a declarative renderHTML has
 * no access to the other pages. This fills each one — applying the cycle and
 * depth guard first, and recursing through the SAME renderer so an embedded
 * page looks exactly like the real thing.
 *
 * A no-op when there are no pages to resolve against (the editor's own live
 * view) or no DOM (SSR), so callers never have to check.
 *
 * @param {string} html
 * @param {{ docs?: object[], ancestry?: string[], maxDepth?: number }} opts
 */
function expandEmbeds(html, { docs = [], ancestry = [], maxDepth = MAX_EMBED_DEPTH } = {}) {
  if (!html || typeof document === 'undefined') return html;
  // No pages to resolve against means the CALLER supplied no resolver — the
  // live editor, which fills placeholders with its own node view. It does not
  // mean every target is deleted, and treating it that way would stamp
  // "this page no longer exists" over every embed in the editor.
  if (!docs.length) return html;

  const host = document.createElement('div');
  host.innerHTML = html;

  const placeholders = host.querySelectorAll('div[data-embed-doc]');
  if (!placeholders.length) return html;

  const byId = new Map(docs.map(d => [d.id, d]));

  for (const node of placeholders) {
    const targetId = node.getAttribute('data-embed-doc');
    const target   = byId.get(targetId);
    const title    = target?.title || node.getAttribute('data-embed-title') || 'Untitled page';

    const decision = resolveEmbedRender({
      requested: node.getAttribute('data-embed-mode'),
      targetId,
      ancestry,
      exists:    Boolean(target),
      maxDepth,
    });

    node.setAttribute('data-embed-rendered', decision.mode);
    if (decision.note) node.setAttribute('data-embed-note', decision.note);

    const heading = `<div class="dossier-embed-title">${escapeHtml(title)}</div>`;

    if (decision.mode === 'full') {
      // Recurse with this page pushed onto the ancestry — that is what the
      // cycle guard reads on the way back down.
      const inner = renderBlocksToHtml(target.blocks, {
        docs, ancestry: [...ancestry, targetId], maxDepth,
      });
      node.innerHTML = `${heading}<div class="dossier-embed-body">${inner}</div>`;
      continue;
    }

    if (decision.mode === 'summary') {
      const summary = firstParagraphText(target.blocks);
      node.innerHTML = heading
        + `<div class="dossier-embed-summary">${escapeHtml(summary || 'This page is empty.')}</div>`;
      continue;
    }

    const note = decision.note ? EMBED_NOTE_TEXT[decision.note] : '';
    node.innerHTML = heading
      + (note ? `<div class="dossier-embed-note">${escapeHtml(note)}</div>` : '');
  }

  return host.innerHTML;
}

/** Titles and summaries are plain text and must not be able to inject markup. */
function escapeHtml(value) {
  const el = document.createElement('span');
  el.textContent = String(value ?? '');
  return el.innerHTML;
}

/**
 * Plain-text preview of a doc — for search snippets, list subtitles and the
 * revision history. Walks the JSON directly; no DOM required, so this one is
 * safe to call server-side.
 *
 * @param {object} blocks
 * @param {number} [limit]
 */
export function blocksToText(blocks, limit = 160) {
  const parts = [];

  const walk = (node) => {
    if (!node || parts.join(' ').length > limit) return;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(blocks);

  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}
