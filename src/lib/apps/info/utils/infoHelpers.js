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
