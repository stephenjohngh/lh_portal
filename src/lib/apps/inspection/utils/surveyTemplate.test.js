// src/lib/apps/inspection/utils/surveyTemplate.test.js

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  surveyTemplateModel, buildSurveyTemplateWorkbook, exampleRows, spareRowsFor, columnLetter, surveyTemplateFilename,
} from './surveyTemplate.js';
import { resultsSheetModel, TEMPLATE_VERSION } from './resultsSheet.js';

const types = [
  { id: 't-door', code: 'door', name: 'Apartment Door', initial: 'A' },
  { id: 't-light', code: 'light', name: 'Emergency Light', initial: 'L' },
];
const floors = [
  { id: 'fG', short_name: 'G', name: 'Ground Floor', level_order: 0 },
  { id: 'f1', short_name: '1', name: 'First Floor', level_order: 1 },
];
const doorDefs = [
  { id: 'rt', name: 'Rating', checkable: false, visible: true, display_type: 'dropdown', default_value: 'Nominal FD60', presentation_order: 1 },
  { id: 'hid', name: 'Internal note', checkable: false, visible: false, display_type: 'text', presentation_order: 2 },
  { id: 'c2', name: 'Hinges', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 20 },
  { id: 'c1', name: 'Self Closing', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 10, help_notes: 'Let it go' },
  { id: 'r1', name: 'Gap Top mm', checkable: true, visible: true, display_type: 'number', presentation_order: 30 },
  { id: 'off', name: 'Retired check', checkable: true, visible: false, display_type: 'checkbox', presentation_order: 40 },
];
const lightDefs = [{ id: 'l1', name: 'Lamp works', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 1 }];
const attrDefs = { 't-door': doorDefs, 't-light': lightDefs };
const doors = [
  { id: 'd2', type_code: 'door', floor_id: 'f1', asset_id: '01', label: '9', inspection_sort_order: 1 },
  { id: 'd1', type_code: 'door', floor_id: 'fG', asset_id: '02', label: '2', inspection_sort_order: 2 },
  { id: 'd0', type_code: 'door', floor_id: 'fG', asset_id: '01', label: '1', inspection_sort_order: 3 },
  { id: 'dx', type_code: 'door', floor_id: 'fG', asset_id: '99', label: 'cupboard', inspection_sort_order: 0 },
];
const lights = [{ id: 'l1c', type_code: 'light', floor_id: 'fG', asset_id: '07', label: 'L7' }];
const componentAttrs = { d2: [{ type_attribute_id: 'rt', value: 'FD30' }] };
const obligation = { id: 'ob1', name: 'Fire door checks', scope: { typeCodes: ['door'] } };
const base = { obligation, components: [...doors, ...lights], types, floors, attrDefs, componentAttrs, generatedAt: 'now' };

const model = (over = {}) => {
  const r = surveyTemplateModel({ ...base, ...over });
  if (!r.ok) throw new Error(r.reason);
  return r.model;
};

describe('surveyTemplateModel', () => {
  it('refuses with no obligation, no scope, or nothing in scope', () => {
    expect(surveyTemplateModel({ ...base, obligation: null }).ok).toBe(false);
    expect(surveyTemplateModel({ ...base, obligation: { ...obligation, scope: {} } })).toMatchObject({ ok: false, reason: expect.stringContaining('no scope') });
    expect(surveyTemplateModel({ ...base, obligation: { ...obligation, scope: { typeCodes: ['lift'] } } }).ok).toBe(false);
  });

  it('lists every component in scope, floor first, then walk order, and leaves out internal ones', () => {
    const [sheet] = model().sheets;
    expect(sheet.rows.map((r) => r.componentId)).toEqual(['d1', 'd0', 'd2']);
    expect(sheet.rows[0]).toMatchObject({ ref: 'G/A/02', label: '2', floor: 'Ground Floor' });
  });

  it('gives a column for each visible check in walk order, never a hidden one', () => {
    const [sheet] = model().sheets;
    expect(sheet.columns.filter((c) => c.check).map((c) => c.heading)).toEqual(['Self Closing', 'Hinges', 'Gap Top mm']);
  });

  it('shows the fixed details on record, the stored value or else the default', () => {
    const [sheet] = model().sheets;
    expect(sheet.columns.filter((c) => c.key.startsWith('fixed:')).map((c) => c.heading)).toEqual(['Rating on record']);
    expect(sheet.rows.map((r) => r.fixed[0].value)).toEqual(['Nominal FD60', 'Nominal FD60', 'FD30']);
  });

  it('gives each type its own Results sheet', () => {
    const m = model({ obligation: { ...obligation, scope: { typeCodes: ['door', 'light'] } } });
    expect(m.sheets.map((s) => s.name)).toEqual(['Apartment Door', 'Emergency Light']);
    expect(m.survey.find((l) => l.key === 'results_sheets').value).toBe('Apartment Door, Emergency Light');
  });

  it('names the template version and the planned obligation', () => {
    const { survey } = model();
    const v = (k) => survey.find((l) => l.key === k).value;
    expect(v('template_version')).toBe(TEMPLATE_VERSION);
    expect(v('obligation_id')).toBe('ob1');
    expect(survey.filter((l) => l.ask).map((l) => l.key)).toEqual(['firm', 'survey_ref', 'lead', 'report_file', 'survey_notes']);
  });

  it('uses the same column ids as the results spreadsheet for the same checks', () => {
    const [tmpl] = model().sheets;
    const recorded = doorDefs.filter((d) => d.checkable && d.visible).map((d) => ({ ...d, order: d.presentation_order }));
    const row = {
      component_id: 'd1', recorded_checks: recorded, inspection_result: 'ok', inspected_at: '2026-10-04T09:00:00Z',
      checklist_results: {}, readings: {},
      as_recorded: { ref: 'G/A/02', fixed: [{ id: 'rt', name: 'Rating', value: 'Nominal FD60' }], component: { type_code: 'door', type_name: 'Apartment Door' } },
    };
    const [res] = resultsSheetModel([{ session: { id: 's' }, rows: [row] }], { generatedAt: 'now' }).sheets;
    expect(tmpl.columns.map((c) => c.key)).toEqual(res.columns.map((c) => c.key));
  });

  it('leaves spare rows for second visits', () => {
    expect(spareRowsFor(3)).toBe(20);
    expect(spareRowsFor(71)).toBe(36);
    expect(spareRowsFor(5000)).toBe(200);
  });
});

describe('exampleRows', () => {
  it('shows a pass, a fail and a no-access, with nothing recorded on the no-access row', () => {
    const [sheet] = model().sheets;
    const rows = exampleRows(sheet);
    const at = (row, key) => row[sheet.columns.findIndex((c) => c.key === key)];
    expect(rows.map((r) => at(r, 'result'))).toEqual(['OK', 'Failed', 'No access']);
    expect(at(rows[1], 'c1')).toBe('Fail');
    expect(at(rows[2], 'c1')).toBe('');
    expect(at(rows[2], 'no_access_reason')).toBe('No answer');
  });
});

describe('helpers', () => {
  it('names columns as a spreadsheet does', () => {
    expect([0, 25, 26, 27, 51, 52].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });

  it('makes a safe file name', () => {
    expect(surveyTemplateFilename({ obligation: { name: 'Fire door checks — flat/entrance' } }, '2026-11-08'))
      .toBe('Survey_Template_Fire_door_checks_flat_entrance_2026-11-08.xlsx');
  });
});

describe('buildSurveyTemplateWorkbook', () => {
  it('writes a file that opens, laid out for a surveyor', async () => {
    const m = model();
    const buffer = await buildSurveyTemplateWorkbook(m);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Read me', 'Survey', 'Results', 'Example', 'Checks', 'Components']);
    expect(wb.getWorksheet('Components').state).toBe('hidden');

    const ws = wb.getWorksheet('Results');
    expect(ws.getRow(1).hidden).toBe(true);
    expect(ws.getRow(1).values).toEqual(expect.arrayContaining(['ref', 'c1', 'fixed:rt', 'source_ref']));
    expect(ws.getRow(3).getCell(1).value).toBe('G/A/02');
    expect(ws.getRow(5).getCell(4).value).toBe('FD30');

    // A spare row fills its given columns from the component chosen in column A.
    const spareRow = ws.getRow(3 + m.sheets[0].rows.length);
    expect(spareRow.getCell(2).value.formula).toContain('VLOOKUP($A6,Components!');
    expect(spareRow.getCell(4).value.formula).toMatch(/,5,FALSE/);

    const cp = wb.getWorksheet('Components');
    expect(cp.getRow(2).values).toEqual(expect.arrayContaining(['d1', 'G/A/02', 'Results', 'Nominal FD60']));
    expect(wb.getWorksheet('Checks').getRow(2).values).toEqual(expect.arrayContaining(['Self Closing', 'Let it go']));
    expect(wb.getWorksheet('Survey').getRow(3).values).toEqual(expect.arrayContaining(['ob1', 'obligation_id']));
  });
});

describe('a check that applies to only some components (migration 286)', () => {
  const emDefs = [
    { id: 'em', name: 'Emergency', checkable: false, visible: true, display_type: 'checkbox', presentation_order: 1 },
    { id: 'lit', name: 'Lit after mains off', checkable: true, visible: true, display_type: 'checkbox', presentation_order: 2,
      applies_when: [{ defName: 'Emergency', checkable: false, op: 'is_true' }] },
  ];
  const m = model({
    obligation: { id: 'ob2', name: 'Lights', scope: { typeCodes: ['light'] } },
    components: [{ id: 'a', type_code: 'light', floor_id: 'fG', asset_id: '1' }, { id: 'b', type_code: 'light', floor_id: 'fG', asset_id: '2' }],
    attrDefs: { 't-light': emDefs },
    componentAttrs: { a: [{ type_attribute_id: 'em', value: 'true' }] },
  });

  it('marks it N/A where it does not apply, and says so', async () => {
    const [sheet] = m.sheets;
    expect(sheet.rows.map((r) => r.notApplicable)).toEqual([[], ['lit']]);
    expect(m.readMe.some(([, t]) => t.startsWith('N/A'))).toBe(true);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildSurveyTemplateWorkbook(m));
    const ws = wb.getWorksheet('Results');
    const col = ws.getRow(1).values.indexOf('lit');
    expect([ws.getRow(3).getCell(col).value, ws.getRow(4).getCell(col).value]).toEqual([null, 'N/A']);
    expect(wb.getWorksheet('Checks').getRow(2).values).toContain('Only where Emergency is ticked');
  });
});

