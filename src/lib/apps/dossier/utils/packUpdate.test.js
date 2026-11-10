// @vitest-environment jsdom
// Updating a pack from its Management issue: what is new is added, nothing is
// lost, and a replaced page is saved to its History first.
import { describe, it, expect, vi } from 'vitest';
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
import { issueToPlan } from '../../management/utils/issueDossierPlan.js';
import { buildPackFromPlan } from './packBuild.js';
import { makeHtmlToNodes } from './planBlocks.js';
import { planUpdate, applyPlanUpdate, pageContentHash, stableStringify, fingerprint, describeUpdate } from './packUpdate.js';

const htmlToNodes = makeHtmlToNodes();

const baseIssue = {
  id: 'i1', issue_number: 49, name: 'Roof leak', status: 'open', priority: 2, created_at: '2026-06-01T09:00:00Z',
  activities: [
    { id: 'a1', activity_type: 'comment', body: '<p>First</p>', created_at: '2026-06-02T10:00:00Z', fields: {} },
    { id: 'a2', activity_type: 'email', body: '<p>Mail</p>', created_at: '2026-06-03T10:00:00Z', fields: { from: 'a@x', to: 'b@x', subject: 'Leak', email_date: '2026-06-03', doc_id: 'd1' } },
  ],
  actions: [{ id: 'x1', action_text: 'Call surveyor', name_text: 'Sam', date_deadline: '2026-06-10', status: 'open', created_at: '2026-06-02T10:00:00Z' }],
};
const docsLib = [{ id: 'd1', display_name: 'report.pdf', mime_type: 'application/pdf', created_at: '2026-06-03T10:00:00Z' }];
const libCopy = (ids) => ({ map: Object.fromEntries(ids.map(id => [id, { id: `c-${id}`, display_name: `${id}.pdf`, mime_type: 'application/pdf', provider_file_id: `p-${id}`, file_size: 1 }])), skipped: [] });

/** A pack built from the issue, held as the rows the database would hold. */
async function makePack(issue = baseIssue, documents = docsLib) {
  /** @type {Record<string, any[]>} */
  const db = { dossier_docs: [], dossier_datasets: [], dossier_records: [], dossier_source_items: [], dossier_folders: [], dossier_file_placements: [], files: [] };
  let n = 0;
  const plan = issueToPlan({ issue, documents });
  await buildPackFromPlan(plan, { userId: 'u', htmlToNodes }, {
    createPack: async (d) => ({ id: 'pk', title: d.title, ...d }), setArchived: async () => {}, renamePack: async () => {},
    createMany: async (t, rows) => { (db[t] ??= []).push(...rows.map(r => ({ id: r.id ?? `i${++n}`, ...r }))); },
    uploadFile: async () => { throw new Error('no'); },
    importDocuments: async (_p, items) => { const r = libCopy(items.map(i => i.documentId)); db.files.push(...Object.values(r.map)); return r; },
    stamp: () => ({}), mint: () => `m${++n}`,
  });
  return db;
}

const state = (db) => ({ items: db.dossier_source_items, docs: db.dossier_docs, datasets: db.dossier_datasets, records: db.dossier_records, files: db.files });

/** Apply an update against the in-memory pack, recording every write. */
async function apply(db, plan, report, choose = new Set()) {
  /** @type {{ saved: { id: string, summary: string }[], created: Record<string, any[]> }} */
  const writes = { saved: [], created: {} };
  let n = 0;
  const result = await applyPlanUpdate({
    pack: { id: 'pk', title: 'Issue 49 — Roof leak' }, plan, report, choose, userId: 'u', label: 'Issue 49', htmlToNodes,
    existing: { ...state(db), folders: db.dossier_folders },
  }, {
    createMany: async (t, rows) => { (writes.created[t] ??= []).push(...rows); (db[t] ??= []).push(...rows); },
    saveItems: async (rows) => {
      for (const r of rows) {
        const i = db.dossier_source_items.findIndex(x => x.id === r.id && r.id);
        if (i >= 0) db.dossier_source_items[i] = { ...db.dossier_source_items[i], ...r };
        else db.dossier_source_items.push({ id: `s${++n}`, ...r });
      }
    },
    saveDocBlocks: async (id, blocks, summary) => {
      writes.saved.push({ id, summary });
      const d = db.dossier_docs.find(x => x.id === id); d.blocks = blocks;
    },
    importDocuments: async (_p, items) => { const r = libCopy(items.map(i => i.documentId)); db.files.push(...Object.values(r.map)); return r; },
    stamp: () => ({}), mint: () => `u${++n}`,
  });
  return { result, writes };
}

describe('fingerprints', () => {
  it('do not depend on the order of keys, nor on block ids', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
    expect(fingerprint('x')).not.toBe(fingerprint('y'));
    const a = { type: 'doc', content: [{ type: 'paragraph', attrs: { uid: '1' }, content: [{ type: 'text', text: 'hi' }] }] };
    const b = { type: 'doc', content: [{ type: 'paragraph', attrs: { uid: '2' }, content: [{ type: 'text', text: 'hi' }] }] };
    expect(pageContentHash(a)).toBe(pageContentHash(b));
  });
});

describe('a pack made from an issue', () => {
  it('remembers every keyed page, table, row and file', async () => {
    const db = await makePack();
    const keys = db.dossier_source_items.map(i => i.source_key);
    expect(keys).toEqual(expect.arrayContaining(['summary', 'activity', 'actions', 'meetings', 'activity:a1', 'activity:a2',
      'table:chronology', 'chronology:activity:a1', 'chronology:action:x1', 'correspondence:activity:a2', 'document:d1', 'index:document:d1']));
    expect(db.dossier_source_items.filter(i => i.target_kind === 'page').every(i => i.written_hash)).toBe(true);
  });

  it('is up to date straight after it is made', async () => {
    const db = await makePack();
    const report = planUpdate(issueToPlan({ issue: baseIssue, documents: docsLib }), state(db));
    expect(report.nothing).toBe(true);
    expect(report.choose).toEqual([]);
  });
});

describe('updating it', () => {
  const later = {
    ...baseIssue,
    activities: [...baseIssue.activities,
      { id: 'a3', activity_type: 'letter', body: '<p>Letter</p>', created_at: '2026-07-01T10:00:00Z', fields: { from: 'us', to: 'them', letter_date: '2026-07-01', doc_id: 'd2' } }],
    actions: [{ ...baseIssue.actions[0], status: 'completed' },
      { id: 'x2', action_text: 'Book roofer', date_deadline: '2026-07-10', status: 'open', created_at: '2026-07-01T10:00:00Z' }],
  };
  const laterDocs = [...docsLib, { id: 'd2', display_name: 'letter.pdf', mime_type: 'application/pdf', created_at: '2026-07-01T10:00:00Z' }];

  it('adds what is new and refreshes overview pages nobody edited, saving them to History first', async () => {
    const db = await makePack();
    const before = { docs: db.dossier_docs.length, records: db.dossier_records.length };
    const plan = issueToPlan({ issue: later, documents: laterDocs });
    const report = planUpdate(plan, state(db));
    expect(report.addPages.map(p => p.key)).toEqual(['activity:a3']);
    expect(report.addRows.map(r => r.row.key).sort()).toEqual(['chronology:action:x2', 'chronology:activity:a3', 'correspondence:activity:a3', 'index:document:d2']);
    expect(report.addFiles.map(f => f.key)).toEqual(['document:d2']);
    expect(report.refresh.map(r => r.page.key).sort()).toEqual(['actions', 'activity', 'summary']);
    expect(report.choose).toEqual([]);
    expect(describeUpdate(report)[0]).toBe('1 new page');

    const { writes, result } = await apply(db, plan, report);
    expect(result.counts).toMatchObject({ pages: 1, rows: 4, files: 1, replaced: 3 });
    // Nothing removed; new rows go at the end; the new page sits under Activity.
    expect(db.dossier_docs.length).toBe(before.docs + 1);
    expect(db.dossier_records.length).toBe(before.records + 4);
    const parent = db.dossier_docs.find(d => d.title === 'Activity');
    expect(db.dossier_docs.find(d => d.title.includes('Letter')).parent_doc_id).toBe(parent.id);
    // Every replaced page went through the History.
    expect(writes.saved.every(s => s.summary === 'Before update from Issue 49')).toBe(true);
    const actions = db.dossier_docs.find(d => d.title === 'Actions');
    expect(JSON.stringify(actions.blocks)).toContain('Completed');
    // And straight after, it is up to date.
    expect(planUpdate(plan, state(db)).nothing).toBe(true);
  });

  it('asks before replacing an overview page edited here, and an activity changed on the issue', async () => {
    const db = await makePack();
    const actions = db.dossier_docs.find(d => d.title === 'Actions');
    actions.blocks = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My own notes' }] }] };
    const edited = { ...later, activities: later.activities.map(a => a.id === 'a1' ? { ...a, body: '<p>First, corrected</p>' } : a) };
    const plan = issueToPlan({ issue: edited, documents: laterDocs });
    const report = planUpdate(plan, state(db));
    expect(report.choose.map(c => [c.page.key, c.why]).sort()).toEqual([['actions', 'edited'], ['activity:a1', 'changed']]);

    // Not ticked: left exactly as it is.
    await apply(db, plan, report, new Set());
    expect(db.dossier_docs.find(d => d.id === actions.id).blocks.content[0].content[0].text).toBe('My own notes');
    // Offered again next time, until it is taken.
    const again = planUpdate(plan, state(db));
    expect(again.choose.map(c => c.page.key).sort()).toEqual(['actions', 'activity:a1']);
    const { writes } = await apply(db, plan, again, new Set(['activity:a1']));
    expect(writes.saved.map(s => db.dossier_docs.find(d => d.id === s.id).title)).toEqual([expect.stringContaining('Comment')]);
    expect(JSON.stringify(db.dossier_docs.find(d => d.title.includes('Comment')).blocks)).toContain('corrected');
  });

  it('leaves what has gone from the issue, and does not bring back what was removed here', async () => {
    const db = await makePack();
    const gone = { ...baseIssue, activities: [baseIssue.activities[1]] };
    const a2 = db.dossier_source_items.find(i => i.source_key === 'activity:a2');
    db.dossier_docs = db.dossier_docs.filter(d => d.id !== a2.target_id);       // removed here
    const report = planUpdate(issueToPlan({ issue: gone, documents: docsLib }), state(db));
    expect(report.removed.map(r => r.key)).toEqual(expect.arrayContaining(['activity:a1', 'chronology:activity:a1']));
    expect(report.removedHere.map(r => r.key)).toEqual(['activity:a2']);
    expect(report.addPages).toEqual([]);
  });
});
