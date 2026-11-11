// src/lib/apps/dossier/utils/packScript.js
// A small text language for building a pack "offline": parse a script into the
// plan (packPlan.js) that packBuild.js applies. Pure — no database, no DOM.
//
// One command per line; keywords are not case-sensitive; `#` or `//` starts a
// comment line. Words with spaces go in "quotes" (\" and \n work inside). A
// value of several lines is written  <<<  …lines…  >>>  at the end of a command.
//
//   PACK "Flat 14 — water ingress" DESC "Briefing for the surveyor"
//   FOLDER Evidence/Photos
//   FILE "leak.jpg" IN Evidence/Photos DESC "Taken 3 June"      FILE "x.pdf" AS report
//   PAGE Background                      the page the following block lines go on
//   PAGE Background/Timeline             Parent/Child — parents are made if missing
//   HEADING 2 "What happened"            levels 1, 2, 3
//   TEXT "One paragraph, in **markdown**."
//   TEXT <<<
//   Several paragraphs, lists and tables, as markdown.
//   >>>
//   TEXT FROM "notes.md"                 words read from a file you supply
//   HTML <<<  <p>already-written rich text</p>  >>>
//   IMAGE "leak.jpg" MEDIUM              small | medium | large | full
//   ATTACH report                        a file card (PDF, sheet…)
//   CALLOUT warning "Do not publish."    info | warning | success
//   TOGGLE "Detail" <<<  …  >>>  CLOSED
//   EMBED PAGE Background/Timeline FULL  full | summary | link_card
//   TABLE chronology "Chronology"        chronology | correspondence | document_index
//   ROW date=2026-06-03 event="Leak found" FILE report PAGE Background
//   EMBED TABLE "Chronology"
//
// Anything a line names that is not defined (an image, an attachment, a row's
// file) is added as a file the caller must supply. Errors carry line numbers.

import { emptyPlan, splitPath, pathKey, findFile, findTable } from './packPlan.js';
import { CALLOUT_VARIANTS } from './calloutNode.js';
import { EMBED_MODES } from './embedGuard.js';
import { IMAGE_WIDTHS } from './assetPreview.js';
import { TEMPLATE_KEYS } from './datasetTemplates.js';

/**
 * Split a line into tokens. A token is {kind:'word'|'str'|'kv', value, key?}.
 * @returns {{ tokens: any[], error?: string }}
 */
export function tokenise(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;

  const readQuoted = () => {          // at the opening quote
    let out = '';
    i++;
    while (i < n && line[i] !== '"') {
      if (line[i] === '\\' && i + 1 < n) {
        const c = line[i + 1];
        out += c === 'n' ? '\n' : c;
        i += 2;
      } else out += line[i++];
    }
    if (i >= n) return null;
    i++;                               // closing quote
    return out;
  };

  while (i < n) {
    if (/\s/.test(line[i])) { i++; continue; }
    if (line[i] === '"') {
      const v = readQuoted();
      if (v === null) return { tokens, error: 'A quoted value is missing its closing quote.' };
      tokens.push({ kind: 'str', value: v });
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(line[j]) && line[j] !== '"') j++;
    const word = line.slice(i, j);
    // key=value  or  key="value with spaces"
    const eq = word.indexOf('=');
    if (eq > 0 && /^[A-Za-z_][\w-]*$/.test(word.slice(0, eq))) {
      const key = word.slice(0, eq);
      if (eq === word.length - 1 && line[j] === '"') {
        i = j;
        const v = readQuoted();
        if (v === null) return { tokens, error: 'A quoted value is missing its closing quote.' };
        tokens.push({ kind: 'kv', key, value: v });
        continue;
      }
      tokens.push({ kind: 'kv', key, value: word.slice(eq + 1) });
      i = j;
      continue;
    }
    tokens.push({ kind: 'word', value: word });
    i = j;
  }
  return { tokens };
}

const upper = (t) => (t?.kind === 'word' ? t.value.toUpperCase() : null);
const text = (t) => (t && (t.kind === 'str' || t.kind === 'word') ? t.value : null);

/**
 * Parse a script.
 * @param {string} source
 * @returns {{ plan: any, errors: { line: number, message: string }[] }}
 */
export function parsePackScript(source) {
  const plan = emptyPlan('');
  const errors = [];
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');

  let page = null;        // current page object
  let table = null;       // current table object

  const err = (line, message) => errors.push({ line, message });

  /** Define a file named by an IMAGE / ATTACH / ROW line if it was not declared. */
  const fileFor = (ref) => {
    const found = findFile(plan, ref);
    if (found) return found.ref;
    plan.files.push({ name: ref, ref, folder: [], description: null, source: { kind: 'upload' } });
    return ref;
  };

  for (let ln = 0; ln < lines.length; ln++) {
    const lineNo = ln + 1;
    const raw = lines[ln];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    const { tokens, error } = tokenise(trimmed);
    if (error) { err(lineNo, error); continue; }
    if (!tokens.length) continue;

    // A multi-line value: the line ends with <<< and runs to a line of >>>.
    if (tokens[tokens.length - 1].kind === 'word' && tokens[tokens.length - 1].value === '<<<') {
      tokens.pop();
      const body = [];
      let closed = false;
      while (++ln < lines.length) {
        if (lines[ln].trim() === '>>>') { closed = true; break; }
        body.push(lines[ln]);
      }
      if (!closed) { err(lineNo, 'A <<< value is never closed with >>>.'); break; }
      // Trailing options after the closer are not supported; options go before <<< or are the defaults.
      const closerTail = lines[ln].trim().slice(3).trim();
      tokens.push({ kind: 'str', value: body.join('\n') });
      if (closerTail) {
        const t = tokenise(closerTail);
        if (t.error) { err(lineNo, t.error); continue; }
        tokens.push(...t.tokens);
      }
    }

    const cmd = upper(tokens[0]);
    const args = tokens.slice(1);
    const needPage = () => {
      if (page) return true;
      err(lineNo, `${cmd} needs a page: put a PAGE line first.`);
      return false;
    };

    switch (cmd) {
      case 'PACK': {
        const title = text(args[0]);
        if (!title) { err(lineNo, 'PACK needs a title, e.g. PACK "Flat 14".'); break; }
        if (plan.title) { err(lineNo, 'There is more than one PACK line.'); break; }
        plan.title = title;
        const d = args.findIndex(a => upper(a) === 'DESC');
        if (d >= 0 && text(args[d + 1])) plan.description = text(args[d + 1]);
        break;
      }

      case 'FOLDER': {
        const p = splitPath(text(args[0]));
        if (!p.length) { err(lineNo, 'FOLDER needs a path, e.g. FOLDER Evidence/Photos.'); break; }
        plan.folders.push(p);
        break;
      }

      case 'FILE': {
        const name = text(args[0]);
        if (!name) { err(lineNo, 'FILE needs the file name, e.g. FILE "leak.jpg".'); break; }
        let alias = null; let folder = []; let description = null;
        for (let k = 1; k < args.length; k++) {
          const w = upper(args[k]);
          const v = text(args[k + 1]);
          if (w === 'AS' && v) { alias = v; k++; }
          else if (w === 'IN' && v) { folder = splitPath(v); k++; }
          else if (w === 'DESC' && v) { description = v; k++; }
          else err(lineNo, `FILE: did not understand "${text(args[k]) ?? args[k]?.key}".`);
        }
        if (findFile(plan, alias ?? name)) { err(lineNo, `The file "${alias ?? name}" is already declared.`); break; }
        plan.files.push({ name, ref: alias ?? name, folder, description, source: { kind: 'upload' } });
        break;
      }

      case 'PAGE': {
        const p = splitPath(text(args[0]));
        if (!p.length) { err(lineNo, 'PAGE needs a title or path, e.g. PAGE Background/Timeline.'); break; }
        const existing = plan.pages.find(x => pathKey(x.path) === pathKey(p));
        if (existing) { page = existing; break; }     // go back to a page already begun
        page = { path: p, blocks: [] };
        plan.pages.push(page);
        break;
      }

      case 'HEADING': {
        if (!needPage()) break;
        const level = Number(text(args[0]));
        const t = text(args[1]);
        if (![1, 2, 3].includes(level) || !t) { err(lineNo, 'HEADING needs a level (1, 2 or 3) and text, e.g. HEADING 2 "Background".'); break; }
        page.blocks.push({ type: 'heading', level, text: t });
        break;
      }

      case 'TEXT': {
        if (!needPage()) break;
        if (upper(args[0]) === 'FROM') {
          const f = text(args[1]);
          if (!f) { err(lineNo, 'TEXT FROM needs a file name, e.g. TEXT FROM "notes.md".'); break; }
          page.blocks.push({ type: 'text', from: f, markdown: null });
          break;
        }
        const t = text(args[0]);
        if (t == null) { err(lineNo, 'TEXT needs the words in quotes, or <<< … >>>, or FROM "file".'); break; }
        page.blocks.push({ type: 'text', markdown: t });
        break;
      }

      case 'HTML': {
        if (!needPage()) break;
        const h = text(args[0]);
        if (h == null) { err(lineNo, 'HTML needs the markup in quotes or <<< … >>>.'); break; }
        page.blocks.push({ type: 'html', html: h });
        break;
      }

      case 'IMAGE': case 'ATTACH': {
        if (!needPage()) break;
        const ref = text(args[0]);
        if (!ref) { err(lineNo, `${cmd} needs a file, e.g. ${cmd} "leak.jpg".`); break; }
        const file = fileFor(ref);
        if (cmd === 'ATTACH') { page.blocks.push({ type: 'attachment', file }); break; }
        const w = args[1] ? text(args[1]).toLowerCase() : null;
        if (w && !IMAGE_WIDTHS.includes(w)) { err(lineNo, `IMAGE size must be one of ${IMAGE_WIDTHS.join(', ')}.`); break; }
        page.blocks.push({ type: 'image', file, ...(w ? { width: w } : {}) });
        break;
      }

      case 'CALLOUT': {
        if (!needPage()) break;
        const variant = text(args[0])?.toLowerCase();
        const t = text(args[1]);
        if (!CALLOUT_VARIANTS.some(v => v.value === variant) || t == null) {
          err(lineNo, `CALLOUT needs a kind (${CALLOUT_VARIANTS.map(v => v.value).join(', ')}) and text, e.g. CALLOUT warning "Note".`);
          break;
        }
        page.blocks.push({ type: 'callout', variant, markdown: t });
        break;
      }

      case 'TOGGLE': {
        if (!needPage()) break;
        const summary = text(args[0]);
        const body = text(args[1]);
        if (!summary || body == null) { err(lineNo, 'TOGGLE needs a heading and a body, e.g. TOGGLE "Detail" "More words".'); break; }
        const closed = args.slice(2).some(a => upper(a) === 'CLOSED');
        page.blocks.push({ type: 'toggle', summary, markdown: body, open: !closed });
        break;
      }

      case 'EMBED': {
        if (!needPage()) break;
        const what = upper(args[0]);
        if (what === 'PAGE') {
          const p = splitPath(text(args[1]));
          const mode = args[2] ? text(args[2]).toLowerCase() : null;
          if (!p.length) { err(lineNo, 'EMBED PAGE needs a page path.'); break; }
          if (mode && !EMBED_MODES.includes(mode)) { err(lineNo, `EMBED PAGE mode must be one of ${EMBED_MODES.join(', ')}.`); break; }
          page.blocks.push({ type: 'embedPage', path: p, ...(mode ? { mode } : {}) });
        } else if (what === 'TABLE') {
          const title = text(args[1]);
          if (!title) { err(lineNo, 'EMBED TABLE needs the table title.'); break; }
          page.blocks.push({ type: 'embedTable', title });
        } else err(lineNo, 'EMBED is followed by PAGE or TABLE.');
        break;
      }

      case 'TABLE': {
        const template = text(args[0])?.toLowerCase();
        const title = text(args[1]) ?? null;
        if (!TEMPLATE_KEYS.includes(template)) { err(lineNo, `TABLE needs a kind (${TEMPLATE_KEYS.join(', ')}), e.g. TABLE chronology "Chronology".`); break; }
        const label = title ?? template[0].toUpperCase() + template.slice(1).replace('_', ' ');
        if (findTable(plan, label)) { err(lineNo, `There is already a table called "${label}".`); break; }
        table = { template, title: label, rows: [] };
        plan.tables.push(table);
        break;
      }

      case 'ROW': {
        if (!table) { err(lineNo, 'ROW needs a table: put a TABLE line first.'); break; }
        const row = { fields: {} };
        for (let k = 0; k < args.length; k++) {
          const a = args[k];
          if (a.kind === 'kv') row.fields[a.key.toLowerCase()] = a.value;
          else if (upper(a) === 'FILE' && text(args[k + 1])) { row.file = fileFor(text(args[k + 1])); k++; }
          else if (upper(a) === 'PAGE' && text(args[k + 1])) { row.page = splitPath(text(args[k + 1])); k++; }
          else err(lineNo, `ROW: did not understand "${text(a)}" — write column=value, FILE name or PAGE path.`);
        }
        table.rows.push(row);
        break;
      }

      default:
        err(lineNo, `Unknown command "${text(tokens[0])}". Commands: PACK, FOLDER, FILE, PAGE, HEADING, TEXT, HTML, IMAGE, ATTACH, CALLOUT, TOGGLE, EMBED, TABLE, ROW.`);
    }
  }

  if (!plan.title) errors.push({ line: 1, message: 'The script needs a PACK "title" line.' });
  return { plan, errors };
}
