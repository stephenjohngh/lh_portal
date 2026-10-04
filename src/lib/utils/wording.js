// src/lib/utils/wording.js
//
// The portal's own WORDS that an operator will need to change, each an admin
// setting: Admin → Other Config → Wording (2026-10-04, PROJECT_STATUS §6ccc
// item 10, C). User, 2026-10-03: *"things that can change … should have an
// admin parameter"*.
//
// The Policies pattern (policies.js): each entry ships with its DEFAULT, and
// what is stored (portal_settings, key `wording`) is only the entries that
// DIFFER from it — so an untouched one follows the default, including a later
// release's improvement to it.
//
// ⛔ READ WORDING WHEN IT IS USED — never captured at module scope, which loads
// before the setting does. On the server, `#lib/server/wording.js` first.
//
// ── Tokens ────────────────────────────────────────────────────────────────────
// A text may carry {tokens} the code fills in — {building}, a date, a case's
// reference. Each entry names the tokens it understands, and a saved text with
// any OTHER token is refused: a typo like {bulding} would otherwise print as
// itself on a letter sent to a resident.
//
// ── Letters ───────────────────────────────────────────────────────────────────
// A letter's text is written in a small, plain form, so an admin can edit it
// without learning a format:
//   # Title          the letter's title (first such line)
//   ## Heading       a heading
//   **whole line**   a paragraph in bold
//   anything else    a paragraph; paragraphs are separated by a blank line
// The code adds what must not be edited away: the date, the recipient, the
// case reference block under the title, and the signature at the end.
// ⭐ Two rules make optional parts work without a template language: a
// paragraph with a token that has no value is LEFT OUT (so "Lessons learned"
// prints only when there are some), and a heading left with nothing under it
// is left out too.
//
// Pure: imports nothing, so the browser and the server share it.

export const WORDING_KEY = 'wording';

/** @typedef {{ key: string, area: string, label: string, governs: string, tokens: string[], letter?: boolean, default: string }} WordingDef */

/** @type {ReadonlyArray<WordingDef>} */
const DEFS = Object.freeze([
  {
    key: 'morReporterBsr', area: 'MOR letters', letter: true,
    label: 'To the reporter — escalated to the Building Safety Regulator',
    governs: 'Draft letter from an MOR case, written to be edited before sending.',
    tokens: ['building', 'bsr_reference_note'],
    default: `# {building} — Notification of escalation to the Building Safety Regulator

Thank you for raising your safety concern with us. After reviewing what you reported, we have decided to escalate it to the Building Safety Regulator (BSR) under the mandatory occurrence reporting requirements of the Building Safety Act 2022.

## What this means

The BSR will be informed in line with our statutory duty. We are required by law to provide a written report to the regulator within 10 calendar days of the date we identified the occurrence.

{bsr_reference_note}

## What happens next

Investigation and any necessary works will continue while the regulator is informed. We will keep you updated as the case progresses and write to you again when the matter is resolved.

You can also check progress at any time at the address shown on your original confirmation email, using your reference and verification code.

## If you have any questions

Please contact me using the details below. If at any point you believe there is an immediate danger to anyone in the building, call 999.`,
  },
  {
    key: 'morBsrReferenceIssued', area: 'MOR letters',
    label: 'BSR reference — once issued',
    governs: 'Where the escalation letter says {bsr_reference_note} and the case has a BSR notice reference.',
    tokens: ['bsr_reference'],
    default: 'Our BSR notice reference is {bsr_reference}. You can quote this if you need to refer to the case.',
  },
  {
    key: 'morBsrReferencePending', area: 'MOR letters',
    label: 'BSR reference — not yet issued',
    governs: 'Where the escalation letter says {bsr_reference_note} and the case has no BSR notice reference yet.',
    tokens: [],
    default: 'We will share our BSR notice reference with you once it is issued.',
  },
  {
    key: 'morReporterClosure', area: 'MOR letters', letter: true,
    label: 'To the reporter — case closed',
    governs: 'Draft letter from an MOR case. {lessons_learned} is the case’s own lessons learned; with none, that paragraph and its heading are left out.',
    tokens: ['building', 'lessons_learned'],
    default: `# {building} — Outcome of your safety report

Thank you again for raising your safety concern. I am writing to let you know that the case has now been closed.

## What was done

[Briefly describe what was investigated and what works were carried out. Keep it factual and avoid identifying any other reporter.]

## Lessons learned

{lessons_learned}

## If something similar happens again

Please raise it through the same building safety reporting route. We treat every concern seriously and will investigate again. If you believe there is an immediate danger, call 999 first.

## Thank you

Reports from residents and other people in the building are an important part of how we keep {building} safe. Thank you for taking the time to let us know.`,
  },
  {
    key: 'morReporterHolding', area: 'MOR letters', letter: true,
    label: 'To the reporter — update while the case is open',
    governs: 'Draft letter from an MOR case. {status} describes where the case is, in plain words.',
    tokens: ['building', 'received_date', 'status'],
    default: `# {building} — Update on your safety report

I am writing with a brief update on the safety concern you raised on {received_date}.

## Where we are now

Your case is currently {status}.

[Optional: add a sentence or two specific to this case — what was done most recently, what we expect to happen next, and any expected timescale.]

## What you can do

You can check progress at any time on the building safety status page, using your reference and verification code. If you believe the situation has become more serious, please contact me using the details below — and call 999 if you believe there is an immediate danger.

Thank you for your patience while we work through this.`,
  },
  {
    key: 'morResidentsClosure', area: 'MOR letters', letter: true,
    label: 'To all residents — a concern investigated and closed',
    governs: 'Draft notice from an MOR case, with nothing that identifies the reporter. {lessons_learned} as in the closure letter.',
    tokens: ['building', 'lessons_learned'],
    default: `# {building} — Update on a building safety concern

**To all residents and other users of the building**

I am writing to let you know that a building safety concern was raised under our mandatory occurrence reporting system and has now been investigated and closed.

Out of respect for the privacy of the person who raised it, the source of the report is not disclosed.

## What we looked into

[Briefly describe the nature of the concern, avoiding any detail that could identify the reporter.]

## What we did

[Summarise the investigation and any works carried out. Reference relevant specialist advice (fire engineer, structural engineer) where appropriate.]

## Lessons we are taking forward

{lessons_learned}

## Raising your own concerns

If you notice anything that you think could pose a risk to the safety of the building or the people in it, please raise it through the building safety reporting route described in the residents' engagement strategy. You can report at any time and you can do so anonymously if you prefer. If you believe there is an immediate danger, call 999.`,
  },
  {
    key: 'dossierConfidentialityNotice', area: 'Dossier',
    label: 'Confidentiality notice on a published pack',
    governs: 'Shown to the recipient on screen and on the printed cover, and put at the top of a downloaded pack.',
    tokens: [],
    default: 'This document package contains proprietary and confidential information '
      + 'intended strictly for the designated recipient. Please do not copy, '
      + 'forward, or distribute these materials without prior written consent.',
  },
]);

const BY_KEY = new Map(DEFS.map((d) => [d.key, d]));
const MAX_LENGTH = 20000;

let stored = /** @type {Record<string, string>} */ ({});

/** Every wording entry, for the Admin screen. */
export function wordingInfo() { return DEFS; }

/** @param {unknown} v */
const normalise = (v) => String(v ?? '').replace(/\r\n?/g, '\n').trim();

/** The {tokens} a text uses. @param {string} text */
export function tokensIn(text) {
  return [...new Set([...String(text).matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
}

/**
 * Problems with a set of texts, `{ key: message }` — empty when all is well.
 * @param {Record<string, unknown>} values
 */
export function validateWording(values) {
  /** @type {Record<string, string>} */
  const problems = {};
  for (const d of DEFS) {
    if (values?.[d.key] === undefined) continue;
    const text = normalise(values[d.key]);
    if (!text) { problems[d.key] = 'This cannot be empty. Use “Use default” to go back to the shipped wording.'; continue; }
    if (text.length > MAX_LENGTH) { problems[d.key] = `At most ${MAX_LENGTH} characters.`; continue; }
    const unknown = tokensIn(text).filter((t) => !d.tokens.includes(t));
    if (unknown.length) {
      problems[d.key] = `Not understood here: ${unknown.map((t) => `{${t}}`).join(', ')}.`
        + (d.tokens.length ? ` This text can use ${d.tokens.map((t) => `{${t}}`).join(', ')}.` : ' This text takes no {tokens}.');
    }
  }
  return problems;
}

/**
 * What would be stored: known keys, valid, that differ from the default.
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function cleanWording(raw) {
  const v = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
  const problems = validateWording(v);
  /** @type {Record<string, string>} */
  const out = {};
  for (const d of DEFS) {
    if (v[d.key] === undefined || problems[d.key]) continue;
    const text = normalise(v[d.key]);
    if (text !== d.default) out[d.key] = text;
  }
  return out;
}

/** Put an admin's stored wording in force. @param {unknown} raw */
export function setWording(raw) {
  stored = cleanWording(raw);
  return stored;
}

/** The text in force for an entry, tokens unfilled. @param {string} key */
export function wordingText(key) {
  const d = BY_KEY.get(key);
  if (!d) throw new Error(`Unknown wording: ${key}`);
  return stored[key] ?? d.default;
}

/** Every text in force. */
export function activeWording() {
  return Object.fromEntries(DEFS.map((d) => [d.key, wordingText(d.key)]));
}

/**
 * Fill a text's tokens. A token with no value becomes ''.
 * @param {string} text
 * @param {Record<string, string|null|undefined>} vars
 */
export function fillTokens(text, vars = {}) {
  return String(text).replace(/\{([a-z_]+)\}/g, (_, t) => String(vars[t] ?? ''));
}

/** An entry's text in force, tokens filled. @param {string} key @param {Record<string, string|null|undefined>} [vars] */
export function wording(key, vars = {}) {
  return fillTokens(wordingText(key), vars);
}

/**
 * A letter's text as blocks to print, with the two rules applied: a paragraph
 * with an empty token is left out, and so is a heading left with nothing under
 * it.
 * @param {string} text
 * @param {Record<string, string|null|undefined>} vars
 * @returns {{ title: string|null, blocks: { kind: 'heading'|'bold'|'para', text: string }[] }}
 */
export function letterBlocks(text, vars = {}) {
  let title = null;
  /** @type {{ kind: 'heading'|'bold'|'para', text: string }[]} */
  const raw = [];
  for (const chunk of normalise(text).split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A heading line ends its paragraph: what follows on the next line is a paragraph.
      if (/^#\s+/.test(line) && title === null) { title = fillTokens(line.replace(/^#\s+/, ''), vars).trim(); continue; }
      if (/^##\s+/.test(line)) { raw.push({ kind: 'heading', text: fillTokens(line.replace(/^##\s+/, ''), vars).trim() }); continue; }
      const rest = lines.slice(i).join(' ');
      const empty = tokensIn(rest).some((t) => !String(vars[t] ?? '').trim());
      if (!empty) {
        const bold = /^\*\*(.+)\*\*$/.exec(rest);
        raw.push(bold ? { kind: 'bold', text: fillTokens(bold[1], vars) } : { kind: 'para', text: fillTokens(rest, vars) });
      }
      break;
    }
  }
  const blocks = raw.filter((b, i) => b.kind !== 'heading' || (raw[i + 1] && raw[i + 1].kind !== 'heading'));
  return { title, blocks };
}
