// src/lib/apps/dossier/public.js
// Cross-app interface for the Dossier app — see docs/Inter_App_Interfaces.md.
//
// Nothing is exposed yet. Dossier owns dossier_packs / dossier_docs /
// dossier_doc_revisions, and in P0 no other app reads or writes them.
//
// Expected to grow at P1–P3, when other apps may want to ask questions like
// "which packs cite this document?" — at which point the accessor belongs here
// (stateless, rule-bearing), not in a consumer's store.

export {};
