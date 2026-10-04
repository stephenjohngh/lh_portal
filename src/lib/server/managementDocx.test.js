// src/lib/server/managementDocx.test.js
//
// The three Management Word reports, read from the PACKED document.xml — what a
// reader sees, not the docx object graph. Each case is a fault the reports had
// before they moved onto docxHelpers (2026-10-02).

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { today, addDaysISO } from '#lib/utils/dates.js';
import {
  reportDocument, buildIssuesReport, buildActionsReport, buildMinutesReport,
} from './managementDocx.js';

async function xmlOf(title, children) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(reportDocument(title, children)));
  const read = async (name) => (await zip.file(name)?.async('string')) ?? '';
  const headers = await Promise.all(Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).map(read));
  const footers = await Promise.all(Object.keys(zip.files).filter((n) => /^word\/footer\d*\.xml$/.test(n)).map(read));
  return { body: await read('word/document.xml'), headers: headers.join(''), footers: footers.join('') };
}

/** The visible text of a part, run by run. */
const words = (xml) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

const action = (over = {}) => ({
  id: 'x1', action_text: 'Replace closer', status: 'pending', name_text: 'Sam',
  created_at: '2026-09-01T10:00:00Z', ...over,
});
const actionsXml = (actions) => xmlOf('Actions Report', buildActionsReport({
  groups: [{ issue: { issue_number: 7, name: 'Fire doors', status: 'current' }, actions }],
  sortMode: 'deadline',
}));

describe('every Management report', () => {
  const cases = {
    issues:  () => xmlOf('Issues Report', buildIssuesReport({ issues: [{ id: 'i', issue_number: 1, name: 'A', status: 'current', created_at: '2026-09-01T10:00:00Z' }] })),
    actions: () => actionsXml([action()]),
    minutes: () => xmlOf('Meeting Minutes', buildMinutesReport({ meeting: { id: 'm', title: 'Board' }, issues: [] })),
  };
  for (const [name, build] of Object.entries(cases)) {
    it(`${name}: is A4 with a running header and page numbers`, async () => {
      const { body, headers, footers } = await build();
      // A4 portrait in twips — it used to be US Letter (12240 × 15840).
      expect(body).toMatch(/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/);
      // The tables are CONTENT_W wide, which holds only with pageProps' margins.
      expect(body).toMatch(/<w:pgMar[^>]*w:top="720"[^>]*w:right="720"[^>]*w:bottom="720"[^>]*w:left="720"/);
      expect(words(headers)).not.toBe('');
      expect(footers).toMatch(/PAGE/);
    });
  }
});

describe('actions: overdue', () => {
  it('is not overdue on its deadline day, and is the day after', async () => {
    const onTheDay = words((await actionsXml([action({ date_deadline: today() })])).body);
    expect(onTheDay).not.toMatch(/overdue/);
    const dayAfter = words((await actionsXml([action({ date_deadline: addDaysISO(today(), -1) })])).body);
    expect(dayAfter).toMatch(/overdue/);
  });

  it('never flags a completed action', async () => {
    const t = words((await actionsXml([action({ status: 'completed', date_deadline: addDaysISO(today(), -30) })])).body);
    expect(t).not.toMatch(/overdue/);
  });

  it('applies the same rule in the issues report and the minutes', async () => {
    const late = action({ date_deadline: addDaysISO(today(), -1) });
    const done = action({ id: 'x2', action_text: 'Done one', status: 'completed', date_deadline: addDaysISO(today(), -1) });
    const issues = words((await xmlOf('Issues Report', buildIssuesReport({ issues: [{
      id: 'i', issue_number: 1, name: 'A', status: 'current', created_at: '2026-09-01T10:00:00Z',
      outstandingActions: [late, done],
    }] }))).body);
    expect(issues.match(/overdue/g)).toHaveLength(1);
    const minutes = words((await xmlOf('Meeting Minutes', buildMinutesReport({ meeting: { id: 'm', title: 'Board' }, issues: [{
      id: 'i', issue_number: 1, name: 'A', meeting_id: 'm', activities: [],
      actions: [{ ...late, meeting_id: 'm' }, { ...done, meeting_id: 'm' }],
    }] }))).body);
    expect(minutes.match(/overdue/g)).toHaveLength(1);
  });
});

describe('missing values never print as "null"', () => {
  it('in the actions report', async () => {
    const t = words((await xmlOf('Actions Report', buildActionsReport({
      groups: [{ issue: { issue_number: null, name: null }, actions: [action({ action_text: null })] }],
    }))).body);
    expect(t).not.toMatch(/null|undefined/);
    expect(t).toMatch(/Untitled issue/);
    expect(t).toMatch(/\(no description\)/);
  });

  it('in the issues report and the minutes', async () => {
    const issue = { id: 'i', issue_number: null, name: null, status: 'current', meeting_id: 'm', created_at: '2026-09-01T10:00:00Z', activities: [], actions: [] };
    const a = words((await xmlOf('Issues Report', buildIssuesReport({ issues: [issue] }))).body);
    const b = words((await xmlOf('Meeting Minutes', buildMinutesReport({ meeting: { id: 'm', title: 'Board' }, issues: [issue] }))).body);
    for (const t of [a, b]) {
      expect(t).not.toMatch(/null|undefined/);
      expect(t).toMatch(/Untitled issue/);
    }
  });
});

describe('minutes: nothing tagged to the meeting is dropped', () => {
  it('prints an activity of a type with no heading of its own, under "Other"', async () => {
    const t = words((await xmlOf('Meeting Minutes', buildMinutesReport({ meeting: { id: 'm', title: 'Board' }, issues: [{
      id: 'i', issue_number: 3, name: 'Lift', actions: [],
      activities: [{ id: 'a', meeting_id: 'm', activity_type: 'meeting', body: '<p>Logged at the meeting</p>', created_at: '2026-09-01T10:00:00Z' }],
    }] }))).body);
    expect(t).toMatch(/Other/);
    expect(t).toMatch(/Logged at the meeting/);
    expect(t).toMatch(/1 other item/);
  });

  it('prints every tagged activity and action', async () => {
    const types = ['comment', 'decision', 'note', 'email', 'letter', 'document', 'call'];
    const activities = types.map((type, i) => ({
      id: `a${i}`, meeting_id: 'm', activity_type: type, body: `<p>Body ${type}</p>`, created_at: `2026-09-01T1${i}:00:00Z`,
    }));
    const t = words((await xmlOf('Meeting Minutes', buildMinutesReport({ meeting: { id: 'm', title: 'Board' }, issues: [{
      id: 'i', issue_number: 3, name: 'Lift', activities,
      actions: [action({ meeting_id: 'm', action_text: 'Book engineer' })],
    }] }))).body);
    for (const type of types) expect(t).toContain(`Body ${type}`);
    expect(t).toContain('Book engineer');
  });
});
