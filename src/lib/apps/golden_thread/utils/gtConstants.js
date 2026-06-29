// src/lib/apps/golden_thread/utils/gtConstants.js
//
// Controlled vocabularies for the Golden Thread register. DOCUMENT_TYPES is a
// starter Master Document List aligned to the Schedule-1 themes — a controlled
// picker for ingest (replacing free text). Extend as the building's real
// document set is catalogued; values are stored verbatim in
// gt_documents.document_type (plain text, no DB constraint).

/** Master Document List — document_type options (label === stored value). */
export const DOCUMENT_TYPES = [
  'Fire strategy',
  'Evacuation strategy',
  'Personal emergency evacuation plan (PEEP)',
  'Fire risk assessment',
  'Fire door inspection report',
  'Compartmentation survey',
  'Structural design statement',
  'Structural assessment',
  'Operation & maintenance (O&M) manual',
  'Commissioning certificate',
  'Test / inspection certificate',
  'Planned maintenance schedule',
  'Building regulations approval',
  'As-built drawing',
  'Key Building Information (KBI)',
  'Building assessment certificate',
  'Resident engagement strategy',
  'Complaints procedure',
  'Mandatory occurrence report',
  'Other (unspecified)'
];

/** gt_persons.role options. */
export const PERSON_ROLES = ['author', 'reviewer', 'both'];

/** Relations for gt_links (citations between the register and other records). */
export const LINK_RELATIONS = ['evidences', 'cites', 'produced_by', 'action_register', 'drill_down'];

/** Target entity types a register document may link to. */
export const LINK_TARGET_TYPES = [
  'mor_case', 'maintenance_job', 'component_inspection', 'action', 'plan', 'component', 'gt_document'
];
