// src/lib/server/statementDocument.js
//
// The whole obligations statement, assembled: the prose sections a person
// edits, with §6 generated from the register and dropped into its slot.
//
// R5 of docs/requirements/build_plans/Register_In_The_App_Build_Plan.md.
//
// ⛔ THE ASSEMBLY IS GATED THE WAY §6 WAS. `npm run check:statement-render`
// asserts that assembling the shipped prose with the shipped register
// reproduces the document on disk byte for byte. Until that holds, generating
// the statement would mean replacing a document that has been through fourteen
// rounds of external review with one that is merely similar to it, and nobody
// would be able to tell what had changed.
//
// ⚠ The generated-at stamp is deliberately NOT inside the assembled markdown.
// It belongs to the artefact, not to the text: the same prose and the same
// register produce the same document, and a timestamp inside it would make
// every assembly differ from every other and destroy the byte-for-byte gate
// that is the only evidence this is safe. The Word export stamps its own
// header, where `makeHeader(title, generatedAt)` already puts it on the other
// nine generated documents.

import { renderSection6 } from './statementSection6.js';
import { normaliseMarkdown } from '../utils/statementProseParse.js';

/**
 * @param {Object} params
 * @param {{key: string, position: number, generated: boolean, markdown: string}[]} params.prose
 * @param {Object[]} params.entries       the whole register
 * @param {Record<string, Object>} [params.provenance]
 * @returns {string} the complete statement as markdown
 */
export function assembleStatement({ prose, entries, provenance = {} }) {
  if (!Array.isArray(prose) || prose.length === 0) {
    throw new Error('the statement cannot be assembled without its prose');
  }
  const generated = prose.filter(s => s.generated);
  if (generated.length !== 1) {
    // ⛔ Not pedantry. None and §6 is silently absent from a document whose
    // entire subject it is; more than one and it is printed twice.
    throw new Error(
      `the statement needs exactly one generated section, found ${generated.length}`,
    );
  }

  const ordered = [...prose].sort((a, b) => a.position - b.position);
  const out = ordered.map((s) => {
    // ⚠ Normalised HERE as well as at the seed, because by the time the app is
    // running the prose comes from the database, where it was typed into a
    // browser textarea — and a submitted textarea value uses CRLF.
    if (!s.generated) return normaliseMarkdown(s.markdown);
    // ⚠ `renderSection6` throws rather than dropping a row — see its own note.
    // A section that is one short is the fault this document has actually had.
    //
    // ⚠ A STORED SECTION RUNS UP TO THE NEXT ONE, so it ends with a blank line.
    // That is the contract the prose sections already keep, and it is what puts
    // a blank line between the end of §6 and the heading that follows. The
    // generated block is normalised to the same shape rather than the renderer
    // being changed, because §6 is also downloaded on its own — and there a
    // trailing blank line would be a stray one.
    return renderSection6(entries, provenance).replace(/\n+$/, '\n\n');
  });

  return out.join('');
}

/**
 * The sections a person may edit, in the order they appear, with the generated
 * one marked so an editor can show it as a slot rather than a blank box.
 *
 * @param {{key: string, position: number, generated: boolean, markdown: string}[]} prose
 * @returns {{key: string, position: number, generated: boolean, title: string, lines: number}[]}
 */
export function proseOutline(prose) {
  return [...prose]
    .sort((a, b) => a.position - b.position)
    .map(s => ({
      key: s.key,
      position: s.position,
      generated: s.generated,
      title: sectionTitle(s),
      lines: s.generated ? 0 : s.markdown.split('\n').length,
    }));
}

/**
 * A section's own first heading, so the editor lists what the document calls
 * it rather than what the database calls it.
 *
 * ⚠ Derived, never stored. A stored title is a second copy of a fact that
 * already exists in the markdown, and it goes stale the moment somebody edits
 * the heading — which is the failure this project has recorded most often.
 *
 * @param {{key: string, generated: boolean, markdown: string}} s
 * @returns {string}
 */
export function sectionTitle(s) {
  if (s.generated) return '6. The register';
  const m = s.markdown.match(/^#{1,3} (.+)$/m);
  return m ? m[1].trim() : s.key;
}
