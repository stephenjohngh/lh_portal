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
 * @param {string} mimeType
 * @returns {string}
 */
export function docTypeFromMime(mimeType) {
  if (!mimeType) return 'other';
  if (mimeType.startsWith('image/'))    return 'photo';
  if (mimeType === 'application/pdf')   return 'pdf';
  if (mimeType.includes('word'))        return 'word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'text/csv') return 'spreadsheet';
  return 'other';
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
 * @param {string} value
 * @returns {string}
 */
export function docTypeLabel(value) {
  return DOC_TYPES.find(d => d.value === value)?.label ?? value ?? '—';
}

/**
 * Build the label string for category.
 * @param {string} value
 * @returns {string}
 */
export function categoryLabel(value) {
  return CATEGORIES.find(c => c.value === value)?.label ?? value ?? '—';
}
