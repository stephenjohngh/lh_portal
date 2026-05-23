// src/lib/apps/info/utils/infoHelpers.js

/** Format a byte count into a human-readable string. */
export function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Return a simple icon character for a MIME type. */
export function mimeIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType === 'application/pdf')                      return '📄';
  if (mimeType.startsWith('image/'))                       return '🖼';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('sheet') || mimeType.includes('excel'))   return '📊';
  if (mimeType.startsWith('text/'))                        return '📃';
  return '📎';
}

/** Build the public storage URL for an info-docs file. */
export function infoDocUrl(storagePath) {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/storage/v1/object/public/info-docs/${storagePath}`;
}

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
