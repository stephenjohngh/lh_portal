// src/lib/apps/dossier/utils/packArchive.js
// Turning a pack into an offline archive — pure, Type-1 testable, server-safe.
//
// The ZIP is "an additional offline archive": a copy the recipient can keep
// that does not depend on the link still working, on us still hosting it, or on
// a browser at all. That shapes every choice here.
//
// ── Why markdown rather than the rendered HTML ───────────────────────────────
// The obvious move is to put the pack's own HTML in the zip. It cannot be done
// on the server: renderBlocksToHtml() goes through Tiptap's generateHTML, which
// needs a DOM. Shipping jsdom into a serverless function to render a download
// is a poor trade, and hand-writing a second HTML renderer would break the one
// rule the merge doc called non-negotiable — ONE renderer, or the author and
// the reader drift apart (D10).
//
// Markdown side-steps both: a plain walk over the same ProseMirror JSON, no
// second renderer to keep in step because it makes no layout claims. It is also
// the export the spec asked for anyway (D9, "keep markdown export"), and it
// survives being opened in thirty years by something that is not a browser —
// which is what an archive is for.
//
// Tables ship as CSV as well, because a chronology is data and a solicitor will
// want it in a spreadsheet.

import { templateFor, columnFields, rowFields } from './datasetTemplates.js';

/** Node types whose content is inline text. */
const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock']);

/**
 * Stands in for a blank line the AUTHOR put there, as opposed to the blank line
 * that merely separates two blocks.
 *
 * The two are indistinguishable once everything is newlines, and the tidy-up
 * pass that stops a nested list leaving a double gap was therefore also eating
 * the author's spacing. Carrying the deliberate ones as a token keeps them out
 * of that collapse; they become real blank lines at the very end.
 */
const HARD_BLANK = '\u0002';

/** Inline text of a node, with marks rendered as markdown. */
function inlineText(node) {
  if (!node) return '';
  if (typeof node.text === 'string') {
    let text = node.text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'bold':   text = `**${text}**`; break;
        case 'italic': text = `*${text}*`;   break;
        case 'strike': text = `~~${text}~~`; break;
        case 'code':   text = `\`${text}\``; break;
        case 'link':   text = `[${text}](${mark.attrs?.href ?? ''})`; break;
        // A cross-link points inside the pack. Named by its slug, which is the
        // filename of the page it refers to in this archive.
        case 'docLink':
          text = `[${text}](./${mark.attrs?.target_slug ?? 'page'}.md)`;
          break;
        default: break;
      }
    }
    return text;
  }
  return (node.content ?? []).map(inlineText).join('');
}

/**
 * One page as markdown.
 *
 * References are named rather than followed: a file becomes a line pointing at
 * its copy in `files/`, a table becomes a line pointing at its CSV. An archive
 * whose links go nowhere would be worse than one that says plainly where the
 * thing is.
 *
 * @param {object|null} blocks
 * @param {{ files?: Map<string,string>, datasets?: Map<string,{title:string,file:string}> }} [refs]
 */
export function blocksToMarkdown(blocks, refs = {}) {
  const fileNames = refs.files    ?? new Map();
  const datasets  = refs.datasets ?? new Map();
  const lines = [];

  const walk = (node, depth = 0, ordinal = null) => {
    if (!node || typeof node !== 'object') return;
    const indent = '  '.repeat(depth);

    switch (node.type) {
      case 'doc':
        (node.content ?? []).forEach(child => walk(child, depth));
        return;

      case 'heading':
        lines.push(`${'#'.repeat(Math.min(6, node.attrs?.level ?? 1))} ${inlineText(node)}`, '');
        return;

      case 'paragraph': {
        const text = inlineText(node);
        // An empty paragraph is a deliberate blank line in the author's layout,
        // and must survive the tidy-up below that ordinary blanks do not.
        lines.push(text ? `${indent}${text}` : HARD_BLANK, text ? '' : null);
        return;
      }

      case 'blockquote':
        for (const child of node.content ?? []) {
          const text = inlineText(child);
          if (text) lines.push(`> ${text}`);
        }
        lines.push('');
        return;

      case 'codeBlock':
        lines.push('```', inlineText(node), '```', '');
        return;

      case 'horizontalRule':
        lines.push('---', '');
        return;

      case 'bulletList':
      case 'orderedList': {
        (node.content ?? []).forEach((item, i) => {
          const marker = node.type === 'orderedList' ? `${i + 1}.` : '-';
          // Only the item's OWN content. A nested list is walked separately
          // below, and including it here wrote its text twice — once flattened
          // into the parent bullet, once as the sub-list.
          const own = (item.content ?? [])
            .filter(child => child.type !== 'bulletList' && child.type !== 'orderedList');
          const text = own.map(inlineText).join(' ').trim();
          if (text) lines.push(`${indent}${marker} ${text}`);
          // A nested list lives inside the item alongside its paragraph.
          for (const child of item.content ?? []) {
            if (child.type === 'bulletList' || child.type === 'orderedList') {
              walk(child, depth + 1);
            }
          }
        });
        lines.push('');
        return;
      }

      case 'callout':
        // The kind carries the meaning on screen; in markdown it has to be said.
        lines.push(`> **${String(node.attrs?.kind ?? 'note').toUpperCase()}**`);
        for (const child of node.content ?? []) {
          const text = inlineText(child);
          if (text) lines.push(`> ${text}`);
        }
        lines.push('');
        return;

      case 'toggle': {
        // Collapsed on screen is still IN the pack. An archive that dropped a
        // folded section would quietly lose evidence — the same rule the print
        // stylesheet follows.
        const summary = node.content?.find(c => c.type === 'toggleSummary');
        const body    = node.content?.find(c => c.type === 'toggleBody');
        if (summary) lines.push(`**${inlineText(summary)}**`, '');
        for (const child of body?.content ?? []) walk(child, depth);
        return;
      }

      case 'asset': {
        const id   = node.attrs?.document_id;
        const name = (id && fileNames.get(id)) || node.attrs?.filename || 'a file';
        lines.push(id && fileNames.has(id)
          ? `📎 **${name}** — \`files/${name}\``
          : `📎 **${name}** — not included in this archive`, '');
        return;
      }

      case 'embedDataset': {
        const entry = datasets.get(node.attrs?.dataset_id);
        lines.push(entry
          ? `▤ **${entry.title}** — \`tables/${entry.file}\``
          : `▤ ${node.attrs?.dataset_title ?? 'A table'} — not included in this archive`, '');
        return;
      }

      case 'embedDoc':
        lines.push(`↳ See **${node.attrs?.target_title ?? 'another page'}**`
          + (node.attrs?.target_slug ? ` (\`pages/${node.attrs.target_slug}.md\`)` : ''), '');
        return;

      default:
        if (TEXT_BLOCKS.has(node.type)) {
          const text = inlineText(node);
          if (text) lines.push(text, '');
          return;
        }
        (node.content ?? []).forEach(child => walk(child, depth, ordinal));
    }
  };

  walk(blocks);

  return lines
    .filter(line => line !== null)
    .join('\n')
    // Runs of incidental blanks collapse — a nested list would otherwise
    // leave a double gap behind it. The author's own blank lines are tokens at
    // this point, so they pass through untouched and become real afterwards.
    .replace(/\n{3,}/g, '\n\n')
    .split(HARD_BLANK).join('')
    .trim();
}

/**
 * One CSV field.
 *
 * ⚠ The leading apostrophe is not decoration. A value starting `=`, `+`, `-` or
 * `@` is executed as a formula when the file is opened in Excel or Sheets —
 * CSV injection — and this file is built to be handed to an outsider who will
 * almost certainly open it in exactly that. Quoting alone does not prevent it.
 */
export function csvField(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A dataset as CSV — every field of the template, in template order.
 *
 * @param {object} dataset
 * @param {object[]} records
 */
export function recordsToCsv(dataset, records = []) {
  const fields = [...columnFields(dataset?.key), ...rowFields(dataset?.key)];
  if (!fields.length) return '';

  const rows = [fields.map(f => csvField(f.label)).join(',')];

  const ordered = [...records].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  for (const record of ordered) {
    rows.push(fields.map(f => csvField(record.fields?.[f.key])).join(','));
  }
  return rows.join('\r\n');        // CRLF, which is what RFC 4180 says
}

/** A filename that is safe on every filesystem and inside a zip. */
export function safeName(name, fallback = 'file') {
  const clean = String(name ?? '')
    .replace(/[\\/:*?"<>|]/g, '-')     // illegal on Windows
    .replace(/[\x00-\x1f]/g, '')
    .replace(/^\.+/, '')               // no ../ and no hidden files
    .trim();
  return clean || fallback;
}

/**
 * Make every entry name unique, because two shelf files may share a name and a
 * zip with a duplicate entry silently loses one on extraction.
 */
export function uniqueName(name, taken) {
  if (!taken.has(name.toLowerCase())) { taken.add(name.toLowerCase()); return name; }

  const dot  = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext  = dot > 0 ? name.slice(dot) : '';

  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) { taken.add(candidate.toLowerCase()); return candidate; }
  }
  return `${stem} (${Date.now()})${ext}`;
}

/**
 * Build every text entry of the archive: the readme, the pages, the tables.
 *
 * File bytes are added by the caller — this module never touches storage.
 *
 * @param {object} input
 * @param {object} input.content   the publication's snapshot
 * @param {Map<string,string>} input.fileNames  document_id → name inside files/
 * @param {string} input.notice    the confidentiality notice, verbatim
 * @param {string[]} [input.omitted] things deliberately not in the archive
 * @returns {{ name: string, text: string }[]}
 */
export function buildArchiveText({ content, fileNames = new Map(), notice = '', omitted = [] }) {
  const entries = [];
  const docs     = content?.docs     ?? [];
  const datasets = content?.datasets ?? [];
  const records  = content?.records  ?? [];

  // Tables first: the pages reference them by filename.
  const takenTables = new Set();
  /** @type {Map<string, { title: string, file: string }>} */
  const datasetRefs = new Map();

  for (const dataset of datasets) {
    if (!templateFor(dataset.key)) continue;
    const file = uniqueName(`${safeName(dataset.title, dataset.key)}.csv`, takenTables);
    datasetRefs.set(dataset.id, { title: dataset.title ?? 'Table', file });
    entries.push({
      name: `tables/${file}`,
      text: recordsToCsv(dataset, records.filter(r => r.dataset_id === dataset.id)),
    });
  }

  // Pages, numbered so the archive keeps the pack's order on a filesystem that
  // sorts alphabetically.
  const takenPages = new Set();
  const width = String(docs.length).length;

  docs.forEach((doc, i) => {
    const base = `${String(i + 1).padStart(width, '0')}-${safeName(doc.slug || doc.title, 'page')}`;
    const file = uniqueName(`${base}.md`, takenPages);
    entries.push({
      name: `pages/${file}`,
      text: `# ${doc.title ?? 'Untitled page'}\n\n`
        + blocksToMarkdown(doc.blocks, { files: fileNames, datasets: datasetRefs }),
    });
  });

  entries.unshift({
    name: 'README.txt',
    text: readmeText({ content, entries, fileNames, notice, omitted }),
  });

  return entries;
}

/** What this archive is, what is in it, and the terms it came with. */
function readmeText({ content, entries, fileNames, notice, omitted }) {
  const lines = [
    content?.pack?.title ?? 'Pack',
    '='.repeat((content?.pack?.title ?? 'Pack').length),
    '',
  ];

  // Only a publication was "prepared" on a date. An archive of a live pack has
  // no such moment, and a bare "Prepared" with nothing after it reads as a bug.
  if (content?.generated_at) lines.push(`Prepared ${content.generated_at}`);
  lines.push(`Archived ${new Date().toISOString()}`, '');

  if (notice) lines.push(notice, '');

  lines.push('CONTENTS', '--------', '');
  lines.push('pages/   the pack\'s pages, as markdown, in the order they appear');
  if (entries.some(e => e.name.startsWith('tables/'))) {
    lines.push('tables/  each table as CSV, in the order the author arranged it');
  }
  if (fileNames.size) lines.push('files/   the documents the pack refers to, as sent');
  lines.push('');

  if (omitted.length) {
    lines.push('NOT INCLUDED', '------------', '');
    for (const line of omitted) lines.push(`- ${line}`);
    lines.push('');
  }

  lines.push(
    'This archive is a copy. It will not change when the pack does, and it',
    'does not stop working when the link expires.',
  );

  return lines.join('\n');
}
