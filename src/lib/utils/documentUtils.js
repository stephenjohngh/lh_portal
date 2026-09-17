// src/lib/utils/documentUtils.js
// Client-side constants and helpers for the document library.

export const MIME_ICONS = {
  'application/pdf':                                                         '📄',
  'application/msword':                                                      '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel':                                                '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       '📊',
  'application/vnd.ms-powerpoint':                                           '📊',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':'📊',
  'image/jpeg':                                                              '🖼',
  'image/png':                                                               '🖼',
  'image/gif':                                                               '🖼',
  'image/webp':                                                              '🖼',
  'image/svg+xml':                                                           '🖼',
  'text/plain':                                                              '📃',
  'text/csv':                                                                '📊',
  'application/zip':                                                         '🗜',
  'application/x-zip-compressed':                                            '🗜',
};

export const DOC_TYPES = [
  { value: 'photo',       label: 'Photo' },
  { value: 'pdf',         label: 'PDF' },
  { value: 'word',        label: 'Word Document' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'report',      label: 'Report' },
  { value: 'drawing',     label: 'Drawing / Plan' },
  { value: 'other',       label: 'Other' },
];

export const CATEGORIES = [
  { value: 'installation_cert',    label: 'Installation Certificate' },
  { value: 'test_cert',            label: 'Test Certificate' },
  { value: 'commissioning_cert',   label: 'Commissioning Certificate' },
  { value: 'inspection_report',    label: 'Inspection Report' },
  { value: 'fire_risk_assessment', label: 'Fire Risk Assessment' },
  { value: 'structural_report',    label: 'Structural Report' },
  { value: 'ews1',                 label: 'EWS1' },
  { value: 'safety_case',          label: 'Safety Case' },
  { value: 'asbestos_survey',      label: 'Asbestos Survey' },
  { value: 'eicr',                 label: 'EICR' },
  { value: 'gas_safety',           label: 'Gas Safety' },
  { value: 'warranty',             label: 'Warranty' },
  { value: 'specification',        label: 'Specification' },
  { value: 'invoice',              label: 'Invoice' },
  { value: 'other',                label: 'Other' },
];

export const ENTITY_TYPES = [
  { value: 'component',        label: 'Component' },
  { value: 'maintenance_job',  label: 'Maintenance Job' },
  { value: 'issue',            label: 'Issue' },
  { value: 'activity',         label: 'Activity' },
  { value: 'facility',         label: 'Facility' },
  { value: 'inspection',       label: 'Inspection' },
];

/**
 * Human-readable file size string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Return the display icon for a MIME type.
 * @param {string} mimeType
 * @returns {string}
 */
export function mimeIcon(mimeType) {
  return MIME_ICONS[mimeType] ?? '📎';
}

/**
 * Derive a doc_type value from a MIME type string.
 *
 * This states a FACT about the file, not a judgement about its content — a PDF
 * is a PDF — which is why the server applies it to every upload. The
 * content-level judgement is `category`, and that is asked for, never derived.
 *
 * @param {string|null|undefined} mimeType
 * @returns {string}  a DOC_TYPES value; 'other' when nothing fits
 */
export function docTypeFromMime(mimeType) {
  const m = String(mimeType ?? '').toLowerCase();
  if (!m) return 'other';
  if (m.startsWith('image/'))  return 'photo';
  if (m === 'application/pdf') return 'pdf';
  // OpenDocument and RTF are word-processing documents too; matching only on
  // the substring 'word' left every .odt in the library as 'other'.
  if (m.includes('word') ||
      m.includes('opendocument.text') ||
      m === 'application/rtf' || m === 'text/rtf') return 'word';
  if (m.includes('excel') || m.includes('spreadsheet') || m === 'text/csv') return 'spreadsheet';
  return 'other';   // .txt, .zip, presentations — DOC_TYPES has no better word
}

/**
 * True when a stored doc_type carries no information. 'other' is the column
 * default AND a real menu choice, so the two are indistinguishable in the row —
 * both mean "nobody classified this", which is what lets the server derive one.
 * @param {string|null|undefined} docType
 */
export function isUnclassifiedDocType(docType) {
  return !docType || docType === 'other';
}

const MS_DAY = 86_400_000;

/**
 * @param {string|null} expiryDate  ISO date string
 * @returns {'expired'|'expiring-soon'|'ok'|null}
 */
export function getExpiryStatus(expiryDate) {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  if (diff < 0)           return 'expired';
  if (diff < 30 * MS_DAY) return 'expiring-soon';
  return 'ok';
}

/** @param {string|null} expiryDate */
export function isExpired(expiryDate) {
  return getExpiryStatus(expiryDate) === 'expired';
}

/** @param {string|null} expiryDate */
export function isExpiringSoon(expiryDate) {
  return getExpiryStatus(expiryDate) === 'expiring-soon';
}

/**
 * Build the label string for doc_type.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function docTypeLabel(value) {
  return DOC_TYPES.find(d => d.value === value)?.label ?? value ?? '—';
}

/**
 * Build the label string for category.
 * @param {string|null|undefined} value
 * @returns {string}
 */
export function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label ?? value ?? '—';
}

// ── Category ────────────────────────────────────────────────────────
// `category` is a statement about what a document IS to this building — an
// EICR, a fire risk assessment, a safety case. Unlike doc_type it cannot be
// read off the bytes, so it is never derived and written on the server.
//
// ⚠ What follows SUGGESTS one from the filename, for a form field the person
// sees and can change before they upload. That is the difference that matters:
// a wrong compliance category stamped silently reads as a determination
// nobody made. Assist, don't assert.

/**
 * Filename keywords → a CATEGORIES value. Matched against the filename after
 * every separator becomes a space, so ' eicr ' can be required rather than a
 * bare substring — otherwise 'fra' matches "infrastructure" and 'quote'
 * matches "quotes". Ordered: the first match wins, most specific first.
 * @type {[RegExp, string][]}
 */
const CATEGORY_HINTS = [
  [/(^| )(fra|fraew)( |$)|fire risk/,                'fire_risk_assessment'],
  [/(^| )ews ?-?1( |$)|external wall/,               'ews1'],
  [/(^| )eicr( |$)|electrical install/,              'eicr'],
  [/gas safe|(^| )cp12( |$)/,                        'gas_safety'],
  [/asbestos/,                                       'asbestos_survey'],
  [/safety case/,                                    'safety_case'],
  [/structural/,                                     'structural_report'],
  [/commission/,                                     'commissioning_cert'],
  [/install(ation)? cert/,                           'installation_cert'],
  [/test cert|(^| )cert(ificate)?( |$)/,             'test_cert'],
  [/inspection|service report|condition report/,     'inspection_report'],
  [/warrant(y|ies)|guarantee/,                       'warranty'],
  [/specification|scope of works?/,                  'specification'],
  [/invoice|quotation|(^| )quote( |$)/,              'invoice'],
];

/**
 * Suggest a category from a filename. Returns '' when nothing matches — an
 * empty suggestion is the honest answer, and better than a confident wrong one.
 * @param {string|null|undefined} filename
 * @returns {string}  a CATEGORIES value, or ''
 */
export function categoryFromFilename(filename) {
  const name = String(filename ?? '')
    .replace(/\.[a-z0-9]+$/i, '')        // drop the extension
    .replace(/[^a-z0-9]+/gi, ' ')        // snake / kebab / dotted / spaced → words
    .trim()
    .toLowerCase();
  if (!name) return '';
  for (const [pattern, value] of CATEGORY_HINTS) {
    if (pattern.test(name)) return value;
  }
  return '';
}

// ── Folder hierarchy ────────────────────────────────────────────────────────
// document_library.folder_path holds the whole hierarchy as one string
// ("Issues/Issue 49"), so the folder a document is in is only meaningful read
// as a path. These helpers display and order it as one.

const folderCollator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

/**
 * Split a folder_path into its segments. Tolerates a null path, leading or
 * trailing slashes and empty segments.
 * @param {string|null|undefined} folderPath
 * @returns {string[]}
 */
export function folderSegments(folderPath) {
  return (folderPath ?? '').split('/').map(s => s.trim()).filter(Boolean);
}

/**
 * The full hierarchy for display. A document with no folder reads '—'.
 * @param {string|null|undefined} folderPath
 * @returns {string}
 */
export function folderLabel(folderPath) {
  const segs = folderSegments(folderPath);
  return segs.length ? segs.join(' / ') : '—';
}

/**
 * Order two folder paths SEGMENT BY SEGMENT, not as plain strings — a plain
 * comparison sorts '/' (0x2F) after a space, so a sibling folder ("Issues 2")
 * would slot in between a parent and its children ("Issues/Issue 49").
 * Numeric collation keeps "Issue 49" before "Issue 100". Unfoldered documents
 * sort last, so the hierarchy reads from the top.
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {number}
 */
export function compareFolderPath(a, b) {
  const A = folderSegments(a);
  const B = folderSegments(b);
  if (!A.length !== !B.length) return A.length ? -1 : 1;
  const shared = Math.min(A.length, B.length);
  for (let i = 0; i < shared; i++) {
    const c = folderCollator.compare(A[i], B[i]);
    if (c) return c;
  }
  return A.length - B.length;   // a parent before its children
}

/** @param {{display_name?: string|null, filename?: string|null}|null|undefined} doc */
export function docName(doc) {
  return doc?.display_name ?? doc?.filename ?? '';
}

/**
 * Sort documents by their full folder path, then by name within the folder.
 * Does not mutate the input.
 * @param {Object[]} docs  document_library rows
 * @returns {Object[]}
 */
export function sortDocsByFolder(docs = []) {
  return [...docs].sort((a, b) =>
    compareFolderPath(a.folder_path, b.folder_path) ||
    folderCollator.compare(docName(a), docName(b)));
}
