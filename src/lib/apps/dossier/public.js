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
import { api } from '#lib/utils/api.js';

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

/**
 * The packs made from Management issues that this person can open, for a link
 * beside each issue: `{ id, title, source_id }`, newest first. RLS decides what
 * is returned (a dossier is its creator's, or an admin's); archived packs are
 * left out. READ-only.
 */
export async function listPacksFromIssues() {
  const rows = await api.get('dossier_packs', {
    select: 'id, title, source_id, status, created_at',
    filters: { source_kind: 'management_issue' },
    orderBy: 'created_at', ascending: false,
  });
  return (rows ?? []).filter(p => p.status !== 'archived')
    .map(({ id, title, source_id }) => ({ id, title, source_id }));
}
