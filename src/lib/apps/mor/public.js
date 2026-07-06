// src/lib/apps/mor/public.js
//
// MOR app's cross-app interface (stateless). Other apps read MOR-owned cases
// through these accessors rather than querying mor_cases directly — e.g. the
// Golden Thread citation picker lists cases here to link a register document to
// the occurrence report it evidences. See docs/Inter_App_Interfaces.md.

import { api } from '$lib/utils/api';

// Lightweight case shape for pickers / cross-app references — never the full row.
const CASE_REF_SELECT = 'id, reference, status, mechanism, description, location_text, identification_date';

/**
 * MOR cases as lightweight references, newest first. For cross-app pickers.
 * @returns {Promise<Array<{id:string,reference:string,status:string,mechanism:string,description:string,location_text:string,identification_date:string}>>}
 */
export function listCases() {
  return api.get('mor_cases', {
    select: CASE_REF_SELECT,
    orderBy: 'identification_date',
    ascending: false,
  });
}

/** A single case as a lightweight reference, or null. */
export function getCase(id) {
  return api.getById('mor_cases', id, CASE_REF_SELECT);
}

/**
 * Human-readable one-line label for a case reference — `MOR-xxxx — <detail>`,
 * the detail being the first non-empty of description / location / mechanism,
 * truncated. Shared so cross-app displays don't drift.
 * @param {{reference?:string, description?:string, location_text?:string, mechanism?:string}|null} c
 */
export function morCaseLabel(c) {
  if (!c) return 'Unknown case';
  const detail = (c.description || c.location_text || c.mechanism || '').trim();
  const short = detail.length > 60 ? detail.slice(0, 57) + '…' : detail;
  return short ? `${c.reference} — ${short}` : c.reference;
}
