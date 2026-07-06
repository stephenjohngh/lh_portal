// src/lib/apps/golden_thread/utils/gtConstants.js
//
// Controlled vocabularies for the Golden Thread register. DOCUMENT_TYPES is a
// starter Master Document List aligned to the Schedule-1 themes — a controlled
// picker for ingest (replacing free text). Extend as the building's real
// document set is catalogued; values are stored verbatim in
// gt_documents.document_type (plain text, no DB constraint).

/**
 * Master Document List — document_type options (label === stored value).
 * A starter set covering the common controlled documents for a residential
 * higher-risk building; extend as the building's real document set is
 * catalogued. Grouped only for readability — stored as a flat vocabulary.
 */
export const DOCUMENT_TYPES = [
  // Fire safety — strategy & assessment
  'Fire strategy',
  'Evacuation strategy',
  'Personal emergency evacuation plan (PEEP)',
  'Fire risk assessment',
  'Fire door inspection report',
  'Compartmentation survey',
  'External wall system (EWS1) assessment',
  'Cladding / external wall survey',
  // Fire safety — active systems (periodic test/maintenance)
  'Fire alarm test / maintenance certificate',
  'Emergency lighting test certificate',
  'Sprinkler / suppression system certificate',
  'Smoke control / AOV maintenance certificate',
  'Dry / wet riser test certificate',
  // Structure
  'Structural design statement',
  'Structural assessment',
  // Building services compliance
  'Electrical installation condition report (EICR)',
  'Gas safety record',
  'Lift inspection report (LOLER)',
  'Lightning protection test certificate',
  'Legionella / water hygiene risk assessment',
  'Asbestos survey / register',
  // Operation, commissioning & general
  'Operation & maintenance (O&M) manual',
  'Commissioning certificate',
  'Test / inspection certificate',
  'Planned maintenance schedule',
  'Building regulations approval',
  'As-built drawing',
  'Key Building Information (KBI)',
  'Building assessment certificate',
  // Residents & occurrences
  'Resident engagement strategy',
  'Complaints procedure',
  'Mandatory occurrence report',
  'Other (unspecified)'
];

/**
 * Review-band display vocabulary — maps the pure reviewBand() output
 * (gtReview.js) to a user label + a Badge background class. Keyed by band;
 * null bands (not due soon / no review date) render no badge.
 */
export const REVIEW_BAND_LABEL = {
  overdue: 'Review overdue',
  due_30:  'Review due ≤30d',
  due_60:  'Review due ≤60d',
  due_90:  'Review due ≤90d',
};
export const REVIEW_BAND_BADGE = {
  overdue: 'bg-red-700',
  due_30:  'bg-amber-600',
  due_60:  'bg-yellow-700',
  due_90:  'bg-slate-600',
};

/** gt_persons.role options. */
export const PERSON_ROLES = ['author', 'reviewer', 'both'];

/** Relations for gt_links (citations between the register and other records). */
export const LINK_RELATIONS = ['evidences', 'cites', 'produced_by', 'action_register', 'drill_down'];

/** Target entity types a register document may link to. */
export const LINK_TARGET_TYPES = [
  'mor_case', 'maintenance_job', 'component_inspection', 'action', 'plan', 'component', 'gt_document'
];
