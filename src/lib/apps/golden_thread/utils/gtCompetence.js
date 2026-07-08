// src/lib/apps/golden_thread/utils/gtCompetence.js
//
// Competence gating (Stage E) — pure helpers shared by the People registry and
// the ingest form. Competence is a SOFT gate: we map a document to the domain
// competence it needs, then check whether a chosen reviewer/author holds it and
// it hasn't lapsed. Type-1 testable (gtCompetence.test.js). No I/O.

/** Controlled competence vocabulary (author/reviewer domains). */
export const COMPETENCIES = [
  'fire', 'structural', 'fire_door', 'electrical', 'mechanical',
  'facade_cladding', 'water_hygiene', 'lifts', 'general',
];

export const COMPETENCE_LABELS = {
  fire: 'Fire safety',
  structural: 'Structural',
  fire_door: 'Fire doors',
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  facade_cladding: 'Façade / cladding',
  water_hygiene: 'Water hygiene',
  lifts: 'Lifts',
  general: 'General',
};

/**
 * The domain competence a document needs, inferred from its type. Returns a
 * competence tag or null (no specific requirement). Keyword-based and
 * deliberately forgiving — the gate only warns.
 * @param {string} documentType
 * @returns {string|null}
 */
export function requiredCompetenceForDoc(documentType) {
  const t = (documentType ?? '').toLowerCase();
  if (!t) return null;
  if (t.includes('fire door'))                          return 'fire_door';
  if (t.includes('ews1') || t.includes('cladding') || t.includes('external wall')) return 'facade_cladding';
  if (t.includes('eicr') || t.includes('electric'))     return 'electrical';
  if (t.includes('lift') || t.includes('loler'))        return 'lifts';
  if (t.includes('legionella') || t.includes('water'))  return 'water_hygiene';
  if (t.includes('gas') || t.includes('mechanical') || t.includes('sprinkler') || t.includes('smoke')) return 'mechanical';
  if (t.includes('structural'))                         return 'structural';
  if (t.includes('fire') || t.includes('evacuation') || t.includes('compartment')) return 'fire';
  return null;
}

/** Has this person's competence lapsed as at `todayISO`? */
export function competenceExpired(person, todayISO) {
  if (!person?.competence_expiry) return false;
  const today = todayISO ?? new Date().toISOString().slice(0, 10);
  return person.competence_expiry < today;
}

/**
 * Assess a chosen person against a document type. Returns a soft verdict.
 * @param {{competencies?: string[], competence_expiry?: string|null}|null} person
 * @param {string} documentType
 * @param {string} [todayISO]
 * @returns {{ ok: boolean, required: string|null, missing: boolean, expired: boolean }}
 */
export function assessCompetence(person, documentType, todayISO) {
  const required = requiredCompetenceForDoc(documentType);
  if (!person) return { ok: true, required, missing: false, expired: false };
  const held    = new Set(person.competencies ?? []);
  const missing = required != null && !held.has(required) && !held.has('general');
  const expired = competenceExpired(person, todayISO);
  return { ok: !missing && !expired, required, missing, expired };
}
