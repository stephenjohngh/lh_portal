// src/lib/server/xlsxWorkbook.test.js
//
// TYPE-1. Document generation fails at runtime on things static analysis cannot
// see, so this builds real workbooks and reads the cells back — including one
// full round trip through `writeBuffer`, because a workbook that assembles and
// will not serialise is the failure mode that reaches a user.

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, xlsxFilename } from './xlsxWorkbook.js';

const detail = {
  headers: ['Status here', 'Requirement', 'Reference'],
  rows: [
    ['Not covered', 'Fire alarm — weekly test', 'BS 5839-1'],
    ['Scheduled here', 'Lift — thorough examination', 'LOLER reg 9(3)'],
  ],
};

const base = {
  building: 'Lancaster House',
  detail,
  sheetName: 'Register',
  reportTitle: 'Periodic activity register',
};

const sheet = (wb, name) => wb.getWorksheet(name);
const rowValues = (ws, n) => (ws.getRow(n).values ?? []).slice(1);

describe('the banner — what the file says about itself', () => {
  it('⛔ prints the filter summary and the generated date', () => {
    // Both used to arrive at the route and be DROPPED, so an extract said
    // nothing about being an extract. 14 rows of 116 is indistinguishable from
    // a register of 14 once the file is in somebody's inbox.
    const wb = buildWorkbook({
      ...base,
      filterSummary: 'Source: Legislation — 14 of 116',
      generatedAt: '19 September 2026',
    });
    const ws = sheet(wb, 'Register');
    expect(rowValues(ws, 1)[0]).toBe('Lancaster House — Periodic activity register');
    expect(rowValues(ws, 2)[0]).toContain('Source: Legislation — 14 of 116');
    expect(rowValues(ws, 2)[0]).toContain('Generated 19 September 2026');
  });

  it('puts the headers below the banner, not in row 1', () => {
    const wb = buildWorkbook({ ...base, filterSummary: 'x', generatedAt: 'y' });
    const ws = sheet(wb, 'Register');
    expect(rowValues(ws, 4)).toEqual(detail.headers);
    expect(rowValues(ws, 5)).toEqual(detail.rows[0]);
  });

  it('omits the context line entirely when there is nothing to say', () => {
    const ws = sheet(buildWorkbook(base), 'Register');
    expect(rowValues(ws, 3)).toEqual(detail.headers);
  });

  it('⚠ freezes and filters from the HEADER row, wherever it landed', () => {
    // The banner shifts it; a freeze left at row 1 would pin the title and
    // scroll the headers away, and the autofilter would filter the banner.
    const wb = buildWorkbook({ ...base, filterSummary: 'x' });
    const ws = sheet(wb, 'Register');
    // ⚠ Row 4: title, context, blank, headers. The header row MOVES depending
    // on whether there is a context line to print, which is exactly why the
    // freeze and the filter are computed from it rather than hardcoded.
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
    expect(ws.autoFilter.from.row).toBe(4);
    expect(ws.autoFilter.to.column).toBe(detail.headers.length);
  });
});

describe('the status palette comes from the caller', () => {
  const fillOf = (ws, row) => ws.getCell(row, 1).fill?.fgColor?.argb;

  it('colours the status column by the labels it was given', () => {
    const wb = buildWorkbook({
      ...base,
      statusFill: { 'Not covered': 'FFB91C1C', 'Scheduled here': 'FF15803D' },
    });
    const ws = sheet(wb, 'Register');
    expect(fillOf(ws, 4)).toBe('FFB91C1C');
    expect(fillOf(ws, 5)).toBe('FF15803D');
  });

  it('matches case-insensitively, so a palette may be keyed on stored values', () => {
    const wb = buildWorkbook({
      ...base,
      detail: { headers: ['Status'], rows: [['ok'], ['failed']] },
      statusFill: { OK: 'FF15803D', FAILED: 'FFB91C1C' },
    });
    // No context line here, so headers are row 3 and the data starts at 4.
    const ws = sheet(wb, 'Register');
    expect(fillOf(ws, 4)).toBe('FF15803D');
    expect(fillOf(ws, 5)).toBe('FFB91C1C');
  });

  it('⛔ colours nothing when no palette is supplied', () => {
    // It used to apply a hardcoded COMPONENT palette to any column called
    // "Status", which would silently mis-colour a list whose statuses mean
    // something else entirely.
    const ws = sheet(buildWorkbook(base), 'Register');
    expect(fillOf(ws, 4)).toBeUndefined();
  });

  it('leaves a status it has no colour for unstyled rather than guessing', () => {
    const wb = buildWorkbook({ ...base, statusFill: { 'Not covered': 'FFB91C1C' } });
    const ws = sheet(wb, 'Register');
    expect(fillOf(ws, 5)).toBeUndefined();
  });
});

describe('naming, and the sheets that are optional', () => {
  it('names the sheet and the workbook from the caller', () => {
    const wb = buildWorkbook(base);
    expect(wb.worksheets.map(w => w.name)).toEqual(['Register']);
    expect(wb.title).toBe('Lancaster House — Periodic activity register');
  });

  it('defaults to the components wording, so the original caller is unaffected', () => {
    const wb = buildWorkbook({ detail });
    expect(wb.worksheets[0].name).toBe('Components');
    expect(wb.title).toContain('Component Report');
  });

  it('adds summary sheets only when given pivots', () => {
    const pivot = [{ system_name: 'Fire', type_name: 'Door', ok: 1, problem: 0, failed: 0, inactive: 0, total: 1 }];
    const totals = { ok: 1, problem: 0, failed: 0, inactive: 0, total: 1 };
    const wb = buildWorkbook({
      ...base,
      fullSummary: { pivot, totals },
      floorSummaries: [{ floor: 'G — Ground', pivot, totals }],
    });
    expect(wb.worksheets.map(w => w.name)).toEqual(['Register', 'Full Summary', 'By Floor']);
  });

  it('builds a filename from the building and the stem', () => {
    const name = xlsxFilename('Lancaster House', 'Periodic Register');
    expect(name).toMatch(/^Lancaster_House_Periodic_Register_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe('refusals and the round trip', () => {
  it('refuses a payload with no columns rather than writing an empty file', () => {
    expect(() => buildWorkbook({ detail: { headers: [], rows: [] } }))
      .toThrow(/detail columns/i);
    expect(() => buildWorkbook({})).toThrow(/detail columns/i);
  });

  it('survives a row with missing and null cells', () => {
    const wb = buildWorkbook({
      ...base,
      detail: { headers: ['A', 'B', 'C'], rows: [['x', null, undefined], ['y']] },
    });
    expect(sheet(wb, 'Register').rowCount).toBeGreaterThanOrEqual(5);
  });

  it('⚠ actually serialises — a workbook that will not write is the real failure', async () => {
    const wb = buildWorkbook({ ...base, filterSummary: 'Source: Legislation — 2 of 116' });
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const ws = reopened.getWorksheet('Register');
    expect(rowValues(ws, 4)).toEqual(detail.headers);
    expect(rowValues(ws, 5)).toEqual(detail.rows[0]);
  });
});
