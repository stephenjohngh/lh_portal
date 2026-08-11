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
  // Asset previews (P1 step 2). `object` is a tag one would normally never
  // whitelist — it can embed arbitrary content types — so it is admitted here
  // ONLY together with the hook below, which strips any <object> whose data
  // does not point at this app's own file proxy.
  'img', 'object',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'src', 'alt', 'data', 'type'];

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

  // Confine <object> and <img> to this app's own file proxy. Without this, the
  // `object` tag above would be a general-purpose embed primitive in the one
  // feature designed to be handed to an outsider.
  const hook = (node) => {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'object' && !isProxyUrl(node.getAttribute('data'))) {
      node.remove();
    } else if (tag === 'img' && !isProxyUrl(node.getAttribute('src'))) {
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
export function renderBlocksToHtml(blocks) {
  const json = blocks && typeof blocks === 'object' && blocks.type ? blocks : EMPTY_DOC;
  try {
    return sanitizeBlockHtml(generateHTML(json, buildExtensions()));
  } catch (err) {
    logger('⚠ could not render blocks', err);
    return '';
  }
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
