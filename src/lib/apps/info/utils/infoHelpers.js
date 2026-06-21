// src/lib/apps/info/utils/infoHelpers.js

// fmtBytes and mimeIcon live in the shared utils — re-exported here for
// backwards compatibility so existing Info-app imports don't need updating.
export { fmtBytes, mimeIcon } from '$lib/utils/files.js';

/** Parse a comma-separated tag string into a trimmed, deduplicated array. */
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
