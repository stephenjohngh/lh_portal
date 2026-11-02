// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
import { parsePackScript, tokenise } from './packScript.js';
import { planProblems, fillTextFiles, textFilesNeeded, describePlan } from './packPlan.js';
import { makeHtmlToNodes, pageBlocksJson } from './planBlocks.js';
import { buildPackFromPlan } from './packBuild.js';

const SCRIPT = `
# a comment
PACK "Flat 14 — water" DESC "For the surveyor"
FOLDER Evidence/Photos
FILE "leak.jpg" IN Evidence/Photos DESC "Taken 3 June"
FILE "report.pdf" AS report
PAGE Background
HEADING 2 "What happened"
TEXT "Water came through **the ceiling**."
TEXT <<<
Second paragraph.

- one
- two
>>>
TEXT FROM "notes.md"
IMAGE "leak.jpg" MEDIUM
ATTACH report
CALLOUT warning "Do not publish."
TOGGLE "Detail" "More words" CLOSED
PAGE Background/Timeline
TEXT "Dates."
PAGE Summary
EMBED PAGE Background/Timeline summary
EMBED TABLE "Chronology"
TABLE chronology "Chronology"
ROW date=2026-06-03 event="Leak found" significance="Start" FILE report PAGE Background
`;

describe('tokenise', () => {
  it('reads words, quoted strings with escapes and key=value', () => {
    const { tokens } = tokenise('ROW a=1 b="x y" "q\\"z" word');
    expect(tokens.map(t => [t.kind, t.key, t.value])).toEqual([
      ['word', undefined, 'ROW'], ['kv', 'a', '1'], ['kv', 'b', 'x y'], ['str', undefined, 'q"z'], ['word', undefined, 'word']]);
  });
  it('reports a missing closing quote', () => {
    expect(tokenise('TEXT "abc').error).toMatch(/closing quote/);
  });
});

describe('parsePackScript', () => {
  const { plan, errors } = parsePackScript(SCRIPT);

  it('parses every command with no errors and a valid plan', () => {
    expect(errors).toEqual([]);
    expect(planProblems(plan).filter(p => !/notes\.md/.test(p))).toEqual([]);
    expect(plan.title).toBe('Flat 14 — water');
    expect(plan.folders).toEqual([['Evidence', 'Photos']]);
    expect(plan.files.map(f => [f.name, f.ref])).toEqual([['leak.jpg', 'leak.jpg'], ['report.pdf', 'report']]);
    expect(plan.pages.map(p => p.path.join('/'))).toEqual(['Background', 'Background/Timeline', 'Summary']);
    expect(plan.pages[0].blocks.map(b => b.type)).toEqual(['heading', 'text', 'text', 'text', 'image', 'attachment', 'callout', 'toggle']);
    expect(plan.pages[0].blocks[2].markdown).toBe('Second paragraph.\n\n- one\n- two');
    expect(plan.pages[0].blocks[7].open).toBe(false);
    expect(plan.tables[0].rows[0]).toMatchObject({ fields: { date: '2026-06-03', event: 'Leak found' }, file: 'report', page: ['Background'] });
  });

  it('asks for the text file and takes it once supplied', () => {
    expect(textFilesNeeded(plan)).toEqual(['notes.md']);
    expect(planProblems(plan).join(' ')).toMatch(/notes\.md/);
    const filled = fillTextFiles(plan, { 'Notes.MD': 'From a file.' });
    expect(planProblems(filled)).toEqual([]);
    expect(describePlan(filled)).toMatchObject({ pages: 3, tables: 1, rows: 1 });
  });

  it('adds an undeclared image as a file to supply', () => {
    const r = parsePackScript('PACK "x"\nPAGE A\nIMAGE "new.png"');
    expect(r.plan.files).toEqual([expect.objectContaining({ name: 'new.png', source: { kind: 'upload' } })]);
  });

  it('gives errors with line numbers', () => {
    const r = parsePackScript('PACK "x"\nTEXT "no page"\nPAGE A\nHEADING 9 "x"\nWIBBLE\nROW a=1');
    expect(r.errors.map(e => e.line)).toEqual([2, 4, 5, 6]);
  });

  it('needs a PACK line, and flags a bad callout kind and table kind', () => {
    expect(parsePackScript('PAGE A').errors.some(e => /PACK/.test(e.message))).toBe(true);
    const r = parsePackScript('PACK "x"\nPAGE A\nCALLOUT loud "x"\nTABLE nope "T"');
    expect(r.errors).toHaveLength(2);
  });

  it('plan validation catches missing targets and depth', () => {
    const r = parsePackScript('PACK "x"\nPAGE A\nEMBED PAGE Nope\nEMBED TABLE "Nope"\nPAGE a/b/c/d/e/f');
    const p = planProblems(r.plan).join('\n');
    expect(p).toMatch(/Nope/);
    expect(p).toMatch(/nested 6 deep/);
  });
});

describe('plan to blocks (real schema, jsdom)', () => {
  const htmlToNodes = makeHtmlToNodes();
  const filled = fillTextFiles(parsePackScript(SCRIPT).plan, { 'notes.md': 'From a file.' });
  const fileDocs = new Map([
    ['leak.jpg', { id: 'd1', display_name: 'leak.jpg', mime_type: 'image/jpeg', provider_file_id: 'p1', file_size: 5 }],
    ['report', { id: 'd2', display_name: 'report.pdf', mime_type: 'application/pdf', provider_file_id: 'p2', file_size: 9 }]]);
  const pages = new Map([['background/timeline', { id: 'pg2', slug: 'timeline', title: 'Timeline' }]]);
  const tables = new Map([['chronology', { id: 'ds1', title: 'Chronology' }]]);
  let n = 0;
  const ctx = { htmlToNodes, files: fileDocs, pages, tables, plan: filled, mint: () => `u${++n}` };

  it('makes real nodes for every block type', () => {
    const doc = pageBlocksJson(filled.pages[0], ctx);
    const types = doc.content.map(c => c.type);
    expect(types).toContain('heading');
    expect(types).toContain('bulletList');
    expect(types).toContain('callout');
    expect(types).toContain('toggle');
    const assets = doc.content.filter(c => c.type === 'asset');
    expect(assets.map(a => a.attrs.document_id)).toEqual(['d1', 'd2']);
    expect(assets[0].attrs.width).toBe('medium');
    const callout = doc.content.find(c => c.type === 'callout');
    expect(callout.attrs.variant).toBe('warning');
    expect(callout.content[0].type).toBe('paragraph');
    const toggle = doc.content.find(c => c.type === 'toggle');
    expect(toggle.attrs.open).toBe(false);
    expect(toggle.content.map(c => c.type)).toEqual(['toggleSummary', 'toggleBody']);
  });

  it('embeds a page and a table by id', () => {
    const doc = pageBlocksJson(filled.pages[2], ctx);
    expect(doc.content[0]).toMatchObject({ type: 'embedDoc', attrs: { target_doc_id: 'pg2', target_slug: 'timeline', render_mode: 'summary' } });
    expect(doc.content[1]).toMatchObject({ type: 'embedDataset', attrs: { dataset_id: 'ds1' } });
  });

  it('turns a markdown table in a TEXT block into a real table', () => {
    const doc = pageBlocksJson({ blocks: [{ type: 'text', markdown: '| A | B |\n|---|---|\n| 1 | 2 |' }] }, ctx);
    expect(doc.content[0].type).toBe('table');
  });

  it('turns [x](./slug.md) into a page link carrying the page id, and leaves an unknown slug unresolved', () => {
    const doc = pageBlocksJson({ blocks: [{ type: 'text', markdown: 'See [the timeline](./timeline.md) and [gone](./nowhere.md).' }] },
      { ...ctx, pages: new Map([['background/timeline', { id: 'pg2', slug: 'timeline', title: 'Timeline' }]]) });
    const marks = doc.content[0].content.flatMap(c => c.marks ?? []).filter(m => m.type === 'docLink');
    expect(marks.map(m => [m.attrs.target_slug, m.attrs.target_doc_id])).toEqual([['timeline', 'pg2'], ['nowhere', null]]);
  });

  it('turns a table into a real table node', () => {
    const nodes = htmlToNodes('<table><tbody><tr><th><p>a</p></th></tr></tbody></table>');
    expect(nodes[0].type).toBe('table');
  });
});

describe('buildPackFromPlan', () => {
  const htmlToNodes = makeHtmlToNodes();
  const plan = fillTextFiles(parsePackScript(SCRIPT).plan, { 'notes.md': 'From a file.' });
  const mk = (over = {}) => {
    const calls = [];
    let i = 0;
    const deps = {
      createPack: vi.fn(async (d) => ({ id: 'pack1', title: d.title })),
      setArchived: vi.fn(async () => {}), renamePack: vi.fn(async () => {}),
      createMany: vi.fn(async (t, rows) => { calls.push([t, rows]); }),
      uploadFile: vi.fn(async (file, meta) => ({ id: `doc-${meta.display_name}`, display_name: meta.display_name, mime_type: 'x', provider_file_id: `pf-${meta.display_name}`, file_size: 1 })),
      importDocuments: vi.fn(),
      stamp: () => ({}), mint: () => `id${++i}`,
      ...over,
    };
    return { deps, calls };
  };
  const uploads = { 'leak.jpg': new File(['a'], 'leak.jpg'), 'report.pdf': new File(['b'], 'report.pdf') };

  it('builds folders, files, placements, pages in tree order, tables and rows', async () => {
    const { deps, calls } = mk();
    const r = await buildPackFromPlan(plan, { userId: 'u', uploads, htmlToNodes }, deps);
    expect(r.counts).toEqual({ pages: 3, folders: 2, files: 2, tables: 1, rows: 1 });
    const by = Object.fromEntries(calls.map(([t, rows]) => [t, rows]));
    expect(by.dossier_folders.map(f => [f.name, f.parent_id ? 'child' : 'root'])).toEqual([['Evidence', 'root'], ['Photos', 'child']]);
    expect(by.dossier_file_placements).toHaveLength(1);
    const docs = by.dossier_docs;
    expect(docs.map(d => d.title)).toEqual(['Background', 'Timeline', 'Summary']);
    expect(docs[1].parent_doc_id).toBe(docs[0].id);
    expect(by.dossier_records[0]).toMatchObject({ document_id: 'doc-report.pdf', doc_id: docs[0].id, fields: { event: 'Leak found' } });
    expect(deps.uploadFile.mock.calls[0][1].folder_path).toMatch(/Evidence \(id1\)\/Photos \(id2\)$/);
  });

  it('stops before creating anything when a file is missing or the plan is invalid', async () => {
    const { deps } = mk();
    await expect(buildPackFromPlan(plan, { userId: 'u', uploads: {}, htmlToNodes }, deps)).rejects.toThrow(/not been supplied/);
    await expect(buildPackFromPlan({ ...plan, title: '' }, { userId: 'u', uploads, htmlToNodes }, deps)).rejects.toThrow(/title/);
    expect(deps.createPack).not.toHaveBeenCalled();
  });

  it('reports a file that could not be stored and carries on', async () => {
    const { deps } = mk({ uploadFile: vi.fn(async (f, m) => { if (m.display_name === 'leak.jpg') throw new Error('disk'); return { id: 'dx', display_name: 'r', provider_file_id: 'p' }; }) });
    const r = await buildPackFromPlan(plan, { userId: 'u', uploads, htmlToNodes }, deps);
    expect(r.skipped).toEqual([expect.objectContaining({ name: 'leak.jpg', reason: 'disk' })]);
  });

  it('copies library files through the server and archives the pack if a table insert fails', async () => {
    const lib = { ...plan, files: plan.files.map(f => ({ ...f, source: { kind: 'library', documentId: `L-${f.ref}` } })) };
    const { deps } = mk({
      importDocuments: vi.fn(async (pid, items) => ({ map: Object.fromEntries(items.map(i => [i.documentId, { id: `c-${i.documentId}`, display_name: 'x', provider_file_id: 'p' }])), skipped: [] })),
      createMany: vi.fn(async (t) => { if (t === 'dossier_datasets') throw new Error('boom'); }),
    });
    await expect(buildPackFromPlan(lib, { userId: 'u', htmlToNodes }, deps)).rejects.toThrow(/could not be completed/);
    expect(deps.importDocuments).toHaveBeenCalled();
    expect(deps.setArchived).toHaveBeenCalledWith('pack1', true, 'u');
    expect(deps.renamePack).toHaveBeenCalledWith('pack1', 'Flat 14 — water — incomplete', 'u');
  });
});
