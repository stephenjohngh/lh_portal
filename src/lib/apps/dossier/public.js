// src/lib/apps/dossier/public.js
// Cross-app interface for the Dossier app — see docs/design/Inter_App_Interfaces.md.
//
// Other apps may ask Dossier to make a PRIVATE working pack from a plan (a title,
// folders, files, pages and tables as plain data — see utils/packPlan.js). They
// never touch Dossier's tables. Nothing is published and nothing navigates: the
// caller is told what was made and the author carries on in Dossier.

import { dossierStore } from './stores/dossierStore.js';
import { makeHtmlToNodes } from './utils/planBlocks.js';
import { emptyPlan, planProblems, describePlan } from './utils/packPlan.js';
import { currentUserId } from '#lib/utils/currentUser.js';

export { emptyPlan as newPackPlan, planProblems, describePlan };

/**
 * Make a pack from a plan. Files with `source: { kind: 'library', documentId }`
 * are copied from the document library; `kind: 'upload'` files need `uploads`.
 *
 * @param {object} plan
 * @param {{ folderId?: string|null, uploads?: Record<string, File> }} [options]
 * @returns {Promise<{ pack: object, counts: object, skipped: { name: string, reason: string }[] }>}
 */
export async function createPackFromPlan(plan, options = {}) {
  const userId = await currentUserId();
  if (!userId) throw new Error('You must be signed in to make a pack.');
  return dossierStore.createPackFromPlan(plan, { ...options, htmlToNodes: makeHtmlToNodes() }, userId);
}
