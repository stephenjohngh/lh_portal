// src/lib/apps/compliance/utils/registerExport.test.js
//
// TYPE-1. Reads the REAL register rather than fixtures — a fixture transcribing
// register data is what broke tests four rounds running here.

import { describe, it, expect } from 'vitest';
import { STATUTORY_TEMPLATE } from '$lib/utils/statutoryTemplate.js';
import { REGISTER_COLUMNS, PROVENANCE_COLUMNS } from '$lib/utils/registerRowMapping.js';
import { filterRegister, REGISTER_STATUS_LABEL } from './registerFilter.js';
import { buildRegisterSheet, EXPORT_COLUMNS, STATUS_FILL } from './registerExport.js';

const noCtx = { coveredKeys: new Set(), dismissedKeys: new Set() };
const allRows = () => filterRegister(STATUTORY_TEMPLATE, {}, noCtx);

describe('⛔ every register field reaches the spreadsheet', () => {
  it('carries all 35 register columns plus provenance and status', () => {
    // The point of exporting to a spreadsheet is that the reader decides what
    // matters. A field quietly missing here is one they cannot get back — and
    // the register has twice acquired a field nothing downstream read.
    const keys = EXPORT_COLUMNS.map(c => c.key);
    for (const column of REGISTER_COLUMNS) expect(keys, column).toContain(column);
    for (const column of PROVENANCE_COLUMNS) expect(keys, column).toContain(column);
    expect(keys[0]).toBe('status');
    expect(keys).toHaveLength(REGISTER_COLUMNS.length + PROVENANCE_COLUMNS.length + 1);
  });

  it('gives every column a human header, never a raw column name', () => {
    for (const { key, header } of EXPORT_COLUMNS) {
      expect(header, key).toBeTruthy();
      expect(header, key).not.toMatch(/_/);
    }
  });

  it('every header is distinct — two columns with one name is unreadable', () => {
    const headers = EXPORT_COLUMNS.map(c => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });
});

describe('buildRegisterSheet', () => {
  it('builds one row per row shown, with a cell per column', () => {
    const rows = allRows();
    const sheet = buildRegisterSheet(rows);
    expect(sheet.rows).toHaveLength(STATUTORY_TEMPLATE.length);
    expect(sheet.headers).toHaveLength(EXPORT_COLUMNS.length);
    for (const r of sheet.rows) expect(r).toHaveLength(EXPORT_COLUMNS.length);
  });

  it('exports what was FILTERED, not the whole register', () => {
    const shown = filterRegister(STATUTORY_TEMPLATE, { basis: new Set(['contract']) }, noCtx);
    const sheet = buildRegisterSheet(shown);
    expect(sheet.rows.length).toBe(shown.length);
    expect(sheet.rows.length).toBeLessThan(STATUTORY_TEMPLATE.length);
  });

  it('prints the status as the label the screen shows', () => {
    const sheet = buildRegisterSheet(allRows());
    const statuses = new Set(sheet.rows.map(r => r[0]));
    for (const s of statuses) expect(Object.values(REGISTER_STATUS_LABEL)).toContain(s);
  });

  it('⚠ never writes "null" or "undefined" into a cell', () => {
    // A spreadsheet saying "null" looks like data. Absent must be empty.
    for (const row of buildRegisterSheet(allRows()).rows) {
      for (const cell of row) {
        expect(typeof cell === 'string' || typeof cell === 'number').toBe(true);
        expect(String(cell)).not.toMatch(/^(null|undefined)$/);
        expect(String(cell)).not.toMatch(/\[object Object\]/);
      }
    }
  });

  it('renders a boolean flag as Yes or blank, never TRUE/FALSE', () => {
    const col = EXPORT_COLUMNS.findIndex(c => c.key === 'operationally_incomplete');
    const values = new Set(buildRegisterSheet(allRows()).rows.map(r => r[col]));
    expect([...values].sort()).toEqual(['', 'Yes']);
  });

  it('renders a proposed scope in words rather than as JSON', () => {
    const col = EXPORT_COLUMNS.findIndex(c => c.key === 'suggested_scope');
    const scoped = buildRegisterSheet(allRows()).rows.map(r => r[col]).filter(Boolean);
    expect(scoped.length).toBe(STATUTORY_TEMPLATE.filter(e => e.suggestedScope).length);
    for (const s of scoped) expect(s).not.toMatch(/[{}[\]"]/);
  });

  it('takes provenance from the caller, defaulting to the shipped seed', () => {
    const rows = allRows().slice(0, 1);
    const key = rows[0].entry.key;
    const originCol = EXPORT_COLUMNS.findIndex(c => c.key === 'origin');
    const editedCol = EXPORT_COLUMNS.findIndex(c => c.key === 'seed_modified_at');

    expect(buildRegisterSheet(rows).rows[0][originCol]).toBe('seed');
    const withProv = buildRegisterSheet(rows, k => (
      k === key ? { origin: 'local', seedModifiedAt: '2026-09-19' } : {}
    ));
    expect(withProv.rows[0][originCol]).toBe('local');
    expect(withProv.rows[0][editedCol]).toBe('2026-09-19');
  });

  it('survives an empty selection rather than throwing', () => {
    const sheet = buildRegisterSheet([]);
    expect(sheet.rows).toEqual([]);
    expect(sheet.headers.length).toBeGreaterThan(0);
  });
});

describe('the status palette', () => {
  it('has a colour for every status the sheet can print', () => {
    for (const label of Object.values(REGISTER_STATUS_LABEL)) {
      expect(STATUS_FILL[label], label).toMatch(/^FF[0-9A-F]{6}$/);
    }
  });

  it('⛔ colours "Added — needs scope" exactly as "Not covered"', () => {
    // It is a work queue, not a softer kind of covered. Shading it amber
    // between red and green would rebuild on a page the very distinction the
    // status function exists to prevent — the `assured` vs `ok` argument again.
    expect(STATUS_FILL[REGISTER_STATUS_LABEL.awaiting_setup])
      .toBe(STATUS_FILL[REGISTER_STATUS_LABEL.not_covered]);
  });

  it('never colours a gap the same as scheduled', () => {
    expect(STATUS_FILL[REGISTER_STATUS_LABEL.not_covered])
      .not.toBe(STATUS_FILL[REGISTER_STATUS_LABEL.scheduled]);
  });
});
