// src/lib/apps/dossier/utils/packArchive.test.js
// The offline archive — markdown, CSV and the entry layout.

import { describe, it, expect } from 'vitest';
import {
  blocksToMarkdown, csvField, recordsToCsv, safeName, uniqueName, buildArchiveText,
} from './packArchive.js';

const doc = (...content) => ({ type: 'doc', content });
const para = (...texts) => ({
  type: 'paragraph',
  content: texts.map(t => (typeof t === 'string' ? { type: 'text', text: t } : t)),
});

describe('blocksToMarkdown', () => {
  it('renders headings, prose and lists', () => {
    const md = blocksToMarkdown(doc(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Background' }] },
      para('The dispute began in January.'),
      { type: 'bulletList', content: [
        { type: 'listItem', content: [para('First point')] },
        { type: 'listItem', content: [para('Second point')] },
      ] },
    ));

    expect(md).toContain('## Background');
    expect(md).toContain('The dispute began in January.');
    expect(md).toContain('- First point');
  });

  it('numbers an ordered list', () => {
    const md = blocksToMarkdown(doc({ type: 'orderedList', content: [
      { type: 'listItem', content: [para('one')] },
      { type: 'listItem', content: [para('two')] },
    ] }));
    expect(md).toContain('1. one');
    expect(md).toContain('2. two');
  });

  it('carries marks through', () => {
    const md = blocksToMarkdown(doc(para(
      { type: 'text', text: 'served', marks: [{ type: 'bold' }] },
      ' on ',
      { type: 'text', text: 'the site', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] },
    )));

    expect(md).toContain('**served**');
    expect(md).toContain('[the site](https://x.test)');
  });

  it('names a callout-s kind, which the colour carried on screen', () => {
    const md = blocksToMarkdown(doc({
      type: 'callout', attrs: { kind: 'warning' }, content: [para('Deadline is Friday')],
    }));

    expect(md).toContain('**WARNING**');
    expect(md).toContain('> Deadline is Friday');
  });

  it('includes the body of a COLLAPSED toggle', () => {
    // An archive that dropped a folded section would quietly lose evidence —
    // the same rule the print stylesheet follows.
    const md = blocksToMarkdown(doc({
      type: 'toggle', attrs: { open: false }, content: [
        { type: 'toggleSummary', content: [{ type: 'text', text: 'The detail' }] },
        { type: 'toggleBody', content: [para('what was actually agreed')] },
      ],
    }));

    expect(md).toContain('**The detail**');
    expect(md).toContain('what was actually agreed');
  });

  it('points a file reference at its copy in the archive', () => {
    const md = blocksToMarkdown(
      doc({ type: 'asset', attrs: { document_id: 'f1', filename: 'notice.pdf' } }),
      { files: new Map([['f1', 'notice.pdf']]) });

    expect(md).toContain('`files/notice.pdf`');
  });

  it('says plainly when a referenced file is NOT in the archive', () => {
    // Better than a link that goes nowhere, which is what a reader would
    // otherwise find months later with no way to tell what happened.
    const md = blocksToMarkdown(
      doc({ type: 'asset', attrs: { document_id: 'f9', filename: 'missing.pdf' } }));

    expect(md).toContain('not included in this archive');
  });

  it('points a table embed at its CSV', () => {
    const md = blocksToMarkdown(
      doc({ type: 'embedDataset', attrs: { dataset_id: 's1' } }),
      { datasets: new Map([['s1', { title: 'Chronology', file: 'Chronology.csv' }]]) });

    expect(md).toContain('`tables/Chronology.csv`');
  });

  it('keeps a blank line the author put there', () => {
    // This test previously asserted the opposite — that no run of three
    // newlines survived — which is exactly the bug: the author's spacing
    // vanished from every page in the zip.
    expect(blocksToMarkdown(doc(para('one'), para(), para('two'))))
      .toBe('one\n\n\ntwo');
  });

  it('still collapses the gap a nested list leaves behind it', () => {
    // The incidental blanks are what the tidy-up is for; telling the two apart
    // is why a deliberate one is carried as a token rather than as a newline.
    const nested = doc(
      { type: 'bulletList', content: [
        { type: 'listItem', content: [
          para('top'),
          { type: 'bulletList', content: [
            { type: 'listItem', content: [para('under')] },
          ] },
        ] },
      ] },
      para('after'));

    expect(blocksToMarkdown(nested)).toBe('- top\n  - under\n\nafter');
  });

  it('survives an absent or unknown block', () => {
    expect(blocksToMarkdown(null)).toBe('');
    expect(blocksToMarkdown(doc({ type: 'somethingNew', content: [para('still here')] })))
      .toContain('still here');
  });
});

describe('csvField', () => {
  it('quotes what needs quoting and doubles inner quotes', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "no"')).toBe('"say ""no"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses a formula, which quoting alone does not', () => {
    // CSV injection. This file is built to be handed to an outsider who will
    // open it in Excel, where =cmd|... is executed.
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-2')).toBe("'-2");
  });

  it('renders absent as empty, not as the word null', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
});

describe('recordsToCsv', () => {
  const dataset = { id: 's1', key: 'chronology', title: 'Chronology' };

  it('writes the template-s columns as the header row', () => {
    const csv = recordsToCsv(dataset, []);
    expect(csv.split('\r\n')[0]).toContain('Date');
    expect(csv.split('\r\n')[0]).toContain('Event');
  });

  it('keeps the author-s order', () => {
    const csv = recordsToCsv(dataset, [
      { position: 1, fields: { event: 'second' } },
      { position: 0, fields: { event: 'first' } },
    ]);
    expect(csv.indexOf('first')).toBeLessThan(csv.indexOf('second'));
  });

  it('is empty for a table type it does not know', () => {
    expect(recordsToCsv({ key: 'nope' }, [])).toBe('');
  });
});

describe('safeName / uniqueName', () => {
  it('strips what a filesystem or a zip would choke on', () => {
    expect(safeName('a/b:c*d?.pdf')).toBe('a-b-c-d-.pdf');
  });

  it('cannot escape the folder it is written into', () => {
    // A shelf filename is author-supplied and lands inside a zip. A traversal
    // here would write outside files/ when the recipient extracts it.
    const name = safeName('../../etc/passwd');
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    expect(name.startsWith('.')).toBe(false);
  });

  it('never returns an empty name', () => {
    expect(safeName('')).toBe('file');
    expect(safeName('...')).toBe('file');
  });

  it('disambiguates a repeated name, since a zip loses a duplicate', () => {
    const taken = new Set();
    expect(uniqueName('notice.pdf', taken)).toBe('notice.pdf');
    expect(uniqueName('notice.pdf', taken)).toBe('notice (2).pdf');
    expect(uniqueName('NOTICE.pdf', taken)).toBe('NOTICE (3).pdf');
  });
});

describe('buildArchiveText', () => {
  const content = {
    generated_at: '2026-08-14T10:00:00Z',
    pack: { title: 'Flat 4 dispute', description: 'internal note' },
    docs: [
      { id: 'd1', slug: 'overview', title: 'Overview', blocks: doc(para('Hello')) },
      { id: 'd2', slug: 'detail',   title: 'Detail',   blocks: doc(para('More')) },
    ],
    datasets: [{ id: 's1', key: 'chronology', title: 'Chronology' }],
    records: [{ id: 'r1', dataset_id: 's1', position: 0, fields: { event: 'Letter sent' } }],
  };

  const build = () => buildArchiveText({
    content,
    fileNames: new Map([['f1', 'notice.pdf']]),
    notice: 'Strictly confidential.',
    omitted: ['1 file was too large to include'],
  });

  it('lays the archive out as readme, pages and tables', () => {
    const names = build().map(e => e.name);
    expect(names[0]).toBe('README.txt');
    expect(names).toContain('pages/1-overview.md');
    expect(names).toContain('tables/Chronology.csv');
  });

  it('numbers pages so a filesystem keeps the pack-s order', () => {
    const names = build().map(e => e.name).filter(n => n.startsWith('pages/'));
    expect(names).toEqual(['pages/1-overview.md', 'pages/2-detail.md']);
  });

  it('carries the confidentiality notice into the readme', () => {
    // The notice must travel with the material. An archive is precisely the
    // copy most likely to outlive the link and be passed on.
    expect(build()[0].text).toContain('Strictly confidential.');
  });

  it('states what was left out rather than leaving a silent gap', () => {
    expect(build()[0].text).toContain('1 file was too large to include');
  });

  it('does not put the author-s pack description in the readme', () => {
    // Same call as the printed cover: it is a note to the author about the
    // pack, not something the recipient was written for.
    expect(build()[0].text).not.toContain('internal note');
  });

  it('omits the Prepared line for a pack that was never published', () => {
    // An archive of a live pack has no such moment, and a bare "Prepared" with
    // nothing after it reads as a bug.
    const live = buildArchiveText({
      content: { pack: { title: 'Live' }, docs: [] },
    });
    expect(live[0].text).not.toContain('Prepared');
    expect(live[0].text).toContain('Archived ');
  });

  it('handles a pack with no tables and no files', () => {
    const bare = buildArchiveText({
      content: { pack: { title: 'Bare' }, docs: [{ id: 'd', slug: 'p', title: 'P', blocks: null }] },
    });
    expect(bare.map(e => e.name)).toEqual(['README.txt', 'pages/1-p.md']);
    expect(bare[0].text).not.toContain('tables/');
  });
});
