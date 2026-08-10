// src/lib/apps/dossier/utils/slug.js
// Doc slugs — pure, Type-1 testable.
//
// A slug is unique within a pack (enforced by a DB index) and becomes the
// public URL segment when a pack is published at P3. That is why slugs are
// generated once at creation and NEVER regenerated on rename: changing one
// would silently break every deep link a recipient already holds.

const MAX_LEN = 80;

/**
 * Turn a title into a URL-safe slug.
 * "14 Lonsdale House - Cafe dispute!" -> "14-lonsdale-house-cafe-dispute"
 *
 * NFKD matters: it splits an accented character into base letter + combining
 * mark, so the base letter survives the strip below and "Cafe" keeps its 'e'.
 * Without it the whole accented character is non-ASCII and would be eaten,
 * giving "caf-". The mark itself needs no special handling — it is non-
 * alphanumeric, so the `+` in the next replace absorbs it into the same run as
 * any adjacent space.
 *
 * @param {string} title
 * @returns {string} never empty - falls back to 'untitled'
 */
export function slugify(title) {
  const slug = (title ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LEN)
    .replace(/-+$/, '');               // truncation can leave a trailing hyphen
  return slug || 'untitled';
}

/**
 * Slugify, then suffix until it is free within the pack.
 * @param {string}   title
 * @param {string[]} taken - slugs already used in this pack
 * @returns {string}
 */
export function uniqueSlug(title, taken = []) {
  const base = slugify(title);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
