// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
vi.mock('#lib/utils/logger.js', () => ({ getLogger: () => () => {} }));
import { issueToPlan } from './issueDossierPlan.js';
import { planProblems } from '../../dossier/utils/packPlan.js';
import { buildPackFromPlan } from '../../dossier/utils/packBuild.js';
import { makeHtmlToNodes } from '../../dossier/utils/planBlocks.js';

const issue = {
  id: 'i1', issue_number: 49, name: 'Roof leak / ceiling', status: 'open', priority: 2,
  description: 'Water in flat 14.\n\nSecond paragraph <b>raw</b>.', created_at: '2026-06-01T09:00:00Z',
  activities: [
    { id: 'a1', activity_type: 'comment', body: '<p>Internal: <strong>do not share</strong></p>', created_at: '2026-06-02T10:00:00Z', historic: false, fields: {}, created_by_profile: { full_name: 'Pat' } },
    { id: 'a2', activity_type: 'email', body: '<p>Please attend.</p>', created_at: '2026-06-03T10:00:00Z', fields: { from: 'a@x', to: 'b@x', subject: 'Leak', email_date: '2026-06-03', doc_id: 'd1' } },
    { id: 'a3', activity_type: 'document', body: '', created_at: '2026-06-04T10:00:00Z', historic: true, fields: { summary: 'Photo', doc_id: 'd2' } },
    { id: 'a4', activity_type: 'comment', body: '<p>Same day</p>', created_at: '2026-06-02T11:00:00Z', fields: {} },
  ],
  actions: [{ id: 'x1', action_text: 'Call surveyor | urgent', name_text: 'Sam', date_deadline: '2026-06-10', status: 'open', created_at: '2026-06-02T10:00:00Z' }],
};
const documents = [
  { id: 'd1', display_name: 'report.pdf', mime_type: 'application/pdf', created_at: '2026-06-03T10:00:00Z' },
  { id: 'd2', display_name: 'leak.jpg', mime_type: 'image/jpeg', created_at: '2026-06-04T10:00:00Z', created_by_profile: { full_name: 'Pat' } },
];

describe('issueToPlan', () => {
  const plan = issueToPlan({ issue, documents });

  it('is a valid plan that includes everything', () => {
    expect(planProblems(plan)).toEqual([]);
    expect(plan.title).toBe('Issue 49 — Roof leak / ceiling');
    expect(plan.files.map(f => f.source)).toEqual([{ kind: 'library', documentId: 'd1' }, { kind: 'library', documentId: 'd2' }]);
    const titles = plan.pages.map(p => p.path.join(' > '));
    expect(titles[0]).toBe('Summary');
    expect(titles).toContain('Actions');
    expect(titles.filter(t => t.startsWith('Activity > '))).toHaveLength(4);
    const all = JSON.stringify(plan);
    expect(all).toContain('do not share');            // internal notes are in
    expect(all).toContain('historic');                // historic entries are in
    const actions = plan.pages.find(p => p.path[0] === 'Actions');
    expect(actions.blocks[0].markdown).toContain('Call surveyor \\| urgent');   // a pipe cannot break the table
  });

  it('orders activities oldest first and numbers their pages uniquely', () => {
    const acts = plan.pages.filter(p => p.path[0] === 'Activity' && p.path.length === 2).map(p => p.path[1]);
    expect(acts[0]).toMatch(/^01\. 2026-06-02/);
    expect(acts[1]).toMatch(/^02\. 2026-06-02/);
    expect(new Set(acts).size).toBe(4);
  });

  it('puts a picture on the activity page as an image and a PDF as an attachment', () => {
    const photo = plan.pages.find(p => p.path[1]?.includes('Document'));
    expect(photo.blocks.some(b => b.type === 'image' && b.file === 'doc-d2')).toBe(true);
    const mail = plan.pages.find(p => p.path[1]?.includes('Email'));
    expect(mail.blocks.some(b => b.type === 'attachment' && b.file === 'doc-d1')).toBe(true);
  });

  it('builds the three tables', () => {
    expect(plan.tables.map(t => t.title)).toEqual(['Chronology', 'Correspondence', 'Document index']);
    const corr = plan.tables[1].rows[0];
    expect(corr.fields).toMatchObject({ from: 'a@x', to: 'b@x', subject: 'Leak', date: '2026-06-03' });
    expect(corr.file).toBe('doc-d1');
    const dates = plan.tables[0].rows.map(r => r.fields.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('copes with an issue that has nothing on it', () => {
    const empty = issueToPlan({ issue: { id: 'e', issue_number: 1, name: 'Empty', activities: [], actions: [] }, documents: [] });
    expect(planProblems(empty)).toEqual([]);
  });

  it('goes through the real builder into valid pages', async () => {
    const calls = {};
    const lib = { map: Object.fromEntries(documents.map(d => [d.id, { id: `c-${d.id}`, display_name: d.display_name, mime_type: d.mime_type, provider_file_id: `p-${d.id}`, file_size: 1 }])), skipped: [] };
    let n = 0;
    const r = await buildPackFromPlan(plan, { userId: 'u', htmlToNodes: makeHtmlToNodes() }, {
      createPack: async (d) => ({ id: 'pk', title: d.title }), setArchived: async () => {}, renamePack: async () => {},
      createMany: async (t, rows) => { calls[t] = rows; }, uploadFile: async () => { throw new Error('no'); },
      importDocuments: async () => lib, stamp: () => ({}), mint: () => `m${++n}`,
    });
    expect(r.skipped).toEqual([]);
    expect(r.counts.pages).toBe(7);
    const summary = calls.dossier_docs[0].blocks.content.map(c => c.type);
    expect(summary).toContain('callout');
    expect(summary.filter(t => t === 'embedDataset')).toHaveLength(3);
    const assets = JSON.stringify(calls.dossier_docs.map(d => d.blocks)).match(/"type":"asset"/g);
    expect(assets).toHaveLength(2);
  });
});
