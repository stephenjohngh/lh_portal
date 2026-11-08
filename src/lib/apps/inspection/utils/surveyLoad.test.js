// src/lib/apps/inspection/utils/surveyLoad.test.js
//
// Round trip: a template made by the portal is filled in as a person converting a
// contractor's report would, then read and checked. So the template and the reader
// are held to each other.

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { surveyTemplateModel, buildSurveyTemplateWorkbook } from './surveyTemplate.js';
import { readSurveyWorkbook, checkSurvey, readDate, readTime, surveyDetails } from './surveyLoad.js';

const types = [{ id: 't-door', code: 'door', name: 'Apartment Door', initial: 'A' }];
const floors = [{ id: 'fG', short_name: 'G', name: 'Ground Floor', level_order: 0 }];
const defs = [
  { id: 'rt', name: 'Rating', checkable: false, visible: true, display_type: 'dropdown', default_value: 'Nominal FD60', presentation_order: 1 },
  { id: 'c1', name: 'Self Closing', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 10 },
  { id: 'c2', name: 'Hinges', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 20 },
  { id: 'r1', name: 'Gap Top mm', checkable: true, visible: true, display_type: 'number', presentation_order: 30 },
];
const doors = [1, 2, 3].map((n) => ({ id: `d${n}`, type_code: 'door', floor_id: 'fG', asset_id: `0${n}`, label: String(n), inspection_sort_order: n, status: 'ok', status_set_at: null }));
const obligation = { id: 'ob1', name: 'Fire door checks', scope: { typeCodes: ['door'] } };
const NOW = new Date('2026-11-08T12:00:00Z');

/** Make the template, let `fill` write into it, and read it back. */
async function filled(fill, { survey = { firm: 'Spartafire', survey_ref: 'J123', lead: 'A Surveyor' } } = {}) {
  const { model } = /** @type {any} */ (surveyTemplateModel({ obligation, components: doors, types, floors, attrDefs: { 't-door': defs }, componentAttrs: {} }));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await buildSurveyTemplateWorkbook(model));
  const sv = wb.getWorksheet('Survey');
  sv.eachRow((row) => { const k = row.getCell(3).value; if (k in survey) row.getCell(2).value = survey[k]; });
  const ws = wb.getWorksheet('Results');
  const col = Object.fromEntries(ws.getRow(1).values.map((k, i) => [k, i]).filter(([k]) => k));
  const row = (ref) => { for (let n = 3; n <= ws.rowCount; n++) if (ws.getRow(n).getCell(1).value === ref) return n; throw new Error(ref); };
  fill({ set: (n, key, v) => { ws.getRow(n).getCell(col[key]).value = v; }, row });
  return readSurveyWorkbook(await wb.xlsx.writeBuffer());
}

const ctx = (over = {}) => ({
  obligations: [obligation],
  scopeIdsFor: () => new Set(doors.map((d) => d.id)),
  componentById: new Map(doors.map((d) => [d.id, d])),
  defsFor: () => defs,
  componentAttrs: {},
  now: NOW,
  ...over,
});

const visit = (f, ref, { date = new Date(Date.UTC(2026, 9, 4)), time = '10:15', result = 'OK', checks = {}, ...rest } = {}) => {
  const n = f.row(ref);
  f.set(n, 'date', date); f.set(n, 'time', time); f.set(n, 'result', result);
  for (const [k, v] of Object.entries({ ...checks, ...rest })) f.set(n, k, v);
};

describe('checkSurvey — a good file', () => {
  it('gives each row its own date and London time', async () => {
    const read = await filled((f) => {
      visit(f, 'G/A/01', { time: '10:15', checks: { c1: 'Pass', c2: 'Pass', r1: 3 }, source_ref: 'Sheet 12' });
      visit(f, 'G/A/02', { time: '10:40', result: 'Failed', checks: { c1: 'Fail' }, notes: 'Closer weak' });
    });
    const { refusals, rows, summary } = checkSurvey(read, ctx());
    expect(refusals).toEqual([]);
    expect(rows.map((r) => r.inspected_at)).toEqual(['2026-10-04T09:15:00.000Z', '2026-10-04T09:40:00.000Z']);
    expect(rows[0]).toMatchObject({ result: 'ok', checklist_results: { c1: true, c2: true }, readings: { r1: 3 }, source_ref: 'Sheet 12', seen_by: 'A Surveyor', time_recorded: true });
    expect(rows[1]).toMatchObject({ result: 'failed', checklist_results: { c1: false }, notes: 'Closer weak' });
    expect(summary).toMatchObject({ rows: 2, days: 1, seen: 2, notInFile: 1 });
    expect(summary.statusChanges).toEqual({ 'OK → Failed': 1 });
  });

  it('stores a row with no time at midday, marked as having no time', async () => {
    const read = await filled((f) => visit(f, 'G/A/01', { time: null }));
    const { rows, warnings } = checkSurvey(read, ctx());
    expect(rows[0]).toMatchObject({ inspected_at: '2026-10-04T11:00:00.000Z', time_recorded: false });
    expect(warnings.join(' ')).toContain('no time');
  });

  it('keeps no access with its reason and nothing else', async () => {
    const read = await filled((f) => visit(f, 'G/A/03', { result: 'No access', no_access_reason: 'No answer' }));
    const { refusals, rows, summary } = checkSurvey(read, ctx());
    expect(refusals).toEqual([]);
    expect(rows[0]).toMatchObject({ result: 'no_access', no_access_reason: 'no_answer', checklist_results: {} });
    expect(summary.noAccess).toBe(1);
  });

  it('makes a door it could not get into Problem, but never softens a Fail (user, 2026-11-08)', async () => {
    const read = await filled((f) => {
      visit(f, 'G/A/01', { result: 'No access', no_access_reason: 'No answer' });
      visit(f, 'G/A/02', { result: 'No access', no_access_reason: 'No answer' });
    });
    const failedTwo = new Map(doors.map((d) => [d.id, d.id === 'd2' ? { ...d, status: 'failed' } : d]));
    expect(checkSurvey(read, ctx({ componentById: failedTwo })).summary.statusChanges).toEqual({ 'OK → Problem': 1 });
  });

  it('a door the survey saw on one day takes that result, not a later visit with no access', async () => {
    const read = await filled((f) => {
      visit(f, 'G/A/01', { result: 'Failed', checks: { c1: 'Fail' } });
      let spare = 3; while (f.row('G/A/03') >= spare) spare++;
      // A spare row: the component chosen in column A, a later day, no access.
      f.set(spare, 'ref', 'G/A/01');
      f.set(spare, 'date', new Date(Date.UTC(2026, 9, 6))); f.set(spare, 'result', 'No access'); f.set(spare, 'no_access_reason', 'No answer');
    });
    const { refusals, rows, summary } = checkSurvey(read, ctx());
    expect(refusals).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(summary.statusChanges).toEqual({ 'OK → Failed': 1 });
  });

  it('reads the Survey sheet', async () => {
    const read = await filled(() => {});
    expect(surveyDetails(read.survey)).toMatchObject({ firm: 'Spartafire', reference: 'J123', lead_surveyor: 'A Surveyor', definition_id: 'ob1' });
  });
});

describe('checkSurvey — refused', () => {
  const refusalsOf = async (fill, over) => checkSurvey(await filled(fill), ctx(over)).refusals.map((r) => r.text).join(' | ');

  it('a row with no date, or no Result', async () => {
    expect(await refusalsOf((f) => f.set(f.row('G/A/01'), 'result', 'OK'))).toContain('no date');
    expect(await refusalsOf((f) => f.set(f.row('G/A/01'), 'date', new Date(Date.UTC(2026, 9, 4))))).toContain('no Result');
  });

  it('a date in the future', async () => {
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { date: new Date(Date.UTC(2027, 0, 1)) }))).toContain('future');
  });

  it('a value not on the list', async () => {
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { result: 'Good' }))).toContain('is not OK');
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { checks: { c1: 'Yes' } }))).toContain('not Pass or Fail');
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { checks: { r1: 'wide' } }))).toContain('not a number');
  });

  it('no access with no reason, or with checks filled in', async () => {
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { result: 'No access' }))).toContain('no reason');
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { result: 'No access', no_access_reason: 'No answer', checks: { c1: 'Pass' } }))).toContain('is filled in');
  });

  it('two rows for one door on one day', async () => {
    expect(await refusalsOf((f) => {
      visit(f, 'G/A/01');
      const spare = f.row('G/A/03') + 1;
      f.set(spare, 'ref', 'G/A/01'); f.set(spare, 'date', new Date(Date.UTC(2026, 9, 4))); f.set(spare, 'result', 'OK');
    })).toContain('two rows');
  });

  it('a door not covered by the planned obligation', async () => {
    expect(await refusalsOf((f) => visit(f, 'G/A/01'), { scopeIdsFor: () => new Set(['d2']) })).toContain('not covered');
  });

  it('a check that no longer exists', async () => {
    expect(await refusalsOf((f) => visit(f, 'G/A/01', { checks: { c2: 'Pass' } }), { defsFor: () => defs.filter((d) => d.id !== 'c2') })).toContain('no longer exists');
  });

  it('a file that is not a portal template, or whose obligation has gone', async () => {
    expect(await refusalsOf((f) => visit(f, 'G/A/01'), { obligations: [] })).toContain('no longer exists');
    const read = await filled(() => {});
    read.survey.template_version = 'something else';
    expect(checkSurvey(read, ctx()).refusals[0].text).toContain('not a portal survey template');
  });

  it('a survey with no firm', async () => {
    const read = await filled((f) => visit(f, 'G/A/01'), { survey: { firm: '' } });
    expect(checkSurvey(read, ctx()).refusals.map((r) => r.text)).toContain('Surveying firm is empty on the Survey sheet.');
  });
});

describe('checkSurvey — warned, then allowed', () => {
  it('a Fail on an OK row, and a Failed row with no Fail', async () => {
    const read = await filled((f) => {
      visit(f, 'G/A/01', { checks: { c1: 'Fail' } });
      visit(f, 'G/A/02', { result: 'Failed' });
    });
    const { refusals, warnings } = checkSurvey(read, ctx());
    expect(refusals).toEqual([]);
    expect(warnings.join(' ')).toMatch(/Fail but a Result of OK/);
    expect(warnings.join(' ')).toMatch(/no check marked Fail/);
  });

  it('a result older than the status held does not change it', async () => {
    const read = await filled((f) => visit(f, 'G/A/01', { result: 'Failed', checks: { c1: 'Fail' } }));
    const { warnings, summary } = checkSurvey(read, ctx({ heldSince: () => '2026-11-01T09:00:00Z' }));
    expect(warnings.join(' ')).toContain('older than the status');
    expect(summary.statusChanges).toEqual({});
  });

  it('a check added since the template was made', async () => {
    const extra = { id: 'c9', name: 'Signage', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 40 };
    const read = await filled((f) => visit(f, 'G/A/01'));
    expect(checkSurvey(read, ctx({ defsFor: () => [...defs, extra] })).warnings.join(' ')).toContain('Signage was added');
  });

  it('a label changed since the template was made', async () => {
    const read = await filled((f) => visit(f, 'G/A/01'));
    const renamed = new Map(doors.map((d) => [d.id, d.id === 'd1' ? { ...d, label: '1a' } : d]));
    expect(checkSurvey(read, ctx({ componentById: renamed })).warnings.join(' ')).toContain('G/A/01');
  });
});

describe('reading cells', () => {
  it('reads dates however they were typed', () => {
    expect(readDate(new Date(Date.UTC(2026, 9, 4)))).toBe('2026-10-04');
    expect(readDate('04/10/2026')).toBe('2026-10-04');
    expect(readDate('2026-10-04')).toBe('2026-10-04');
    expect(readDate(46299)).toBe('2026-10-04');
    expect(readDate('sometime')).toBeNull();
  });

  it('reads times however they were typed', () => {
    expect(readTime('10:15')).toBe('10:15');
    expect(readTime('9.05')).toBe('09:05');
    expect(readTime(0.4270833333)).toBe('10:15');
    expect(readTime(new Date(Date.UTC(1899, 11, 30, 10, 15)))).toBe('10:15');
    expect(readTime('')).toBe('');
    expect(readTime('25:00')).toBeNull();
  });
});
