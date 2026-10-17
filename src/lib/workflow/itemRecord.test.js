// The record of one workflow item (2026-10-17): built from the event log as
// recorded, with who made each move, how long each step took, and plain
// statements of what the log cannot say. And the Word file says it all.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { itemRecordModel, timeBetween, whoMade } from './itemRecord.js';
import { buildItemRecord } from '#lib/docx/itemRecordDocx.js';
import { DEFAULT_APPLICATION_WORKFLOW as WF } from '#lib/apps/parking/utils/applicationWorkflow.js';

const steps = WF.steps.map((s, i) => ({ ...s, position: i + 1 }));
const ev = (id, from_key, to_key, at, by = null, note = null, action = null) => ({ id, from_key, to_key, at, by, note, action });
const events = [
  ev(1, null, 'received', '2026-10-01T09:00:00Z', null, 'Received from the online form'),
  ev(2, 'received', 'checking', '2026-10-01T09:20:00Z', 'u1'),
  ev(3, 'checking', 'waiting_list', '2026-10-05T14:00:00Z', 'u2', 'Checked against the lease', 'parking_add_to_waiting_list'),
];
const subject = {
  title: 'Parking application PKR-2026-000001',
  facts: [['Reference', 'PKR-2026-000001'], ['Phone', null], ['Email', 'a@example.com'], ['Company', '  ']],
  sections: [{ heading: 'Privacy notice they agreed to', text: 'We use your details.' }, { heading: 'Empty', text: '' }],
};
const base = { workflow: { name: WF.name }, steps, events, subject, people: { u1: 'Pat Smith' } };

describe('itemRecordModel', () => {
  const m = itemRecordModel({ ...base, item: { step_key: 'waiting_list', due_on: '2026-10-10', created_at: '2026-10-01T09:00:00Z' }, todayISO: '2026-10-17' });

  it('every recorded move, oldest first, with the step names, the note and the action', () => {
    expect(m.moves.map((x) => [x.from, x.to])).toEqual([['', 'Received'], ['Received', 'Being checked'], ['Being checked', 'On the waiting list']]);
    expect(m.moves[2]).toMatchObject({ note: 'Checked against the lease', action: 'Add to the Parking waiting list' });
  });
  it('who made each move — a name, a user no longer listed, or nobody signed in; never an id', () => {
    expect(m.moves.map((x) => x.by)).toEqual(['Not a signed-in user (e.g. the online form)', 'Pat Smith', 'A user no longer listed']);
    expect(JSON.stringify(m)).not.toMatch(/"u[12]"/);
  });
  it('how long it sat in the step each move left', () => {
    expect(m.moves.map((x) => x.waited)).toEqual(['', '20 minutes', '4 days']);
  });
  it('a finished item has no deadline shown, whatever due_on still holds', () => {
    expect(m.now).toMatchObject({ step: 'On the waiting list', finished: true, due: '' });
  });
  it('an open item shows its deadline in words', () => {
    const open = itemRecordModel({ ...base, events: events.slice(0, 2), item: { step_key: 'checking', due_on: '2026-10-20', created_at: '2026-10-01T09:00:00Z' }, todayISO: '2026-10-17' });
    expect(open.now.due).toMatch(/Due in 3 days — 20 Oct 2026/);
  });
  it('empty facts and sections are left out', () => {
    expect(m.facts.map(([k]) => k)).toEqual(['Reference', 'Email']);
    expect(m.sections.map((s) => s.heading)).toEqual(['Privacy notice they agreed to']);
  });
  it('a removed step is named by its key and said to be gone, never silently dropped', () => {
    const r = itemRecordModel({ ...base, events: [...events, ev(4, 'waiting_list', 'archived', '2026-10-06T10:00:00Z', 'u1')], item: { step_key: 'archived', created_at: '2026-10-01T09:00:00Z' } });
    expect(r.moves[3].to).toBe('archived (a step no longer in the workflow)');
    expect(r.notes.join(' ')).toMatch(/since been removed/);
  });
  it('says the step names are today’s', () => {
    expect(m.notes[0]).toMatch(/as the workflow names them today/);
  });
});

describe('timeBetween / whoMade', () => {
  it('minutes, hours, then London calendar days', () => {
    expect(timeBetween('2026-10-01T09:00:00Z', '2026-10-01T09:00:30Z')).toBe('under a minute');
    expect(timeBetween('2026-10-01T09:00:00Z', '2026-10-01T12:00:00Z')).toBe('3 hours');
    expect(timeBetween('2026-10-01T09:00:00Z', '2026-10-02T12:00:00Z')).toBe('1 day');
  });
  it('a missing profile is not shown as an id', () => {
    expect(whoMade('x', {})).toBe('A user no longer listed');
  });
});

describe('buildItemRecord — the Word file', () => {
  it('carries the title, the details, every move with who and the note, and the privacy notice', async () => {
    const m = itemRecordModel({ ...base, item: { step_key: 'waiting_list', created_at: '2026-10-01T09:00:00Z' } });
    const { bytes, filename } = await buildItemRecord(m, { generatedAt: '17 Oct 2026, 22:00', generatedBy: 'Pat Smith', filenameStem: 'PKR-2026-000001_2026-10-17' });
    expect(filename).toBe('Record_PKR-2026-000001_2026-10-17.docx');
    const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const s of ['Parking application PKR-2026-000001', 'Produced 17 Oct 2026, 22:00 by Pat Smith', 'a@example.com',
      'Received → Being checked', 'Checked against the lease', 'Action run: Add to the Parking waiting list',
      'after 4 days in the step before', 'We use your details.', 'as the workflow names them today']) {
      expect(text).toContain(s);
    }
    expect(text).not.toMatch(/undefined|null|\[object Object\]/);
  });
});
