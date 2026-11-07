// src/lib/apps/inspection/utils/resultsSheet.test.js

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { resultsSheetModel, buildResultsWorkbook, TEMPLATE_VERSION } from './resultsSheet.js';

const CHECKS = [
  { id: 'c1', name: 'Self Closing', display_type: 'checkbox', order: 30, visible: true, help: 'Let it go' },
  { id: 'c2', name: 'Hinges', display_type: 'checkbox', order: 50, visible: true },
  { id: 'r1', name: 'Gap Top mm', display_type: 'number', order: 60, visible: true },
];
const door = (over = {}) => ({
  component_id: 'd1',
  as_recorded: {
    ref: '1/A/05', fixed: [{ id: 'rt', name: 'Rating', value: 'Nominal FD60' }], checks_set: 's',
    component: { label: '12a', floor: '1', floor_name: 'First Floor', type_code: 'door', type_name: 'Apartment Door' },
  },
  recorded_checks: CHECKS, inspection_result: 'failed', inspected_at: '2026-10-04T09:15:00Z',
  checklist_results: { c1: false }, readings: { r1: 5 }, inspector_notes: 'Failed: Self Closing',
  ...over,
});
const session = { id: 's1', definition_id: 'ob1', inspector_name: 'A Person' };
const lookups = { obligationOf: () => ({ name: 'Fire door checks' }), generatedAt: 'now' };
const cell = (sheet, row, key) => row[sheet.columns.findIndex((c) => c.key === key)];

describe('resultsSheetModel', () => {
  it('gives a row of what was recorded', () => {
    const { sheets } = resultsSheetModel([{ session, rows: [door()] }], lookups);
    const [sheet] = sheets;
    const [row] = sheet.rows;
    expect(sheet.name).toBe('Results');
    expect(cell(sheet, row, 'ref')).toBe('1/A/05');
    expect(cell(sheet, row, 'label')).toBe('12a');
    expect(cell(sheet, row, 'fixed:rt')).toBe('Nominal FD60');
    expect(cell(sheet, row, 'date')).toBe('2026-10-04');
    expect(cell(sheet, row, 'time')).toBe('10:15');            // London, in October
    expect(cell(sheet, row, 'seen_by')).toBe('A Person');
    expect(cell(sheet, row, 'result')).toBe('Failed');
    expect(cell(sheet, row, 'c1')).toBe('Fail');
    expect(cell(sheet, row, 'r1')).toBe(5);
    expect(cell(sheet, row, 'notes')).toBe('Failed: Self Closing');
  });

  it('leaves a check not carried out empty, never a pass', () => {
    const [sheet] = resultsSheetModel([{ session, rows: [door()] }], lookups).sheets;
    expect(cell(sheet, sheet.rows[0], 'c2')).toBe('');
  });

  it('gives a no-access row its reason and no answers', () => {
    const rows = [door({ inspection_result: 'no_access', no_access_reason: 'no_answer', checklist_results: {}, readings: {} })];
    const [sheet] = resultsSheetModel([{ session, rows }], lookups).sheets;
    expect(cell(sheet, sheet.rows[0], 'result')).toBe('No access');
    expect(cell(sheet, sheet.rows[0], 'no_access_reason')).toBe('No answer');
    expect(cell(sheet, sheet.rows[0], 'c1')).toBe('');
  });

  it('shows each visit to a door as its own row, oldest first', () => {
    const rows = [door({ inspected_at: '2026-10-06T09:00:00Z' }), door({ inspected_at: '2026-10-02T09:00:00Z' })];
    const [sheet] = resultsSheetModel([{ session, rows }], lookups).sheets;
    expect(sheet.rows.map((r) => cell(sheet, r, 'date'))).toEqual(['2026-10-02', '2026-10-06']);
  });

  it('keeps one column for a reworded check, under its newest name', () => {
    const older = CHECKS.map((c) => (c.id === 'c1' ? { ...c, name: 'Closer' } : c));
    const rows = [door({ recorded_checks: older, inspected_at: '2026-10-01T09:00:00Z' }), door({ inspected_at: '2026-10-02T09:00:00Z' })];
    const [sheet] = resultsSheetModel([{ session, rows }], lookups).sheets;
    expect(sheet.columns.filter((c) => c.key === 'c1')).toEqual([{ key: 'c1', heading: 'Self Closing' }]);
  });

  it('keeps an answer whose check has gone', () => {
    const rows = [door({ checklist_results: { gone: true } })];
    const [sheet] = resultsSheetModel([{ session, rows }], lookups).sheets;
    expect(cell(sheet, sheet.rows[0], 'gone')).toBe('Pass');
  });

  it('gives each type its own sheet', () => {
    const other = door({ as_recorded: { ref: 'G/L/1', fixed: [], component: { type_code: 'light', type_name: 'Light' } } });
    const { sheets } = resultsSheetModel([{ session, rows: [door(), other] }], lookups);
    expect(sheets.map((s) => s.name).sort()).toEqual(['Apartment Door', 'Light']);
  });

  it('says so where names are today’s', () => {
    const rows = [{ component_id: 'd1', inspection_result: 'ok', inspected_at: '2026-10-04T09:15:00Z', type_code: 'door', floor_name: '1', asset_id: '05' }];
    const model = resultsSheetModel([{ session, rows }], { ...lookups, typeOf: () => ({ initial: 'A', name: 'Apartment Door' }) });
    expect(model.survey.find(([k]) => k === 'Please note')[1]).toContain('1 result was');
    expect(cell(model.sheets[0], model.sheets[0].rows[0], 'ref')).toBe('1/A/05');
  });

  it('names the source and the planned obligation', () => {
    const { survey } = resultsSheetModel([{ session, rows: [door()] }], lookups);
    const value = (k) => survey.find(([key]) => key === k)[1];
    expect(value('Template version')).toBe(TEMPLATE_VERSION);
    expect(value('Source')).toBe('In-house walk');
    expect(value('Planned obligation id')).toBe('ob1');
    expect(value('What this covers')).toBe('Fire door checks');
  });
});

describe('buildResultsWorkbook', () => {
  it('writes a file that opens, with ids in the hidden row', async () => {
    const buffer = await buildResultsWorkbook(resultsSheetModel([{ session, rows: [door()] }], lookups));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Survey', 'Results', 'Checks', 'Components']);
    const ws = wb.getWorksheet('Results');
    expect(ws.getRow(1).hidden).toBe(true);
    expect(ws.getRow(1).values).toContain('c1');
    expect(ws.getRow(2).values).toContain('Self Closing');
    expect(ws.getRow(3).values).toContain('1/A/05');
    expect(wb.getWorksheet('Components').state).toBe('hidden');
    expect(wb.getWorksheet('Checks').getRow(2).values).toContain('Let it go');
  });
});
