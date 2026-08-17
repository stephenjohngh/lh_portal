// src/lib/apps/info/utils/infoHelpers.js

// fmtBytes and mimeIcon live in the shared utils — re-exported here for
// backwards compatibility so existing Info-app imports don't need updating.
export { fmtBytes, mimeIcon } from '$lib/utils/files.js';

/** Parse a comma-separated tag string into a trimmed, deduplicated array. */
/**
 * The notes to list under a section in the sidebar.
 *
 * Archived notes are left out. The sidebar is for the notes being worked on,
 * and archiving is how a note is taken out of the way — putting them back in
 * the one list you cannot filter would undo that. They remain reachable through
 * the Archived toggle in the main list.
 *
 * Order is preserved rather than re-sorted: the store already returns notes
 * pinned-first then most-recently-updated, and a second opinion about ordering
 * here would only drift from it.
 *
 * @param {object[]} notes  every note (the store keeps them all loaded)
 * @param {string} sectionId
 */
export function sectionNotes(notes = [], sectionId) {
  if (!sectionId) return [];
  return notes.filter(n => n.section_id === sectionId && n.status !== 'archived');
}

/**
 * Every note that is visible outside the Info app, newest publication first.
 *
 * The question this answers — "what have we put out, and to whom?" — was
 * answerable before only by visiting each section in turn with the visibility
 * filter set, which is why nobody could answer it. Publication is the one
 * property of a note that reaches beyond the portal, so it deserves a view that
 * ignores sections entirely.
 *
 * Archived notes are INCLUDED, deliberately: archiving hides a note from the
 * working list, it does not unpublish it. An archived note with
 * `visibility: 'public'` is still a live page on the internet, and that is
 * exactly the thing this view exists to make impossible to miss.
 *
 * @param {object[]} notes
 */
export function publishedNotes(notes = []) {
  return notes
    .filter(n => (n.visibility ?? 'internal') !== 'internal')
    .sort((a, b) => {
      const at = a.published_at ?? a.updated_at ?? '';
      const bt = b.published_at ?? b.updated_at ?? '';
      return String(bt).localeCompare(String(at));
    });
}

/** Is this note readable outside the Info app? */
export function isPublished(note) {
  return (note?.visibility ?? 'internal') !== 'internal';
}

/**
 * What to write when a note is archived or restored.
 *
 * **Archiving a published note also unpublishes it.** Archiving reads as
 * "take this out of circulation", and leaving a live public page behind means
 * the portal and the internet quietly disagree about what the building has
 * said — the note is gone from the working list, and a resident can still read
 * it. The Published view exists because that divergence was invisible; this
 * stops it happening in the first place.
 *
 * **Restoring does NOT republish.** The reverse is not symmetrical and must not
 * be: putting a page back on the internet is an outward-facing act that someone
 * has to choose, not a side effect of un-hiding a note. The slug is kept, so
 * re-publishing later restores the same address.
 *
 * @param {object} note
 * @param {boolean} archived
 * @returns {object} the columns to update
 */
export function archiveNotePatch(note, archived) {
  const patch = { status: archived ? 'archived' : 'active' };

  if (archived && isPublished(note)) {
    patch.visibility   = 'internal';
    patch.published_at = null;
  }
  return patch;
}

/** How many notes are published — for the sidebar count. */
export function publishedCount(notes = []) {
  return notes.filter(n => (n.visibility ?? 'internal') !== 'internal').length;
}

export function parseTags(raw) {
  return [...new Set(
    raw.split(',')
       .map(t => t.trim().toLowerCase())
       .filter(Boolean)
  )];
}

/** Format a tags array back to a display string. */
export function tagsToString(tags) {
  return (tags ?? []).join(', ');
}

/**
 * Strip HTML tags to plain text — for list previews and search now that note
 * bodies are rich HTML. Collapses whitespace; not a security boundary (use
 * sanitizeHtml for rendering).
 */
export function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Visibility badge metadata for a note. */
export const VISIBILITY_BADGES = {
  internal:   { label: 'Internal',   icon: '',   className: 'text-slate-400 border-slate-600' },
  registered: { label: 'Registered', icon: '🔒', className: 'text-blue-300 border-blue-600/40 bg-blue-900/20' },
  public:     { label: 'Public',     icon: '🌐', className: 'text-emerald-300 border-emerald-600/40 bg-emerald-900/20' },
};

/** Section colour palette for the colour picker. */
export const SECTION_COLOURS = [
  { hex: '#6366f1', label: 'Indigo'  },
  { hex: '#0ea5e9', label: 'Sky'     },
  { hex: '#10b981', label: 'Green'   },
  { hex: '#f59e0b', label: 'Amber'   },
  { hex: '#ef4444', label: 'Red'     },
  { hex: '#8b5cf6', label: 'Violet'  },
  { hex: '#ec4899', label: 'Pink'    },
  { hex: '#14b8a6', label: 'Teal'    },
  { hex: '#f97316', label: 'Orange'  },
  { hex: '#64748b', label: 'Slate'   },
];
