// src/lib/utils/statementProseParse.js
//
// Parsing the statement's prose seed into sections. R5.
//
// ⚠ DELIBERATELY IMPORTS NOTHING. Its companion `statementProse.js` pulls the
// markdown in with `?raw`, which is a Vite feature and does not exist in a
// plain `node scripts/…` run — and `npm run check:statement-render` is exactly
// such a run. Keeping the parser free of that import is what lets the gate read
// the markdown file itself and parse it with the same code the app uses. A
// second copy of the parser in the checking script would be a second copy of a
// rule, which is the fault this project keeps finding.

/**
 * @typedef {{
 *   key: string,
 *   position: number,
 *   generated: boolean,
 *   markdown: string
 * }} ProseSection
 */

const MARKER = /^<!-- section: ([a-z0-9_]+) \| position: (\d+)( \| generated)? -->$/gm;

/**
 * Line endings, normalised to LF.
 *
 * ⛔ NOT TIDINESS — it is what keeps the document assemblable. §6 is generated
 * in memory and is always LF, so any prose arriving with CRLF produces a
 * document carrying both, which fails the byte-for-byte gate and puts stray
 * carriage returns into the Word export. Prose reaches us from two places that
 * both produce CRLF given half a chance: a git checkout under
 * `core.autocrlf=true`, which `.gitattributes` now pins; and a browser
 * textarea, where the HTML specification says a submitted value uses CRLF and
 * nothing at all pins that.
 *
 * @param {string} s
 * @returns {string}
 */
export function normaliseMarkdown(s) {
  return String(s ?? '').split('\r\n').join('\n').split('\r').join('\n');
}

/**
 * Split the seed markdown into sections.
 *
 * ⭐ A SECTION IS ITS MARKDOWN, HEADING INCLUDED. Storing a heading apart from
 * its body would mean an editor typing a heading that the assembler then
 * renumbered or restyled, and this is a document whose wording was settled over
 * fourteen rounds of external review. What a person types is what it says.
 *
 * @param {string} source
 * @returns {ProseSection[]} in position order
 */
export function parseProse(rawSource) {
  const source = normaliseMarkdown(rawSource);
  const marks = [...source.matchAll(MARKER)];
  if (marks.length === 0) throw new Error('statement prose: no section markers found');

  const out = marks.map((m, i) => {
    const from = m.index + m[0].length + 1;          // +1 for the newline after the marker
    const to = i + 1 < marks.length ? marks[i + 1].index : source.length;
    const generated = Boolean(m[3]);
    return {
      key: m[1],
      position: Number(m[2]),
      generated,
      // ⚠ A generated section has no body by definition. Reading one would be
      // reading whatever whitespace happened to sit between two markers.
      markdown: generated ? '' : source.slice(from, to),
    };
  });

  if (new Set(out.map(s => s.key)).size !== out.length) {
    throw new Error('statement prose: duplicate section key');
  }
  if (new Set(out.map(s => s.position)).size !== out.length) {
    throw new Error('statement prose: duplicate section position');
  }
  // ⛔ None, and §6 is silently absent from the document whose whole subject it
  // is. More than one, and it is printed twice.
  if (out.filter(s => s.generated).length !== 1) {
    throw new Error('statement prose: expected exactly one generated section — the register');
  }
  return out.sort((a, b) => a.position - b.position);
}
