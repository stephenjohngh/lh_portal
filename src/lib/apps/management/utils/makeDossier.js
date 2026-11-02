// src/lib/apps/management/utils/makeDossier.js
// The one place Management reaches the Dossier app: its public.js, loaded only
// when a pack is actually made (Dossier is a separate chunk).
export async function makePackFromPlan(plan) {
  const { createPackFromPlan } = await import('../../dossier/public.js');
  return createPackFromPlan(plan);
}
